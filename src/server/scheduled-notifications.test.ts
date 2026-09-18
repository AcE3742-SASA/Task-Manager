import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { VercelResponse } from '@vercel/node'
import { runScheduledNotifications } from './scheduled-notifications'
import { HOUR, hourSlot } from './notification-schedule'

const configure = vi.hoisted(() => vi.fn())
vi.mock('./push.js', async original => ({ ...await original<typeof import('./push')>(), pushServices: configure }))
import handler from '../../api/notify'

type Data = Record<string, any>
type Write = { path: string; value?: Data; merge?: boolean }

/** Firestore 경계용 테스트 대역. transaction을 원자적으로 직렬화하고 commit 실패를 주입한다. */
class Store {
  documents = new Map<string, Data>()
  reads: string[] = []
  queryReads: string[] = []
  beforeRead: (path: string) => void = () => {}
  beforeCommit: (writes: Write[]) => void = () => {}
  private transactions: Promise<unknown> = Promise.resolve()
  doc = (path: string) => ({
    path,
    parent: { parent: { id: path.split('/').at(-3) } },
    get: async () => {
      this.beforeRead(path); this.reads.push(path)
      return this.snapshot(path)
    },
    set: async (value: Data) => this.commit([{ path, value }]),
  })
  snapshot = (path: string) => {
    const value = this.documents.get(path)
    return { id: path.split('/').at(-1), ref: this.doc(path), exists: !!value, data: () => value, get: (key: string) => value?.[key] }
  }
  commit(writes: Write[]) {
    this.beforeCommit(writes)
    for (const write of writes) {
      if (!write.value) this.documents.delete(write.path)
      else this.documents.set(write.path, write.merge ? { ...this.documents.get(write.path), ...write.value } : write.value)
    }
  }
  runTransaction = <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const work = this.transactions.then(async () => {
      const writes: Write[] = []
      const value = await fn({
        get: (ref: ReturnType<Store['doc']>) => ref.get(),
        set: (ref: ReturnType<Store['doc']>, value: Data) => writes.push({ path: ref.path, value }),
        update: (ref: ReturnType<Store['doc']>, value: Data) => writes.push({ path: ref.path, value, merge: true }),
        delete: (ref: ReturnType<Store['doc']>) => writes.push({ path: ref.path }),
      })
      this.commit(writes)
      return value
    })
    this.transactions = work.catch(() => {})
    return work
  }
  query = (path: string, group = false, cursor = '', maximum = Infinity, filters: [string, string, any][] = []) => ({
    orderBy: () => this.query(path, group, cursor, maximum, filters),
    startAfter: (value: string) => this.query(path, group, value, maximum, filters),
    limit: (value: number) => this.query(path, group, cursor, value, filters),
    where: (key: string, op: string, value: any) => this.query(path, group, cursor, maximum, [...filters, [key, op, value]]),
    select: () => this.query(path, group, cursor, maximum, filters),
    get: async () => {
      this.beforeRead(`query:${path}`); this.queryReads.push(path)
      const docs = [...this.documents.keys()].sort().filter(key => {
        const collection = key.split('/').slice(0, -1).join('/')
        if (group ? collection.split('/').at(-1) !== path : collection !== path) return false
        if (cursor && key <= cursor) return false
        return filters.every(([name, op, value]) => op === '==' ? this.documents.get(key)?.[name] === value : this.documents.get(key)?.[name] <= value)
      }).slice(0, maximum).map(this.snapshot)
      return { docs, size: docs.length, empty: !docs.length }
    },
  })
  collection = (path: string) => this.query(path)
  collectionGroup = (path: string) => this.query(path, true)
  batch = () => {
    const writes: Write[] = []
    return { delete: (ref: ReturnType<Store['doc']>) => writes.push({ path: ref.path }), commit: async () => this.commit(writes) }
  }
}

