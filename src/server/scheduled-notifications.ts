import { createHash, randomUUID } from 'node:crypto'
import { FieldPath } from 'firebase-admin/firestore'
import type { DocumentReference, DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type webpush from 'web-push'
import { kstHour, pickKinds } from '../lib/notify.js'
import type { Lang } from '../lib/i18n.js'
import type { SubDoc } from './push.js'
import { validPushSubscription } from './push.js'
import {
  deliveryId, initialNotificationSlot, LEASE_MS, MAX_ATTEMPTS, messagesForSlot,
  notifySettings, recoverableSlots, RETENTION_MS, retryablePushError, retryDelay,
  RUN_BUDGET_MS, SEND_TIMEOUT_MS,
} from './notification-schedule.js'
import type { ScheduledMessage } from './notification-schedule.js'

type Services = { db: Firestore; webpush: Pick<typeof webpush, 'sendNotification'>; publicKey: string }
type DeliveryState = {
  status: 'sending' | 'retry' | 'sent' | 'failed'
  attempts: number
  owner: string
  leaseUntil: number
  nextAttemptAt: number
  expiresAt: Date
}
type RunState = { done?: boolean; cursor?: string | null; pending?: boolean; nextAttemptAt?: number }
export type NotificationReport = {
  sent: number; failed: number; pruned: number; skipped: number; pending: number
  abandoned: number; userFailures: number; scanned: number; busy: boolean
}
const PAGE_SIZE = 12
const MIN_SEND_BUDGET_MS = 7_000
const fingerprint = (sub: SubDoc) => createHash('sha256').update(JSON.stringify([sub.endpoint, sub.keys, sub.vapid])).digest('hex')

/** 외부 발송과 Firestore 기록을 하나의 transaction으로 묶을 수는 없다. */
async function finishDelivery(db: Firestore, ref: DocumentReference, owner: string, state: Partial<DeliveryState>): Promise<void> {
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref)
    if (snapshot.get('owner') !== owner) throw new Error('notification-lease-lost')
    tx.update(ref, { ...state, leaseUntil: 0 })
  }, { maxAttempts: 2 })
}

async function pruneSubscription(db: Firestore, snapshot: DocumentSnapshot, sub: SubDoc): Promise<void> {
  // 발송 중 다시 구독한 기기의 새 키를 이전 요청의 410 응답 때문에 지우지 않는다.
  await db.runTransaction(async tx => {
    const current = await tx.get(snapshot.ref)
    if (current.exists && fingerprint(current.data() as SubDoc) === fingerprint(sub)) tx.delete(snapshot.ref)
  }, { maxAttempts: 2 })
}

