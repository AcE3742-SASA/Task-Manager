import { createHash } from 'node:crypto'
import { countDue, countDueSoon, DEFAULT_NOTIFY, dueSoonCopy, kstHour, notifyCopy, pickKinds } from '../lib/notify.js'
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
  // 새 정각 알림을 먼저 보낸 뒤, 직전 정각의 미처리 작업을 복구한다.
  return [current, current - HOUR].filter(slot => slot >= firstSlot && now - slot <= CATCH_UP_MS)
}

export function notifySettings(value: unknown = {}): Notify {
  const raw = value && typeof value === 'object' ? value as Partial<Notify> : {}
  const hour = (value: unknown, fallback: number | null) =>
    value === null ? null : Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23 ? Number(value) : fallback
  return {
    morningHour: hour(raw.morningHour, DEFAULT_NOTIFY.morningHour),
    eveningHour: hour(raw.eveningHour, DEFAULT_NOTIFY.eveningHour),
    soonBefore: typeof raw.soonBefore === 'number' && [1, 2, 3, 6, 12].includes(raw.soonBefore) ? raw.soonBefore : DEFAULT_NOTIFY.soonBefore,
  }
}

export type ScheduledMessage = { kind: 'morning' | 'evening' | 'soon'; copy: Copy; expiresAt: number }

export function messagesForSlot(slot: number, now: number, notify: Notify, lang: Lang, dues: Date[]): ScheduledMessage[] {
  if (slot > now || now - slot > CATCH_UP_MS) return []
  const messages: ScheduledMessage[] = pickKinds(kstHour(new Date(slot)), notify).map(kind => ({
    kind,
    expiresAt: slot + CATCH_UP_MS,
    // 지연 복구 중 날짜가 바뀌었다면 알림의 '오늘'은 실제 전송일이다.
    copy: notifyCopy(kind, lang, countDue(dues, new Date(now))),
  }))
  if (notify.soonBefore !== null) {
    // 정각 버킷의 기존 동작은 유지하되, 이미 마감이 지난 알림은 되살리지 않는다.
    const soon = dues.filter(due => due.getTime() > now && countDueSoon([due], new Date(slot), notify.soonBefore as number) > 0)
    if (soon.length) messages.push({
      kind: 'soon', copy: dueSoonCopy(lang, soon.length),
      expiresAt: Math.min(slot + CATCH_UP_MS, ...soon.map(due => due.getTime())),
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
