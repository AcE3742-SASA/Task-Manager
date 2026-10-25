import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { useTaskActions, useTaskSubscription } from './tasks'
import type { Task } from './tasks'

type State = ReturnType<typeof useTaskSubscription>
type Effect = { deps: unknown[]; cleanup?: () => void }
type Harness = { slots: unknown[]; cursor: number; effects: Map<number, Effect>; updates: State[] }
type Snapshot = { docs: { id: string; data: () => Record<string, unknown> }[]; metadata: { hasPendingWrites: boolean; fromCache: boolean }; docChanges: () => { doc: { id: string; metadata: { hasPendingWrites: boolean } } }[] }

const mock = vi.hoisted(() => ({
  current: null as Harness | null,
  context: null as State | null,
  subscriptions: [] as { path: string; next: (snapshot: Snapshot) => void; unsubscribe: ReturnType<typeof vi.fn> }[],
  read: vi.fn(), transaction: vi.fn(), update: vi.fn(),
}))

vi.mock('./firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async original => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/'), firestore: {} }),
  doc: (collection: { path: string; firestore: unknown }, id: string) => ({ ...collection, path: `${collection.path}/${id}` }),
  getDocFromServer: mock.read,
  runTransaction: mock.transaction,
  updateDoc: mock.update,
  onSnapshot: (collection: { path: string }, _options: unknown, next: (snapshot: Snapshot) => void) => {
    const unsubscribe = vi.fn()
    mock.subscriptions.push({ path: collection.path, next, unsubscribe })
    return unsubscribe
  },
}))
// Keep hook state and effect cleanup across renders without adding a browser test runtime.
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useContext: () => mock.context,
  useRef: (initial: unknown) => {
    const current = mock.current!
    return current.slots[current.cursor++] ??= { current: initial }
  },
  useState: (initial: unknown) => {
    const current = mock.current!, index = current.cursor++
    current.slots[index] ??= initial
    return [current.slots[index], (next: State) => { current.slots[index] = next; current.updates.push(next) }]
  },
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    const current = mock.current!, index = current.cursor++
    const previous = current.effects.get(index)
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
    previous?.cleanup?.()
    current.effects.set(index, { deps, cleanup: effect() })
  },
}))

let root: Harness
let actionRoot: Harness
let uid: string
const harness = (): Harness => ({ slots: [], cursor: 0, effects: new Map(), updates: [] })
function render(account = uid): State {
  uid = account
  mock.current = root
  root.cursor = 0
  useTaskSubscription(uid)
  root.cursor = 0
  return useTaskSubscription(uid)
}
function actions() {
  mock.context = render()
  mock.current = actionRoot
  actionRoot.cursor = 0
  return useTaskActions(uid)
}
function unmount(current = root) {
  current.effects.forEach(effect => effect.cleanup?.())
  current.effects.clear()
}
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, subjectId: null, note: '', due: new Date('2026-10-25T03:00:00Z'),
    kind: '과제', repeat: 'none', done: false, doneAt: null, createdAt: null, focusDate: null,
    dueWasDefault: false, entryMs: 0, ...overrides,
  }
}
function document(value: Task) {
  const { id, due, doneAt, createdAt, ...data } = value
  return {
    id,
    data: () => ({ ...data, due: due && Timestamp.fromDate(due), doneAt: doneAt && Timestamp.fromDate(doneAt), createdAt: createdAt && Timestamp.fromDate(createdAt) }),
    exists: () => true,
  }
}
function snapshot(tasks: Task[], account = uid, metadata = { hasPendingWrites: false, fromCache: false }, changedIds = tasks.map(task => task.id)) {
  const subscription = mock.subscriptions.findLast(item => item.path === `users/${account}/tasks`)!
  subscription.next({ docs: tasks.map(document), metadata, docChanges: () => changedIds.map(id => ({ doc: { id, metadata: { hasPendingWrites: false } } })) })
}
function seed(tasks: Task[]) { render(); snapshot(tasks); return render() }

beforeEach(() => {
  vi.clearAllMocks()
  root = harness(); actionRoot = harness(); uid = 'alice'
  mock.current = null; mock.context = null; mock.subscriptions = []
  mock.read.mockReset(); mock.transaction.mockReset(); mock.update.mockReset()
  mock.transaction.mockResolvedValue(undefined); mock.update.mockResolvedValue(undefined)
})
afterEach(() => { unmount(root); unmount(actionRoot) })

