import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { TaskFeedback } from './TaskFeedback'
import type { useTaskFeedback } from './TaskFeedback'
import { TaskConflictError } from '../lib/tasks'

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], index: 0,
  state: undefined as unknown, updates: 0,
  mounted: false, cleanup: undefined as (() => void) | undefined,
}))

// Run the real feedback logic with persistent hook state; browser rendering is checked in the demo.
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => hooks.refs[hooks.index++] ??= { current: initial },
  useState: (initial: unknown) => {
    if (hooks.state === undefined) hooks.state = initial
    return [hooks.state, (next: unknown) => {
      hooks.updates++
      hooks.state = typeof next === 'function' ? next(hooks.state) : next
    }]
  },
  useEffect: (effect: () => () => void) => {
    if (!hooks.mounted) { hooks.mounted = true; hooks.cleanup = effect() }
  },
}))
vi.mock('../lib/i18n', () => ({ useT: () => (_ko: string, en: string) => en }))
vi.mock('../lib/tasks', () => ({
  TaskConflictError: class extends Error {
    constructor(readonly code: string, readonly taskId: string) { super(code) }
  },
}))

type Feedback = ReturnType<typeof useTaskFeedback>
type Notice = ReactElement<{
  role: string
  children: (ReactElement<{ children: string; onClick: () => void }> | false)[]
}>

function render() {
  hooks.index = 0
  return TaskFeedback({ children: null }) as ReactElement<{ value: Feedback; children: [null, Notice | false] }>
}
const feedback = () => render().props.value
function notice() {
  const node = render().props.children[1]
  expect(node).toBeTruthy()
  return node as Notice
}
const message = () => (notice().props.children[0] as ReactElement<{ children: string }>).props.children
function click(label: string) {
  const button = notice().props.children.find(child => child && child.props.children === label)
  expect(button).toBeTruthy()
  ;(button as ReactElement<{ onClick: () => void }>).props.onClick()
}
function deferred() {
  let resolve: () => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  hooks.refs = []; hooks.index = hooks.updates = 0; hooks.state = undefined
  hooks.mounted = false; hooks.cleanup = undefined
  vi.useFakeTimers()
  vi.stubGlobal('window', { setTimeout, clearTimeout })
})
afterEach(() => { hooks.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('task feedback', () => {
  it('allows different tasks concurrently and blocks duplicate calls to the same task across renders', async () => {
    const a = deferred(), b = deferred()
    const pendingA = feedback().run('a', () => a.promise)
    expect(feedback().busy('a')).toBe(true)
    expect(feedback().busy('b')).toBe(false)
    const duplicate = vi.fn(async () => {})
    await feedback().run('a', duplicate)
    expect(duplicate).not.toHaveBeenCalled()
    const pendingB = feedback().run('b', () => b.promise)
    expect(feedback().busy('b')).toBe(true)
    b.resolve(); await pendingB
    expect(feedback().busy('b')).toBe(false)
    expect(feedback().busy('a')).toBe(true)
    a.resolve(); await pendingA
    expect(feedback().busy('a')).toBe(false)
    expect(render().props.children[1]).toBe(false)
  })

  it('retains a task failure after another task succeeds and retries only the failed task', async () => {
    const a = deferred(), b = deferred()
    const actionA = vi.fn().mockReturnValueOnce(a.promise).mockResolvedValue(undefined)
    const actionB = vi.fn(() => b.promise)
    const pendingA = feedback().run('a', actionA, 'Retried A')
    const pendingB = feedback().run('b', actionB, 'Saved B')
    a.reject(new Error('offline')); await pendingA
    b.resolve(); await pendingB
    expect(notice().key).toBe('a')
    expect(notice().props.role).toBe('alert')
    click('Retry')
    await vi.waitFor(() => expect(message()).toBe('Retried A'))
    expect(actionA).toHaveBeenCalledTimes(2)
    expect(actionB).toHaveBeenCalledTimes(1)
    click('×')
    expect(message()).toBe('Saved B')
  })

  it('keeps separate undo callbacks and binds the next notice to its own task', async () => {
    const undoA = vi.fn(async () => {}), undoB = vi.fn(async () => {})
    await feedback().run('a', async () => undoA, 'Snoozed A')
    await feedback().run('b', async () => undoB, 'Snoozed B')
    expect(notice().key).toBe('a')
    click('×')
    expect(notice().key).toBe('b')
    click('Undo')
    await vi.waitFor(() => expect(message()).toBe('Due date restored.'))
    expect(undoA).not.toHaveBeenCalled()
    expect(undoB).toHaveBeenCalledTimes(1)
  })

  it('keeps the remaining task slow timer after another task finishes', async () => {
    const a = deferred(), b = deferred()
    const pendingA = feedback().run('a', () => a.promise)
    await vi.advanceTimersByTimeAsync(500)
    const pendingB = feedback().run('b', () => b.promise)
    a.resolve(); await pendingA
    await vi.advanceTimersByTimeAsync(1500)
    expect(notice().key).toBe('b')
    expect(message()).toBe('Waiting for the server. Please check the save result.')
    b.resolve(); await pendingB
    expect(vi.getTimerCount()).toBe(0)
    expect(render().props.children[1]).toBe(false)
  })

  it('reports conflicts without offering to retry stale data', async () => {
    await feedback().run('a', async () => { throw new TaskConflictError('task/not-found', 'a') })
    expect(notice().props.role).toBe('alert')
    expect(message()).toBe('This task was deleted. Check the current task list.')
    expect(notice().props.children.some(child => child && child.props.children === 'Retry')).toBe(false)
  })

  it('clears all timers on unmount and does not update state when pending requests finish', async () => {
    const a = deferred(), b = deferred()
    const pendingA = feedback().run('a', () => a.promise)
    const pendingB = feedback().run('b', () => b.promise)
    expect(vi.getTimerCount()).toBe(2)
    hooks.cleanup?.()
    const updates = hooks.updates
    expect(vi.getTimerCount()).toBe(0)
    a.resolve(); b.reject(new Error('offline'))
    await Promise.all([pendingA, pendingB])
    expect(hooks.updates).toBe(updates)
  })
})
