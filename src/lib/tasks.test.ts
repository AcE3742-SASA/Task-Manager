import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { toggleDone } from './tasks'
import type { Task } from './tasks'

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  version: 0,
  nextId: 0,
  failCommit: false,
  attempts: 0,
}))

vi.mock('./firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  type Ref = { id: string }
  type Data = Record<string, unknown>
  const update = (ref: Ref, data: Data) => {
    if (store.failCommit) throw new Error('write failed')
    if (!store.docs.has(ref.id)) throw new Error('missing document')
    store.docs.set(ref.id, { ...store.docs.get(ref.id), ...data })
    store.version++
  }
  return {
    ...actual,
    collection: () => ({}),
    doc: (_collection: unknown, id?: string) => ({ id: id ?? `next-${++store.nextId}` }),
    addDoc: async (_collection: unknown, data: Data) => {
      const ref = { id: `next-${++store.nextId}` }
      store.docs.set(ref.id, data)
      store.version++
      return ref
    },
    updateDoc: async (ref: Ref, data: Data) => update(ref, data),
    // Model Firestore's optimistic retry and atomic commit, including two
    // callbacks reading the same version before either writes commit.
    runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      for (;;) {
        store.attempts++
        const version = store.version
        const writes: (() => void)[] = []
        const result = await callback({
          get: async (ref: Ref) => {
            const data = store.docs.get(ref.id)
            return { exists: () => !!data, data: () => data }
          },
          set: (ref: Ref, data: Data) => writes.push(() => store.docs.set(ref.id, data)),
          update: (ref: Ref, data: Data) => writes.push(() => update(ref, data)),
        })
        if (store.version !== version) continue
        if (store.failCommit) throw new Error('write failed')
        writes.forEach((write) => write())
        return result
      }
    },
  }
})

const task: Task = {
  id: 'original', title: '문제 풀기', subjectId: 'math', note: '연습',
  due: new Date('2026-09-08T14:59:00Z'), kind: '과제', repeat: 'daily',
  done: false, doneAt: null, createdAt: null, focusDate: '2026-09-08',
  dueWasDefault: true, entryMs: 100,
}

function seed(overrides: Record<string, unknown> = {}) {
  const { id, due, ...data } = task
  store.docs.set(id, { ...data, due: Timestamp.fromDate(due!), ...overrides })
}

function nextTasks() {
  return [...store.docs.entries()].filter(([id]) => id !== task.id).map(([, data]) => data)
}

beforeEach(() => {
  store.docs.clear()
  store.version = store.nextId = store.attempts = 0
  store.failCommit = false
  seed()
})

describe('toggleDone', () => {
  it('동시에 같은 회차를 완료해도 다음 회차는 하나만 만들고 완료를 유지한다', async () => {
    await Promise.all([toggleDone('user', task), toggleDone('user', task)])
    expect(nextTasks()).toHaveLength(1)
    expect(store.docs.get(task.id)).toMatchObject({ done: true, repeat: 'none' })
    expect(store.attempts).toBeGreaterThan(2)
  })

  it('완료 후 도착한 오래된 요청은 다음 회차나 완료 시각을 바꾸지 않는다', async () => {
    await toggleDone('user', task)
    const doneAt = store.docs.get(task.id)?.doneAt
    await toggleDone('user', task)
    expect(nextTasks()).toHaveLength(1)
    expect(store.docs.get(task.id)?.doneAt).toBe(doneAt)
  })

  it('현재 문서의 수정된 내용과 주기로 다음 회차를 만들고 다른 상태는 유지한다', async () => {
    const due = new Date('2026-09-10T14:59:00Z')
    seed({ title: '새 제목', note: '새 메모', subjectId: null, kind: '개인', repeat: 'weekly', due: Timestamp.fromDate(due) })
    await toggleDone('user', task)
    expect(nextTasks()).toHaveLength(1)
    expect(nextTasks()[0]).toMatchObject({ title: '새 제목', note: '새 메모', subjectId: null, kind: '개인', repeat: 'weekly', done: false, dueWasDefault: false, entryMs: 0 })
    expect((nextTasks()[0].due as Timestamp).toDate()).toEqual(new Date('2026-09-17T14:59:00Z'))
    expect(store.docs.get(task.id)).toMatchObject({ title: '새 제목', focusDate: task.focusDate, dueWasDefault: true, entryMs: 100 })
  })

  it('쓰기 실패 시 원본 완료와 다음 회차 생성이 모두 취소된다', async () => {
    store.failCommit = true
    await expect(toggleDone('user', task)).rejects.toThrow('write failed')
    expect(nextTasks()).toHaveLength(0)
    expect(store.docs.get(task.id)).toMatchObject({ done: false, repeat: 'daily' })
  })

  it('완료 취소 후 다시 완료해도 이미 분리된 반복 회차는 늘지 않는다', async () => {
    await toggleDone('user', task)
    await toggleDone('user', { ...task, done: true, repeat: 'none' })
    expect(store.docs.get(task.id)).toMatchObject({ done: false, doneAt: null, repeat: 'none' })
    await toggleDone('user', { ...task, repeat: 'none' })
    expect(nextTasks()).toHaveLength(1)
    expect(store.docs.get(task.id)?.done).toBe(true)
  })

  it('완료 취소가 동시에 들어와 재시도해도 미완료 상태를 유지한다', async () => {
    seed({ done: true, doneAt: Timestamp.now(), repeat: 'none' })
    const completed = { ...task, done: true, repeat: 'none' as const }
    await Promise.all([toggleDone('user', completed), toggleDone('user', completed)])
    expect(store.docs.get(task.id)).toMatchObject({ done: false, doneAt: null, repeat: 'none' })
    expect(nextTasks()).toHaveLength(0)
  })

  it.each([{ repeat: 'none' }, { due: null }])('현재 반복 또는 기한이 없으면 완료만 한다: %o', async (overrides) => {
    seed(overrides)
    await toggleDone('user', task)
    expect(nextTasks()).toHaveLength(0)
    expect(store.docs.get(task.id)?.done).toBe(true)
  })

  it('삭제된 문서는 오류로 알리고 다음 회차를 남기지 않는다', async () => {
    store.docs.delete(task.id)
    await expect(toggleDone('user', task)).rejects.toThrow()
    expect(store.docs.size).toBe(0)
  })
})