async function sendOnce(services: Services, snapshot: DocumentSnapshot, sub: SubDoc, slot: number,
  message: ScheduledMessage, owner: string, deadline: number, report: NotificationReport): Promise<boolean> {
  const { db, webpush } = services
  if (Date.now() >= message.expiresAt) { report.skipped++; return true }
  if (Date.now() + MIN_SEND_BUDGET_MS > deadline) return false
  const id = deliveryId(slot, snapshot.ref.path, fingerprint(sub), message.kind)
  const ref = db.doc(`notificationDeliveries/${id}`)
  const claim = await db.runTransaction(async tx => {
    const saved = await tx.get(ref)
    const state = saved.data() as DeliveryState | undefined
    const now = Date.now()
    if (state?.status === 'sent' || state?.status === 'failed') return 'finished' as const
    if (state && (state.leaseUntil > now || state.nextAttemptAt > now)) return 'waiting' as const
    const attempts = (state?.attempts ?? 0) + 1
    if (attempts > MAX_ATTEMPTS) {
      tx.update(ref, { status: 'failed', leaseUntil: 0 })
      return 'abandoned' as const
    }
    tx.set(ref, {
      status: 'sending', attempts, owner, leaseUntil: now + LEASE_MS, nextAttemptAt: 0,
      expiresAt: new Date(slot + RETENTION_MS),
    } satisfies DeliveryState)
    return attempts
  }, { maxAttempts: 2 })
  if (claim === 'finished') { report.skipped++; return true }
  if (claim === 'waiting') { report.pending++; return true }
  if (claim === 'abandoned') { report.abandoned++; report.failed++; return true }

  // claim 중에도 시간이 흐른다. TTL:0은 발송 취소가 아니므로 여기서 멈춘다.
  if (Date.now() >= message.expiresAt) {
    await finishDelivery(db, ref, owner, { status: 'failed' })
    report.skipped++
    return true
  }
  if (Date.now() + SEND_TIMEOUT_MS > deadline) {
    await finishDelivery(db, ref, owner, { status: 'retry', attempts: claim - 1, nextAttemptAt: Date.now() })
    return false
  }
  let error: unknown
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({
      ...message.copy, deliveryId: id,
    }), {
      timeout: SEND_TIMEOUT_MS,
      // 같은 사건의 재시도는 push 대기열/알림함에서 같은 항목으로 취급한다.
      topic: id.slice(0, 32),
      TTL: Math.max(0, Math.floor((message.expiresAt - Date.now()) / 1000)),
    })
  } catch (caught) { error = caught }

  if (!error) {
    // 이 쓰기가 실패하면 sending이 남는다. 다음 실행은 같은 ID로 최대3회까지 시도한다.
    // 이미 기기에 표시된 알림의 재표시까지 막는 exactly-once 보장은 아니다.
    try { await finishDelivery(db, ref, owner, { status: 'sent' }); report.sent++ }
    catch { report.failed++; report.pending++; console.error('Scheduled push receipt could not be recorded') }
    return true
  }

  const status = Number((error as { statusCode?: number })?.statusCode) || 0
  const dead = status === 404 || status === 410
  const retry = !dead && retryablePushError(error) && claim < MAX_ATTEMPTS
  try {
    if (dead) { await pruneSubscription(db, snapshot, sub); report.pruned++ }
    await finishDelivery(db, ref, owner, {
      status: retry ? 'retry' : 'failed', nextAttemptAt: retry ? Date.now() + retryDelay(claim) : 0,
    })
  } catch {
    // 삭제/기록의 결과가 불명인 경우 claim을 남겨 다음 실행에서 안전하게 재확인한다.
    report.failed++; report.pending++
    console.error('Scheduled push failure could not be recorded')
    return true
  }
  if (!dead) {
    report.failed++
    if (retry) report.pending++
    else report.abandoned++
    console.error('Scheduled push failed', { status, retry })
  }
  return true
}

/** TTL 과금/정책 설정 없이 이전 실행의 최소 기록을 작은 배치로 정리한다. */
async function pruneHistory(db: Firestore, now: number): Promise<void> {
  for (const name of ['notificationDeliveries', 'notificationRuns', 'pushTestLimits']) {
    const old = await db.collection(name).where('expiresAt', '<=', new Date(now)).limit(40).get()
    if (!old.empty) {
      const batch = db.batch()
      for (const doc of old.docs) batch.delete(doc.ref)
      await batch.commit()
    }
  }
}

