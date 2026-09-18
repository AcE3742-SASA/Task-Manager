import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-a', getIdToken: vi.fn(async () => 'synthetic-token') } as { uid: string; getIdToken: () => Promise<string> } | null },
  getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), signOut: vi.fn(),
}))
vi.mock('./firebase', () => ({ auth: state.auth, db: {} }))
vi.mock('firebase/auth', () => ({ signOut: state.signOut }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDocFromServer: state.getDoc, setDoc: state.setDoc, deleteDoc: state.deleteDoc,
  Timestamp: { now: () => 'synthetic-timestamp' },
}))

let active: PushSubscription | null
let unsubscribe: ReturnType<typeof vi.fn>
let readSubscription: ReturnType<typeof vi.fn>
let storage: Map<string, string>
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-device'
const keys = { p256dh: 'p'.repeat(88), auth: 'a'.repeat(22) }
const push = () => import('./push')

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_VAPID_PUBLIC', 'AQID')
  state.auth.currentUser = { uid: 'account-a', getIdToken: vi.fn(async () => 'synthetic-token') }
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  unsubscribe = vi.fn(async () => { active = null; return true })
  active = {
    endpoint, options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
    toJSON: () => ({ endpoint, keys }), unsubscribe,
  } as unknown as PushSubscription
  readSubscription = vi.fn(async () => active)
  const notification = { permission: 'granted', requestPermission: vi.fn(async () => 'granted') }
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('window', { Notification: notification, PushManager: {} })
  vi.stubGlobal('navigator', { userAgent: 'synthetic-device', serviceWorker: { ready: Promise.resolve({
    pushManager: { getSubscription: readSubscription, subscribe: vi.fn(async () => active) },
  }) } })
  state.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ endpoint, keys, vapid: 'AQID' }) })
  state.setDoc.mockResolvedValue(undefined)
  state.deleteDoc.mockResolvedValue(undefined)
  state.signOut.mockResolvedValue(undefined)
})

describe('device push ownership', () => {
  it('requires the current account server registration and matching VAPID, not only a local subscription', async () => {
    expect(await (await push()).getPushStatus('account-a')).toBe('on')
    expect(state.getDoc).toHaveBeenCalledWith('users/account-a/pushSubs/synthetic-device')
    state.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined })
    expect(await (await push()).getPushStatus('account-a')).toBe('reconnect')
  })

  it('does not report enabled when server verification fails or the VAPID key changed', async () => {
    state.getDoc.mockRejectedValue(new Error('offline'))
    await expect((await push()).getPushStatus('account-a')).rejects.toThrow('offline')
    active = { ...active, options: { applicationServerKey: new Uint8Array([4, 5]).buffer } } as PushSubscription
    expect(await (await push()).getPushStatus('account-a')).toBe('reconnect')
  })

  it('invalidates the old endpoint on account change without writing another account path', async () => {
    storage.set('push.owner', JSON.stringify({ uid: 'account-a', endpoint }))
    state.auth.currentUser!.uid = 'account-b'
    await (await push()).reconcilePushAccount('account-b')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(state.getDoc).not.toHaveBeenCalled()
    expect(state.deleteDoc).not.toHaveBeenCalled()
    expect(storage.has('push.owner')).toBe(false)
  })

  it('preserves a known same-account subscription when offline without making a network call', async () => {
    storage.set('push.owner', JSON.stringify({ uid: 'account-a', endpoint }))
    await (await push()).reconcilePushAccount('account-a')
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(state.getDoc).not.toHaveBeenCalled()
  })

  it('fails closed for an unowned legacy endpoint whose server owner cannot be verified', async () => {
    state.getDoc.mockRejectedValue(new Error('offline'))
    await expect((await push()).reconcilePushAccount('account-a')).rejects.toThrow('push-reconnect')
    expect(active).toBeNull()
  })

  it('blocks signout on cleanup failure and can retry the server deletion after local unsubscribe', async () => {
    state.deleteDoc.mockRejectedValueOnce(new Error('offline'))
    const api = await push()
    await expect(api.signOutSafely(state.auth.currentUser as never)).rejects.toThrow('offline')
    expect(active).toBeNull()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(JSON.parse(storage.get('push.owner')!)).toEqual({ uid: 'account-a', endpoint })
    await api.signOutSafely(state.auth.currentUser as never)
    expect(state.deleteDoc).toHaveBeenCalledTimes(2)
    expect(state.signOut).toHaveBeenCalledOnce()
    expect(storage.has('push.owner')).toBe(false)
  })

  it('does not sign out if the push service refuses to deactivate a live subscription', async () => {
    unsubscribe.mockImplementation(async () => false)
    await expect((await push()).signOutSafely(state.auth.currentUser as never)).rejects.toThrow('unsubscribe-failed')
    expect(state.signOut).not.toHaveBeenCalled()
    expect(state.deleteDoc).not.toHaveBeenCalled()
  })

  it('rejects a stale account call without touching any registration', async () => {
    await expect((await push()).unsubscribeThisDevice('account-b')).rejects.toThrow('account-changed')
    expect(readSubscription).not.toHaveBeenCalled()
    expect(state.deleteDoc).not.toHaveBeenCalled()
  })

  it('does not leave settings or signout waiting forever when no service worker becomes ready', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } })
      const result = (await push()).signOutSafely(state.auth.currentUser as never)
      const failure = expect(result).rejects.toThrow('worker-not-ready')
      await vi.advanceTimersByTimeAsync(10_000)
      await failure
      expect(state.signOut).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('keeps ownership during a timed-out write and invalidates its endpoint before a late account-a write can settle', async () => {
    vi.useFakeTimers()
    try {
      storage.set('push.owner', JSON.stringify({ uid: 'account-a', endpoint }))
      let finish: () => void = () => {}
      state.setDoc.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      const api = await push()
      const pending = api.subscribeThisDevice('account-a')
      const failure = expect(pending).rejects.toThrow('push-timeout')
      await vi.advanceTimersByTimeAsync(10_000)
      await failure
      expect(JSON.parse(storage.get('push.owner')!)).toEqual({ uid: 'account-a', endpoint })
      state.auth.currentUser!.uid = 'account-b'
      await api.reconcilePushAccount('account-b')
      expect(active).toBeNull()
      finish()
      await Promise.resolve()
      expect(storage.has('push.owner')).toBe(false)
      expect(state.setDoc).toHaveBeenCalledTimes(1)
      expect(state.setDoc.mock.calls[0][0]).toBe('users/account-a/pushSubs/synthetic-device')
    } finally { vi.useRealTimers() }
  })

  it('sends a token and subscription id only after an explicit test action', async () => {
    const request = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', request)
    const api = await push()
    await api.getPushStatus('account-a')
    expect(request).not.toHaveBeenCalled()
    await api.sendTestPush('account-a')
    expect(request).toHaveBeenCalledWith('/api/test-push', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ subscriptionId: 'synthetic-device' }),
      headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }),
    }))
  })
})
