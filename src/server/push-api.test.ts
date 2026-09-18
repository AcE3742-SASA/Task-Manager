import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => ({
  configure: vi.fn(), verifyIdToken: vi.fn(), sendNotification: vi.fn(), groupGet: vi.fn(),
  documents: new Map<string, Record<string, unknown>>(), reads: [] as string[], deleted: [] as string[],
}))
vi.mock('./push.js', async (original) => {
  const actual = await original<typeof import('./push')>()
  return { ...actual, pushServices: mock.configure }
})
import testPush from '../../api/test-push'
import { validPushSubscription } from './push'

function reference(path: string) {
  return {
    path,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => {
      mock.reads.push(path)
      return { exists: mock.documents.has(path), data: () => mock.documents.get(path) }
    },
    delete: async () => { mock.deleted.push(path); mock.documents.delete(path) },
  }
}
function collection(path: string) {
  return { doc: (name: string) => reference(`${path}/${name}`) }
}
function response() {
  let status = 200
  let body: unknown
  const headers: Record<string, string> = {}
  const res = {
    status: (value: number) => { status = value; return res },
    json: (value: unknown) => { body = value; return res },
    setHeader: (key: string, value: string) => { headers[key] = value; return res },
  }
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) }
}
const sub = { endpoint: 'https://web.push.apple.com/synthetic', keys: { p256dh: 'p'.repeat(88), auth: 'a'.repeat(22) }, vapid: 'synthetic-key' }
const request = (body: unknown = { subscriptionId: 'device-a' }) => ({ method: 'POST', headers: { authorization: 'Bearer synthetic-token' }, body })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
  vi.stubEnv('CRON_SECRET', 'synthetic-cron')
  mock.documents.clear(); mock.reads.length = 0; mock.deleted.length = 0
  mock.documents.set('users/account-a/pushSubs/device-a', sub)
  mock.verifyIdToken.mockResolvedValue({ uid: 'account-a' })
  mock.sendNotification.mockResolvedValue({ statusCode: 201 })
  mock.configure.mockReturnValue({
    auth: { verifyIdToken: mock.verifyIdToken }, webpush: { sendNotification: mock.sendNotification }, publicKey: 'synthetic-key',
    db: {
      collection, doc: reference, collectionGroup: () => ({ get: mock.groupGet }),
      runTransaction: async (fn: (tx: unknown) => unknown) => fn({
        get: (ref: ReturnType<typeof reference>) => ref.get(),
        set: (ref: ReturnType<typeof reference>, value: Record<string, unknown>) => mock.documents.set(ref.path, value),
        delete: (ref: ReturnType<typeof reference>) => ref.delete(),
      }),
    },
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('authenticated test push endpoint', () => {
  it('rejects missing/invalid identity before reading a user subscription', async () => {
    const missing = response()
    await testPush({ method: 'POST', headers: {}, body: {} } as never, missing.res)
    expect(missing.result().status).toBe(401)
    expect(mock.configure).not.toHaveBeenCalled()
    mock.verifyIdToken.mockRejectedValue(new Error('bad-token'))
    const invalid = response()
    await testPush(request() as never, invalid.res)
    expect(invalid.result().status).toBe(401)
    expect(mock.reads).toEqual([])
    expect(mock.sendNotification).not.toHaveBeenCalled()
  })

  it('verifies revocation and uses only the token UID even if another UID/endpoint is supplied', async () => {
    const output = response()
    await testPush(request({ subscriptionId: 'device-a', uid: 'victim', endpoint: 'https://private.invalid' }) as never, output.res)
    expect(output.result().status).toBe(200)
    expect(mock.verifyIdToken).toHaveBeenCalledWith('synthetic-token', true)
    expect(mock.reads).toEqual(['users/account-a/pushSubs/device-a', 'pushTestLimits/account-a'])
    expect(mock.sendNotification).toHaveBeenCalledWith({ endpoint: sub.endpoint, keys: sub.keys }, expect.any(String), { TTL: 60, timeout: 5_000 })
    expect(JSON.parse(mock.sendNotification.mock.calls[0][1])).toEqual({
      title: '알림 연결 확인', body: '이 기기에 테스트 알림이 도착했어요.', screen: '/settings',
    })
  })

  it('rejects path traversal and an unregistered subscription without sending', async () => {
    for (const subscriptionId of ['../victim', 'unregistered']) {
      const output = response()
      await testPush(request({ subscriptionId }) as never, output.res)
      expect([400, 409]).toContain(output.result().status)
    }
    expect(mock.sendNotification).not.toHaveBeenCalled()
  })

  it('applies a server-only per-account one-minute and daily limit', async () => {
    const first = response()
    await testPush(request() as never, first.res)
    const repeated = response()
    await testPush(request() as never, repeated.res)
    expect(repeated.result()).toMatchObject({ status: 429, headers: { 'Retry-After': '60' } })
    vi.advanceTimersByTime(61_000)
    const saved = mock.documents.get('pushTestLimits/account-a')!
    mock.documents.set('pushTestLimits/account-a', { ...saved, count: 10 })
    const daily = response()
    await testPush(request() as never, daily.res)
    expect(daily.result().status).toBe(429)
    expect(mock.sendNotification).toHaveBeenCalledTimes(1)
    expect(mock.documents.get('pushTestLimits/account-a')?.expiresAt).toEqual(new Date('2026-09-20T12:00:00Z'))
  })

  it('rejects changed VAPID and unsafe endpoints and prunes expired registrations', async () => {
    mock.documents.set('users/account-a/pushSubs/device-a', { ...sub, vapid: 'old-key' })
    const old = response()
    await testPush(request() as never, old.res)
    expect(old.result().status).toBe(409)
    mock.documents.set('users/account-a/pushSubs/device-a', { ...sub, endpoint: 'https://127.0.0.1/internal' })
    const unsafe = response()
    await testPush(request() as never, unsafe.res)
    expect(unsafe.result().status).toBe(409)
    expect(mock.sendNotification).not.toHaveBeenCalled()
    mock.documents.set('users/account-a/pushSubs/device-a', sub)
    mock.sendNotification.mockRejectedValue({ statusCode: 410 })
    const expired = response()
    await testPush(request() as never, expired.res)
    expect(expired.result().status).toBe(409)
    expect(mock.deleted).toEqual(['users/account-a/pushSubs/device-a'])
  })

  it.each([
    ['endpoint', 404, { ...sub, endpoint: 'https://web.push.apple.com/replaced' }],
    ['p256dh', 410, { ...sub, keys: { ...sub.keys, p256dh: 'n'.repeat(88) } }],
    ['auth', 404, { ...sub, keys: { ...sub.keys, auth: 'n'.repeat(22) } }],
    ['vapid', 410, { ...sub, vapid: 'new-vapid-key' }],
  ] as const)('preserves a subscription whose %s changed while the old push was in flight', async (_field, statusCode, replacement) => {
    const path = 'users/account-a/pushSubs/device-a'
    mock.sendNotification.mockImplementation(async () => {
      mock.documents.set(path, replacement)
      throw { statusCode }
    })
    const output = response()
    await testPush(request() as never, output.res)
    expect(output.result().status).toBe(409)
    expect(mock.sendNotification).toHaveBeenCalledTimes(1)
    expect(mock.deleted).toEqual([])
    expect(mock.documents.get(path)).toEqual(replacement)
  })
})

describe('outbound push endpoint validation', () => {
  it('accepts supported push services and rejects arbitrary servers, credentials, ports and spoofed suffixes', () => {
    for (const endpoint of ['https://web.push.apple.com/device', 'https://fcm.googleapis.com/fcm/send/device', 'https://updates.push.services.mozilla.com/device']) {
      expect(validPushSubscription({ ...sub, endpoint })).toBe(true)
    }
    for (const endpoint of ['http://web.push.apple.com/device', 'https://web.push.apple.com.attacker.invalid/device', 'https://user@web.push.apple.com/device', 'https://web.push.apple.com:444/device', 'https://127.0.0.1/device']) {
      expect(validPushSubscription({ ...sub, endpoint })).toBe(false)
    }
  })
})