export async function runScheduledNotifications(services: Services): Promise<NotificationReport> {
  const { db, publicKey } = services
  const started = Date.now()
  const configuredFirstSlot = initialNotificationSlot(started, process.env.NOTIFY_START_AT)
  const deadline = started + RUN_BUDGET_MS
  const owner = randomUUID()
  const control = db.doc('notificationScheduler/state')
  const report: NotificationReport = {
    sent: 0, failed: 0, pruned: 0, skipped: 0, pending: 0, abandoned: 0, userFailures: 0, scanned: 0, busy: false,
  }
  const firstSlot = await db.runTransaction(async tx => {
    const saved = await tx.get(control)
    const previous = saved.data()
    if ((previous?.leaseUntil ?? 0) > started || started - (previous?.lastAttemptAt ?? 0) < 30_000) return null
    const firstSlot = Number(previous?.firstSlot ?? configuredFirstSlot)
    tx.set(control, { firstSlot, owner, leaseUntil: started + LEASE_MS, lastAttemptAt: started })
    return firstSlot
  }, { maxAttempts: 2 })
  if (firstSlot === null) { report.busy = true; return report }

  try {
    await pruneHistory(db, started)
    for (const slot of recoverableSlots(started, firstSlot)) {
      if (Date.now() + MIN_SEND_BUDGET_MS > deadline) { report.pending++; break }
      const run = db.doc(`notificationRuns/${slot}`)
      const snapshot = await run.get()
      const saved = snapshot.data() as RunState | undefined
      if (saved?.done || (saved?.nextAttemptAt ?? 0) > started) continue
      let cursor = saved?.cursor ?? null
      let pending = saved?.pending ?? false
      let done = false
      let nextAttemptAt = 0
      const plans = new Map<string, Promise<ScheduledMessage[]>>()

      const planFor = (uid: string) => {
        let plan = plans.get(uid)
        if (!plan) {
          plan = (async () => {
            const settings = (await db.doc(`users/${uid}/settings/app`).get()).data() ?? {}
            const notify = notifySettings(settings.notify)
            const kinds = pickKinds(kstHour(new Date(slot)), notify)
            if (!kinds.length && notify.soonBefore === null) return []
            const dues: Date[] = []
            if (kinds.includes('morning') || notify.soonBefore !== null) {
              const tasks = await db.collection(`users/${uid}/tasks`).where('done', '==', false).select('due').get()
              for (const task of tasks.docs) {
                const due = task.get('due')
                if (due && typeof due.toDate === 'function') {
                  const date = due.toDate() as Date
                  if (Number.isFinite(date.getTime())) dues.push(date)
                }
              }
            }
            return messagesForSlot(slot, Date.now(), notify, (settings.lang === 'en' ? 'en' : 'ko') as Lang, dues)
          })()
          plans.set(uid, plan)
        }
        return plan
      }

      const processSubscription = async (subscription: DocumentSnapshot): Promise<boolean> => {
        report.scanned++
        const uid = subscription.ref.parent.parent?.id
        if (!uid || subscription.ref.path.split('/').length !== 4 || !subscription.ref.path.startsWith('users/')) return true
        try {
          const sub = subscription.data() as SubDoc
          if (!validPushSubscription(sub)) { report.failed++; return true }
          if (sub.vapid !== publicKey) { await pruneSubscription(db, subscription, sub); report.pruned++; return true }
          for (const message of await planFor(uid)) {
            if (!await sendOnce(services, subscription, sub, slot, message, owner, deadline, report)) return false
          }
          return true
        } catch {
          report.userFailures++; report.pending++
          console.error('Scheduled push account operation failed')
          return true
        }
      }

      while (Date.now() + MIN_SEND_BUDGET_MS <= deadline) {
        let query = db.collectionGroup('pushSubs').orderBy(FieldPath.documentId()).limit(PAGE_SIZE)
        if (cursor) query = query.startAfter(cursor)
        const page = await query.get()
        let stopped = false
        for (let index = 0; index < page.docs.length; index += 3) {
          if (Date.now() + MIN_SEND_BUDGET_MS > deadline) { stopped = true; break }
          const group = page.docs.slice(index, index + 3)
          const pendingBefore = report.pending
          const complete = await Promise.all(group.map(processSubscription))
          pending ||= report.pending > pendingBefore
          // 같은 묶음의 뒤 기기가 끝나도 앞의 미완료 기기를 커서로 건너뛰지 않는다.
          for (let i = 0; i < group.length; i++) {
            if (!complete[i]) { stopped = true; break }
            cursor = group[i].ref.path
          }
          if (stopped) break
        }
        if (stopped) break
        if (page.size < PAGE_SIZE) {
          done = !pending
          cursor = null
          nextAttemptAt = pending ? Date.now() + 60_000 : 0
          pending = false
          break
        }
      }
      await run.set({ done, cursor, pending, nextAttemptAt, expiresAt: new Date(slot + RETENTION_MS) })
      if (!done) report.pending++
    }
  } finally {
    await db.runTransaction(async tx => {
      const saved = await tx.get(control)
      if (saved.get('owner') === owner) tx.update(control, { leaseUntil: 0 })
    }, { maxAttempts: 2 })
  }
  return report
}