const INITIAL = Date.parse('2026-09-18T12:00:00Z') // 21:00 KST
let store: Store
let send: ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>>
const subFor = (device: string) => ({ endpoint: `https://web.push.apple.com/${device}`, keys: { p256dh: 'p'.repeat(88), auth: 'a'.repeat(22) }, vapid: 'current' })
const addUser = (uid: string, devices = ['device'], notify = { morningHour: null as number | null, eveningHour: 21 as number | null, soonBefore: null as number | null }) => {
  store.documents.set(`users/${uid}/settings/app`, { notify, lang: 'ko' })
  for (const device of devices) store.documents.set(`users/${uid}/pushSubs/${device}`, subFor(`${uid}-${device}`))
}
const services = () => ({ db: store as unknown as Firestore, publicKey: 'current', webpush: { sendNotification: send } })
const run = () => runScheduledNotifications(services())
const advance = (minutes: number) => vi.setSystemTime(Date.now() + minutes * 60_000)
const receipts = () => [...store.documents.entries()].filter(([path]) => path.startsWith('notificationDeliveries/'))

function response() {
  let status = 200
  let body: any
  const headers: Record<string, string> = {}
  const res = {
    status: (value: number) => { status = value; return res },
    json: (value: unknown) => { body = value; return res },
    setHeader: (key: string, value: string) => { headers[key] = value; return res },
  }
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(INITIAL)
  vi.stubEnv('CRON_SECRET', 'synthetic-legacy'); vi.stubEnv('CRON_JOB_SECRET', 'synthetic-new')
  vi.stubEnv('NOTIFY_START_AT', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store = new Store()
  send = vi.fn().mockResolvedValue({ statusCode: 201 })
  configure.mockReset().mockImplementation(services)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('scheduled notification processing with atomic storage', () => {
  it('starts at the configured next hour during migration and retains the saved boundary', async () => {
    vi.stubEnv('NOTIFY_START_AT', '2026-09-18T12:05:00Z')
    addUser('a', ['phone'], { morningHour: null, eveningHour: 22, soonBefore: null })
    await run()
    expect(send).not.toHaveBeenCalled()
    expect(store.documents.get('notificationScheduler/state')?.firstSlot).toBe(INITIAL + HOUR)
    advance(60)
    vi.stubEnv('NOTIFY_START_AT', '2026-09-19T00:00:00Z')
    await run()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed migration boundary before reading or writing data', async () => {
    vi.stubEnv('NOTIFY_START_AT', 'tomorrow')
    await expect(run()).rejects.toThrow('invalid-notification-start-at')
    expect(store.reads).toHaveLength(0)
    expect(store.documents.size).toBe(0)
  })

  it('does not send an event that expires while claiming its receipt', async () => {
    addUser('a')
    store.documents.set('notificationScheduler/state', { firstSlot: INITIAL })
    vi.setSystemTime(INITIAL + 90 * 60_000 - 1_000)
    store.beforeRead = path => {
      if (path.startsWith('notificationDeliveries/')) vi.setSystemTime(Date.now() + 2_000)
    }
    await run()
    expect(send).not.toHaveBeenCalled()
    expect(receipts()[0][1].status).toBe('failed')
  })

  it('deduplicates repeated and concurrent runs and does not rescan a completed hour', async () => {
    addUser('a', ['phone', 'desktop'])
    const results = await Promise.all([run(), run()])
    expect(results.filter(result => result.busy)).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(2)
    advance(5)
    const scans = store.queryReads.filter(path => path === 'pushSubs').length
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    expect(store.queryReads.filter(path => path === 'pushSubs')).toHaveLength(scans)
    expect(receipts().every(([, value]) => value.status === 'sent')).toBe(true)
  })

  it('retries only failed devices, retains their event ID, and waits for the backoff', async () => {
    addUser('a', ['bad', 'good'])
    send.mockImplementation((sub: Data) => sub.endpoint.endsWith('bad') ? Promise.reject({ statusCode: 503 }) : Promise.resolve({ statusCode: 201 }))
    expect(await run()).toMatchObject({ sent: 1, failed: 1 })
    const firstBad = send.mock.calls.find(call => call[0].endpoint.endsWith('bad'))!
    advance(0.6)
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    send.mockResolvedValue({ statusCode: 201 })
    advance(5)
    expect(await run()).toMatchObject({ sent: 1, failed: 0 })
    expect(send).toHaveBeenCalledTimes(3)
    expect(JSON.parse(send.mock.calls[2][1]).deliveryId).toBe(JSON.parse(firstBad[1]).deliveryId)
    expect(send.mock.calls[2][2].topic).toBe(firstBad[2].topic)
  })

  it('caps transient attempts at three and never repeats a permanent rejection', async () => {
    addUser('a', ['transient', 'permanent'])
    send.mockImplementation((sub: Data) => Promise.reject({ statusCode: sub.endpoint.endsWith('transient') ? 429 : 403 }))
    for (let i = 0; i < 6; i++) { await run(); advance(5) }
    expect(send.mock.calls.filter(call => call[0].endpoint.endsWith('transient'))).toHaveLength(3)
    expect(send.mock.calls.filter(call => call[0].endpoint.endsWith('permanent'))).toHaveLength(1)
    expect(receipts().every(([, value]) => value.status === 'failed')).toBe(true)
  })

  it('recovers the previous missed hour after a failed subscription query, without replaying history before startup', async () => {
    addUser('a')
    store.beforeRead = path => { if (path === 'query:pushSubs') throw new Error('read-failed') }
    await expect(run()).rejects.toThrow('read-failed')
    store.beforeRead = () => {}
    advance(65)
    expect(await run()).toMatchObject({ sent: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    // 21시가 아닌22시에 처음 설치한 서버는21시 알림을 소급하지 않는다.
    store = new Store(); addUser('a'); send.mockClear()
    await run()
    expect(send).not.toHaveBeenCalled()
  })

  it('does not revive events after the 90 minute recovery window', async () => {
    addUser('a')
    store.beforeRead = path => { if (path === 'query:pushSubs') throw new Error('read-failed') }
    await expect(run()).rejects.toThrow()
    store.beforeRead = () => {}; advance(91)
    await run()
    expect(send).not.toHaveBeenCalled()
  })

  it('handles a receipt write failure after accepted push as uncertain, with bounded same-ID retries', async () => {
    addUser('a')
    store.beforeCommit = writes => {
      if (writes.some(write => write.path.startsWith('notificationDeliveries/') && write.value?.status === 'sent')) throw new Error('commit-unknown')
    }
    expect(await run()).toMatchObject({ failed: 1, pending: 2 })
    expect(receipts()[0][1].status).toBe('sending')
    const first = JSON.parse(send.mock.calls[0][1]).deliveryId
    advance(0.6); await run()
    expect(send).toHaveBeenCalledTimes(1)
    store.beforeCommit = () => {}; advance(5)
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    expect(JSON.parse(send.mock.calls[1][1]).deliveryId).toBe(first)
    expect(receipts()[0][1].status).toBe('sent')
  })

  it('does not send if a durable claim fails, and recovers after the database returns', async () => {
    addUser('a')
    store.beforeCommit = writes => {
      if (writes.some(write => write.path.startsWith('notificationDeliveries/'))) throw new Error('claim-failed')
    }
    expect(await run()).toMatchObject({ sent: 0, userFailures: 1 })
    expect(send).not.toHaveBeenCalled()
    store.beforeCommit = () => {}; advance(5)
    expect(await run()).toMatchObject({ sent: 1 })
  })

  it('recovers after run progress cannot be persisted without resending accepted recipients', async () => {
    addUser('a')
    store.beforeCommit = writes => { if (writes.some(write => write.path.startsWith('notificationRuns/'))) throw new Error('run-commit-failed') }
    await expect(run()).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    store.beforeCommit = () => {}; advance(5)
    await run()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects nested pushSubs documents before reading an impersonated user', async () => {
    const path = 'users/attacker/folders/victim/pushSubs/stolen'
    store.documents.set(path, subFor('attacker'))
    store.documents.set('users/victim/settings/app', { notify: { eveningHour: 21 } })
    await run()
    expect(store.reads).not.toContain('users/victim/settings/app')
    expect(store.queryReads).not.toContain('users/victim/tasks')
    expect(send).not.toHaveBeenCalled()
  })

  it('prunes 410 registrations but retains a concurrently replaced subscription', async () => {
    addUser('a', ['gone', 'renewed'])
    send.mockImplementation((sub: Data) => {
      if (sub.endpoint.endsWith('renewed')) store.documents.set('users/a/pushSubs/renewed', subFor('new-registration'))
      return Promise.reject({ statusCode: 410 })
    })
    await run()
    expect(store.documents.has('users/a/pushSubs/gone')).toBe(false)
    expect(store.documents.get('users/a/pushSubs/renewed')?.endpoint).toContain('new-registration')
  })

  it('resumes pages under a slow-send budget and keeps a partially processed device before the cursor', async () => {
    for (let n = 0; n < 20; n++) addUser(`user-${String(n).padStart(2, '0')}`, ['phone'], { morningHour: 21, eveningHour: 21, soonBefore: null })
    send.mockImplementation(async () => { vi.setSystemTime(Date.now() + 4_000); return { statusCode: 201 } })
    await run()
    const earlyCalls = send.mock.calls.length
    expect(earlyCalls).toBeLessThan(40)
    for (let n = 0; n < 15 && send.mock.calls.length < 40; n++) { advance(1); await run() }
    expect(send).toHaveBeenCalledTimes(40)
    const ids = send.mock.calls.map(call => JSON.parse(call[1]).deliveryId)
    expect(new Set(ids).size).toBe(40)
  })

  it('cleans old server receipts without depending on a paid TTL policy', async () => {
    store.documents.set('notificationDeliveries/expired', { expiresAt: new Date(INITIAL - 1) })
    store.documents.set('notificationRuns/expired', { expiresAt: new Date(INITIAL - 1) })
    store.documents.set('notificationDeliveries/recent', { expiresAt: new Date(INITIAL + HOUR) })
    await run()
    expect(store.documents.has('notificationDeliveries/expired')).toBe(false)
    expect(store.documents.has('notificationRuns/expired')).toBe(false)
    expect(store.documents.has('notificationDeliveries/recent')).toBe(true)
  })

  it('honors an unexpired lease left by an interrupted invocation', async () => {
    addUser('a')
    store.documents.set('notificationScheduler/state', { firstSlot: hourSlot(INITIAL), leaseUntil: INITIAL + 60_000, owner: 'interrupted', lastAttemptAt: INITIAL })
    expect(await run()).toMatchObject({ busy: true })
    advance(5)
    expect(await run()).toMatchObject({ sent: 1 })
  })
})

describe('scheduler API boundary', () => {
  it('requires POST and accepts only the configured legacy or dedicated secret', async () => {
    for (const [method, token, status] of [['GET', 'synthetic-new', 405], ['POST', 'wrong', 401], ['POST', 'synthetic-new', 200], ['POST', 'synthetic-legacy', 200]] as const) {
      const output = response()
      await handler({ method, headers: { authorization: `Bearer ${token}` }, query: { check: '1' } } as never, output.res)
      expect(output.result().status).toBe(status)
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('health check reads only server state and never writes or exposes user data', async () => {
    addUser('private-user')
    const initial = [...store.documents.entries()]
    const output = response()
    await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic-new' }, query: { check: '1' } } as never, output.res)
    expect(output.result()).toMatchObject({ status: 200, body: { ok: true, check: true, sendsNotifications: false } })
    expect(store.reads).toEqual(['notificationScheduler/state'])
    expect([...store.documents.entries()]).toEqual(initial)
    expect(send).not.toHaveBeenCalled()
  })

  it('reports partial transient failure without leaking recipient details and allows healthy recipients through', async () => {
    addUser('a'); addUser('b')
    send.mockRejectedValueOnce({ statusCode: 503 }).mockResolvedValueOnce({ statusCode: 201 })
    const output = response()
    await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic-new' }, query: {}, body: { uid: 'someone-else', now: 0 } } as never, output.res)
    expect(output.result()).toMatchObject({ status: 503, body: { sent: 1, failed: 1 } })
    expect(send).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(output.result().body)).not.toMatch(/apple|account|p256dh|someone-else|Bearer/)
  })
})