describe('optimistic task subscription', () => {
  it('shows done, due and focus changes immediately, including reordered due dates', async () => {
    const a = task('a'), b = task('b', { due: new Date('2026-10-26T03:00:00Z') }), c = task('c', { due: null })
    const state = seed([a, b, c])
    const done = deferred(), due = deferred(), focus = deferred()
    const doneAt = new Date('2026-10-25T04:00:00Z'), nextDue = new Date('2026-10-24T03:00:00Z')
    const completing = state.optimistic('a', { done: true, doneAt }, () => done.promise)
    const snoozing = state.optimistic('b', { due: nextDue }, () => due.promise)
    const focusing = state.optimistic('c', { focusDate: '2026-10-25' }, () => focus.promise)
    expect(render().tasks.map(item => item.id)).toEqual(['b', 'a', 'c'])
    expect(render().tasks.find(item => item.id === 'a')).toMatchObject({ done: true, doneAt })
    expect(render().tasks.find(item => item.id === 'c')).toMatchObject({ focusDate: '2026-10-25' })
    expect(render().pending).toBe(true)
    snapshot([{ ...a, done: true, doneAt }, { ...b, due: nextDue }, { ...c, focusDate: '2026-10-25' }])
    done.resolve(); due.resolve(); focus.resolve()
    await Promise.all([completing, snoozing, focusing])
    expect(render().pending).toBe(false)
    expect(mock.read).not.toHaveBeenCalled()
  })

  it('rolls back only the failed task and keeps newer title and note from another device', async () => {
    const a = task('a'), b = task('b')
    const state = seed([a, b]), failed = deferred(), waiting = deferred()
    const rejected = state.optimistic('a', { done: true }, () => failed.promise).catch(error => error)
    const saved = state.optimistic('b', { focusDate: '2026-10-25' }, () => waiting.promise)
    snapshot([{ ...a, title: 'Edited elsewhere', note: 'Remote note' }, { ...b, title: 'New B title' }])
    failed.reject(new Error('permission-denied'))
    expect(await rejected).toMatchObject({ message: 'permission-denied' })
    expect(render().tasks.find(item => item.id === 'a')).toMatchObject({ done: false, title: 'Edited elsewhere', note: 'Remote note' })
    expect(render().tasks.find(item => item.id === 'b')).toMatchObject({ focusDate: '2026-10-25', title: 'New B title' })
    expect(render().pending).toBe(true)
    snapshot([{ ...a, title: 'Edited elsewhere', note: 'Remote note' }, { ...b, title: 'New B title', focusDate: '2026-10-25' }])
    waiting.resolve(); await saved
    expect(render().pending).toBe(false)
  })

  it('keeps the visual change until a successful save is confirmed before the subscription catches up', async () => {
    const a = task('a'), state = seed([a]), save = deferred<string>(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const startedAt = root.updates.length
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve('saved')
    await Promise.resolve()
    expect(mock.read).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/alice/tasks/a' }))
    expect(render()).toMatchObject({ pending: true, tasks: [expect.objectContaining({ done: true })] })
    refresh.resolve(document({ ...a, done: true, title: 'Server title', note: 'Server note' }))
    expect(await pending).toBe('saved')
    expect(render()).toMatchObject({ pending: false, tasks: [expect.objectContaining({ done: true, title: 'Server title', note: 'Server note' })] })
    expect(root.updates.slice(startedAt).every(update => update.tasks[0].done)).toBe(true)
  })

  it('uses an already confirmed subscription update without another server read', async () => {
    const a = task('a'), state = seed([a]), save = deferred()
    const pending = state.optimistic('a', { done: true, doneAt: new Date() }, () => save.promise)
    const confirmedAt = new Date('2026-10-25T04:00:00Z')
    snapshot([{ ...a, done: true, doneAt: confirmedAt }])
    save.resolve(); await pending
    expect(mock.read).not.toHaveBeenCalled()
    expect(render()).toMatchObject({ pending: false, tasks: [expect.objectContaining({ done: true, doneAt: confirmedAt })] })
  })

  it('does not overwrite a newer subscription snapshot with a late refresh response', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, done: true, title: 'Newest title', note: 'Newest note' }])
    refresh.resolve(document({ ...a, done: true, title: 'Old title' }))
    await pending
    expect(render().tasks[0]).toMatchObject({ done: true, title: 'Newest title', note: 'Newest note' })
  })

  it('preserves a newer server change to the patched field when the follow-up refresh fails', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { focusDate: '2026-10-25' }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, focusDate: '2026-10-26' }])
    refresh.reject(new Error('refresh offline'))
    await pending
    expect(render()).toMatchObject({ pending: false, tasks: [expect.objectContaining({ focusDate: '2026-10-26' })] })
  })

  it('applies the confirmed refresh after a metadata-only snapshot without reverting the visual change', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const startedAt = root.updates.length
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([a], uid, { hasPendingWrites: true, fromCache: true })
    refresh.resolve(document({ ...a, done: true }))
    await pending
    expect(render().tasks[0].done).toBe(true)
    expect(root.updates.slice(startedAt).every(update => update.tasks[0].done)).toBe(true)
  })

  it('keeps newer cached title and note while applying the refreshed completion', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, title: 'New remote title', note: 'New remote note' }], uid, { hasPendingWrites: false, fromCache: true })
    refresh.resolve(document({ ...a, done: true }))
    await pending
    expect(render()).toMatchObject({ pending: false, tasks: [expect.objectContaining({ done: true, title: 'New remote title', note: 'New remote note' })] })
  })

  it('keeps a confirmed change when only its follow-up refresh fails', async () => {
    const a = task('a'), state = seed([a]), save = deferred()
    mock.read.mockRejectedValueOnce(new Error('refresh offline'))
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await pending
    expect(render()).toMatchObject({ pending: false, error: null, tasks: [expect.objectContaining({ done: true })] })
  })

  it('does not update an unmounted subscription when saving completes late', async () => {
    const a = task('a'), state = seed([a]), save = deferred()
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    unmount()
    const updates = root.updates.length
    save.resolve(); await pending
    expect(root.updates).toHaveLength(updates)
    expect(mock.subscriptions[0].unsubscribe).toHaveBeenCalledOnce()
    expect(mock.read).not.toHaveBeenCalled()
  })

  it('retains a saved completion through an unrelated cached snapshot and failed confirmation read', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, title: 'New remote title' }], uid, { hasPendingWrites: false, fromCache: true })
    refresh.reject(new Error('refresh offline'))
    await pending
    expect(render().tasks[0]).toMatchObject({ done: true, title: 'New remote title' })
  })

  it('keeps a newer server undo even when its value equals the pre-save value', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { focusDate: '2026-10-25' }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, title: 'New remote title', focusDate: null }])
    refresh.resolve(document({ ...a, focusDate: '2026-10-25' }))
    await pending
    expect(render().tasks[0]).toMatchObject({ title: 'New remote title', focusDate: null })
  })

  it('does not discard a confirmed read for an authoritative metadata-only event', async () => {
    const a = task('a'), state = seed([a]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { done: true }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([a], uid, { hasPendingWrites: false, fromCache: false }, [])
    refresh.resolve(document({ ...a, done: true }))
    await pending
    expect(render().tasks[0].done).toBe(true)
  })

  it('recognizes a newer server undo while another task has pending local writes', async () => {
    const a = task('a'), b = task('b'), state = seed([a, b]), save = deferred(), refresh = deferred<ReturnType<typeof document>>()
    mock.read.mockReturnValueOnce(refresh.promise)
    const pending = state.optimistic('a', { focusDate: '2026-10-25' }, () => save.promise)
    save.resolve(); await Promise.resolve()
    snapshot([{ ...a, title: 'New remote title' }, b], uid, { hasPendingWrites: true, fromCache: false }, ['a'])
    refresh.resolve(document({ ...a, focusDate: '2026-10-25' }))
    await pending
    expect(render().tasks[0]).toMatchObject({ title: 'New remote title', focusDate: null })
  })

  it('isolates a new account from an old account save and late snapshot', async () => {
    const a = task('same-id'), state = seed([a]), save = deferred()
    const pending = state.optimistic(a.id, { done: true }, () => save.promise)
    render('bob')
    snapshot([task('same-id', { title: 'Bob task' })])
    const updates = root.updates.length
    snapshot([{ ...a, done: true }], 'alice')
    save.resolve(); await pending
    expect(root.updates).toHaveLength(updates)
    expect(render()).toMatchObject({ pending: false, tasks: [expect.objectContaining({ title: 'Bob task', done: false })] })
    expect(mock.subscriptions[0].unsubscribe).toHaveBeenCalledOnce()
    expect(mock.read).not.toHaveBeenCalled()
  })
})

