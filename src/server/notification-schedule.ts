import { createHash } from 'node:crypto'
import { countDue, DEFAULT_NOTIFY, dueSoonCopy, dueSoonHours, kstHour, notifyCopy, pickKinds } from '../lib/notify.js'
import type { Copy, Notify } from '../lib/notify.js'
import type { Lang } from '../lib/i18n.js'

export const HOUR = 3_600_000
export const CATCH_UP_MS = 90 * 60_000
export const RETENTION_MS = 48 * HOUR
export const MAX_ATTEMPTS = 3
export const LEASE_MS = 60_000
export const RUN_BUDGET_MS = 18_000
export const SEND_TIMEOUT_MS = 5_000

export const hourSlot = (now: number) => Math.floor(now / HOUR) * HOUR

/** 최초 전환 때 기존 스케줄러가 이미 보낸 시간대를 다시 발송하지 않도록 시작 정각을 지정한다. */
export function initialNotificationSlot(now: number, startAt?: string): number {
  if (!startAt) return hourSlot(now)
  const start = Date.parse(startAt)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(startAt) || !Number.isFinite(start)) {
    throw new Error('invalid-notification-start-at')
  }
  return Math.max(hourSlot(now), Math.ceil(start / HOUR) * HOUR)
}

/** KST도 정각 경계는 UTC와 같다. 첫 설치 전에 놓친 알림을 소급해서 보내지 않는다. */
export function recoverableSlots(now: number, firstSlot: number): number[] {
  const current = hourSlot(now)
  // 시간대 끝의 분 단위 예약도 90분 동안 복구한다.
  return [current, current - HOUR, current - 2 * HOUR]
    .filter(slot => slot >= firstSlot && now - (slot + HOUR) < CATCH_UP_MS)
}

export function notifySettings(value: unknown = {}): Notify {
  const raw = value && typeof value === 'object' ? value as Partial<Notify> : {}
  const hour = (value: unknown, fallback: number | null) =>
    value === null ? null : Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23 ? Number(value) : fallback
  return {
    morningHour: hour(raw.morningHour, DEFAULT_NOTIFY.morningHour),
    eveningHour: hour(raw.eveningHour, DEFAULT_NOTIFY.eveningHour),
    soonBefore: Array.isArray(raw.soonBefore) ? dueSoonHours(raw.soonBefore)
      : dueSoonHours(raw.soonBefore)[0] ?? DEFAULT_NOTIFY.soonBefore,
  }
}

export type ScheduledMessage = { kind: 'morning' | 'evening' | 'soon'; copy: Copy; scheduledAt: number; expiresAt: number }

export function messagesForSlot(slot: number, now: number, notify: Notify, lang: Lang, dues: Date[], through = now): ScheduledMessage[] {
  if (slot > now || slot > through) return []
  const kinds = now - slot <= CATCH_UP_MS ? pickKinds(kstHour(new Date(slot)), notify) : []
  const messages: ScheduledMessage[] = kinds.map(kind => ({
    kind, scheduledAt: slot,
    expiresAt: slot + CATCH_UP_MS,
    // 지연 복구 중 날짜가 바뀌었다면 알림의 '오늘'은 실제 전송일이다.
    copy: notifyCopy(kind, lang, countDue(dues, new Date(now))),
  }))
  const leadHours = dueSoonHours(notify.soonBefore)
  const groups = new Map<number, number[]>()
  for (const due of dues) {
    if (due.getTime() <= now) continue
    for (const hours of leadHours) {
      const scheduledAt = due.getTime() - Math.round(hours * 60) * 60_000
      if (scheduledAt < slot || scheduledAt >= slot + HOUR || scheduledAt > Math.min(now, through)
        || now - scheduledAt > CATCH_UP_MS) continue
      const group = groups.get(scheduledAt) ?? []
      group.push(due.getTime())
      groups.set(scheduledAt, group)
    }
  }
  for (const [scheduledAt, deadlines] of [...groups].sort(([a], [b]) => b - a)) {
    messages.push({
      kind: 'soon', scheduledAt, copy: dueSoonCopy(lang, deadlines.length),
      expiresAt: Math.min(scheduledAt + CATCH_UP_MS, ...deadlines),
    })
  }
  return messages
}

/** 문서 경로/기기 키를 외부로 노출하지 않는, 같은 사건에 대한 안정적인 ID. */
export function deliveryId(slot: number, subscriptionPath: string, fingerprint: string, kind: ScheduledMessage['kind']): string {
  return createHash('sha256').update(JSON.stringify([slot, subscriptionPath, fingerprint, kind])).digest('hex')
}

export function retryablePushError(error: unknown): boolean {
  const status = Number((error as { statusCode?: number } | null)?.statusCode)
  return !status || status === 408 || status === 429 || status >= 500
}

export const retryDelay = (attempt: number) => attempt === 1 ? 60_000 : 3 * 60_000
