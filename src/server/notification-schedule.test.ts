import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFY } from '../lib/notify'
import {
  CATCH_UP_MS, HOUR, deliveryId, hourSlot, messagesForSlot,
  notifySettings, recoverableSlots, retryablePushError, retryDelay,
} from './notification-schedule'

const at = (iso: string) => Date.parse(iso)
const date = (iso: string) => new Date(iso)
const disabled = { morningHour: null, eveningHour: null, soonBefore: null }

describe('recoverable notification hours', () => {
  const current = at('2026-09-18T22:00:00Z') // 9/19 07:00 KST

  it('starts with the current hour and never recovers a slot before first installation', () => {
    expect(hourSlot(current + 45 * 60_000)).toBe(current)
    expect(recoverableSlots(current + 20 * 60_000, current)).toEqual([current])
    expect(recoverableSlots(current, current + HOUR)).toEqual([])
  })

  it('prioritizes this hour and includes only the previous recoverable hour', () => {
    expect(recoverableSlots(current, current - 24 * HOUR)).toEqual([current, current - HOUR])
    expect(recoverableSlots(current + 30 * 60_000, current - 24 * HOUR)).toEqual([current, current - HOUR])
    expect(recoverableSlots(current + 30 * 60_000 + 1, current - 24 * HOUR)).toEqual([current])
  })

  it('uses continuous hour slots across KST midnight and a UTC date boundary', () => {
    for (const midnight of [at('2026-09-18T15:00:00Z'), at('2026-09-19T00:00:00Z')]) {
      expect(recoverableSlots(midnight + 10 * 60_000, midnight - HOUR)).toEqual([midnight, midnight - HOUR])
    }
  })
})

describe('stored notification settings', () => {
  it.each([undefined, null, 'invalid', 42, [], {}])('uses defaults for missing or invalid settings %j', value => {
    expect(notifySettings(value)).toEqual(DEFAULT_NOTIFY)
  })

  it('preserves disabled options and valid midnight/end-of-day hours', () => {
    expect(notifySettings(disabled)).toEqual(disabled)
    expect(notifySettings({ morningHour: 0, eveningHour: 23, soonBefore: 12 })).toEqual({
      morningHour: 0, eveningHour: 23, soonBefore: 12,
    })
  })

  it.each([-1, 24, 7.5, '7', true, NaN, Infinity])('rejects an invalid hour %j without coercion', value => {
    expect(notifySettings({ morningHour: value, eveningHour: value })).toEqual(DEFAULT_NOTIFY)
  })

  it('accepts only the supported lead-hour choices', () => {
    for (const soonBefore of [1, 2, 3, 6, 12]) expect(notifySettings({ soonBefore }).soonBefore).toBe(soonBefore)
    for (const soonBefore of [0, 4, 24, '2', NaN, Infinity]) expect(notifySettings({ soonBefore }).soonBefore).toBeNull()
  })
})