describe('shared task actions', () => {
  it('projects completion, focus and snooze through the shared subscription and makes snooze undo immediate', async () => {
    const a = task('a'), b = task('b'), c = task('c')
    seed([a, b, c])
    const done = deferred(), focus = deferred(), snooze = deferred(), restore = deferred()
    mock.transaction.mockReturnValueOnce(done.promise).mockReturnValueOnce(snooze.promise).mockReturnValueOnce(restore.promise)
    mock.update.mockReturnValueOnce(focus.promise)
    const shared = actions(), next = new Date('2026-10-26T03:00:00Z')
    const completing = shared.toggleDone(a), focusing = shared.toggleFocus(b, '2026-10-25'), snoozing = shared.snoozeTask(c, next)
    expect(render().tasks.find(item => item.id === 'a')).toMatchObject({ done: true, doneAt: expect.any(Date) })
    expect(render().tasks.find(item => item.id === 'b')).toMatchObject({ focusDate: '2026-10-25' })
    expect(render().tasks.find(item => item.id === 'c')).toMatchObject({ due: next })
    snapshot([{ ...a, done: true }, { ...b, focusDate: '2026-10-25' }, { ...c, due: next }])
    done.resolve(); focus.resolve(); snooze.resolve()
    await Promise.all([completing, focusing])
    const undo = await snoozing
    const undoing = undo()
    expect(render().tasks.find(item => item.id === 'c')?.due).toEqual(c.due)
    expect(render().pending).toBe(true)
    snapshot([{ ...a, done: true }, { ...b, focusDate: '2026-10-25' }, c])
    restore.resolve(); await undoing
    expect(render().pending).toBe(false)
    expect(mock.transaction).toHaveBeenCalledTimes(3)
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/alice/tasks/b' }), { focusDate: '2026-10-25' })
    expect(mock.read).not.toHaveBeenCalled()
  })
})