describe('messages and expiry for an hour slot', () => {
  const slot = at('2026-09-18T22:00:00Z') // 07:00 KST

  it('rejects future slots and slots beyond the recovery window', () => {
    expect(messagesForSlot(slot, slot - 1, DEFAULT_NOTIFY, 'ko', [])).toEqual([])
    expect(messagesForSlot(slot, slot + CATCH_UP_MS + 1, DEFAULT_NOTIFY, 'ko', [])).toEqual([])
  })

  it('keeps the original expiry when retried later', () => {
    const first = messagesForSlot(slot, slot, DEFAULT_NOTIFY, 'ko', [])
    const retried = messagesForSlot(slot, slot + 80 * 60_000, DEFAULT_NOTIFY, 'ko', [])
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ kind: 'morning', expiresAt: slot + CATCH_UP_MS })
    expect(retried[0].expiresAt).toBe(first[0].expiresAt)
    // The dispatcher must refuse to send at/after this expiry; planning does not extend it.
    expect(messagesForSlot(slot, slot + CATCH_UP_MS, DEFAULT_NOTIFY, 'ko', [])[0].expiresAt).toBe(slot + CATCH_UP_MS)
  })

  it('uses the actual send date for today/tomorrow when recovering after KST midnight', () => {
    const beforeMidnight = at('2026-09-18T14:00:00Z') // 9/18 23:00 KST
    const afterMidnight = at('2026-09-18T15:10:00Z') // 9/19 00:10 KST
    const messages = messagesForSlot(beforeMidnight, afterMidnight, { ...disabled, morningHour: 23 }, 'ko', [
      date('2026-09-18T14:59:00Z'), // overdue, retained in today's count
      date('2026-09-19T03:00:00Z'), // today
      date('2026-09-20T03:00:00Z'), // tomorrow
    ])
    expect(messages[0].copy.body).toBe('오늘 마감 2건 · 내일 1건')
  })

  it('keeps morning and evening messages distinct if both use the same hour', () => {
    const messages = messagesForSlot(slot, slot, { ...disabled, morningHour: 7, eveningHour: 7 }, 'en', [])
    expect(messages.map(message => message.kind)).toEqual(['morning', 'evening'])
    expect(messages[0].copy.body).toBe('Due today 0 · tomorrow 0')
    expect(messagesForSlot(slot, slot, disabled, 'ko', [])).toEqual([])
  })

  it('never revives a due-soon reminder whose deadline has already passed or is exactly now', () => {
    const now = slot + 80 * 60_000
    const messages = messagesForSlot(slot, now, { ...disabled, soonBefore: 1 }, 'ko', [
      new Date(slot - HOUR), new Date(slot + 65 * 60_000), new Date(now), new Date(slot + 85 * 60_000),
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ kind: 'soon', expiresAt: slot + 85 * 60_000 })
    expect(messages[0].copy.body).toBe('마감이 가까운 할 일 1건')
  })

  it('expires a group at its earliest deadline and caps distant deadlines at the recovery window', () => {
    const early = messagesForSlot(slot, slot, { ...disabled, soonBefore: 1 }, 'ko', [
      new Date(slot + 80 * 60_000), new Date(slot + 70 * 60_000),
    ])
    expect(early[0].expiresAt).toBe(slot + 70 * 60_000)
    const distant = messagesForSlot(slot, slot, { ...disabled, soonBefore: 2 }, 'ko', [new Date(slot + 2 * HOUR)])
    expect(distant[0].expiresAt).toBe(slot + CATCH_UP_MS)
  })
})

describe('delivery identity and retry classification', () => {
  it('keeps a stable opaque ID and separates hour, account/device, key rotation and message kind', () => {
    const slot = at('2026-09-18T22:00:00Z')
    const base = deliveryId(slot, 'users/account-a/pushSubs/device-a', 'key-a', 'morning')
    expect(base).toMatch(/^[a-f0-9]{64}$/)
    expect(deliveryId(slot, 'users/account-a/pushSubs/device-a', 'key-a', 'morning')).toBe(base)
    const ids = [base,
      deliveryId(slot + HOUR, 'users/account-a/pushSubs/device-a', 'key-a', 'morning'),
      deliveryId(slot, 'users/account-b/pushSubs/device-a', 'key-a', 'morning'),
      deliveryId(slot, 'users/account-a/pushSubs/device-b', 'key-a', 'morning'),
      deliveryId(slot, 'users/account-a/pushSubs/device-a', 'key-b', 'morning'),
      deliveryId(slot, 'users/account-a/pushSubs/device-a', 'key-a', 'evening'),
      deliveryId(slot, 'users/account-a/pushSubs/device-a', 'key-a', 'soon'),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('retries transport errors, timeouts, throttling and server failures', () => {
    for (const error of [new Error('network'), { code: 'ABORT_ERR' }, undefined, null, { statusCode: 0 },
      { statusCode: 408 }, { statusCode: 429 }, { statusCode: 500 }, { statusCode: 503 }]) {
      expect(retryablePushError(error)).toBe(true)
    }
    expect(retryDelay(1)).toBe(60_000)
    expect(retryDelay(2)).toBe(180_000)
  })

  it('does not retry expired subscriptions, bad credentials, malformed payloads or redirects', () => {
    for (const statusCode of [301, 302, 400, 401, 403, 404, 410, 413]) {
      expect(retryablePushError({ statusCode })).toBe(false)
    }
  })
})
