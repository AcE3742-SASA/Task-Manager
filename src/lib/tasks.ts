import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { nextRepeat } from './due'
import type { Repeat } from './due'
import { normalizeName } from './subjects'

export const KINDS = ['과제', '수행평가', '시험', '개인'] as const

/** KINDS 는 Firestore 에 저장되는 값이라 건드리지 않는다. 화면에 쓸 영문만 따로 둔다. */
export const KIND_EN: Record<string, string> = {
  '과제': 'Homework',
  '수행평가': 'Assessment',
  '시험': 'Exam',
  '개인': 'Personal',
}
export type Kind = (typeof KINDS)[number]

/** 사용자가 폼에서 만지는 값. */
export type TaskInput = {
  title: string
  /** 과목을 안 고른 개인 할일은 null. */
  subjectId: string | null
  note: string
  /** 기한을 잡지 않은 할일은 null — 목록에서 "미정"으로 묶인다. */
  due: Date | null
  kind: Kind
  /** 반복 주기. 'none' 이면 한 번 하고 끝난다. 완료 시 다음 회차를 새로 띄운다. */
  repeat: Repeat
}

/**
 * 등록 시점에만 알 수 있어 소급이 불가능한 값들. M6 검증 지표의 유일한 출처다.
 * - dueWasDefault: 자동 계산된 기한을 그대로 저장했는가 → 채택률(목표 70%)
 * - entryMs: New 진입에서 저장까지 → 등록 소요 시간(목표 30초)
 * 수정할 때는 건드리지 않는다. "등록할 때 어땠는가"를 재는 값이기 때문이다.
 */
export type EntryMeta = { dueWasDefault: boolean; entryMs: number }

export type Task = TaskInput &
  EntryMeta & {
    id: string
    done: boolean
    doneAt: Date | null
    createdAt: Date | null
    /**
     * "오늘 끝낼 것" 목록에 넣은 날 (KST, YYYY-MM-DD). 안 넣었으면 null.
     * 플래그가 아니라 날짜인 이유는 자정이 지나면 저절로 오늘이 아니게 되기 때문이다.
     * 폼이 다루는 값이 아니라 done 과 같은 앱 상태라 TaskInput 에는 넣지 않는다.
     */
    focusDate: string | null
  }

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null)

function clean(input: TaskInput) {
  return {
    title: normalizeName(input.title).trim(),
    subjectId: input.subjectId,
    note: input.note.trim(),
    due: input.due ? Timestamp.fromDate(input.due) : null,
    kind: input.kind,
    // 기한 없는 반복은 다음 회차를 계산할 수 없으니 저장 단계에서 'none' 으로 떨군다.
    repeat: input.due ? input.repeat : 'none',
  }
}

function col(uid: string) {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return collection(db, 'users', uid, 'tasks')
}

export class TaskConflictError extends Error {
  constructor(readonly code: 'task/already-exists' | 'task/changed' | 'task/not-found', readonly taskId: string) {
    super(code === 'task/already-exists'
      ? '이 초안은 이미 저장됐고 내용이 달라졌어요. 기존 할 일을 확인하거나 새 할 일로 저장해 주세요.'
      : code === 'task/changed'
        ? '다른 곳에서 이 할 일을 수정했어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.'
        : '이 할 일을 찾을 수 없어요. 이미 삭제됐을 수 있어요.')
  }
}

function matchesInput(current: Record<string, unknown>, expected: ReturnType<typeof clean>): boolean {
  return (current.title ?? '') === expected.title && (current.note ?? '') === expected.note &&
    (current.subjectId ?? null) === expected.subjectId && (current.kind ?? '과제') === expected.kind &&
    (current.repeat ?? 'none') === expected.repeat &&
    (toDate(current.due)?.getTime() ?? null) === (expected.due?.toMillis() ?? null)
}

export function createTask(uid: string, input: TaskInput, meta: EntryMeta, id?: string) {
  const value = {
    ...clean(input),
    ...meta,
    done: false,
    doneAt: null,
    createdAt: serverTimestamp(),
  }
  if (!id) return addDoc(col(uid), value)
  const ref = doc(col(uid), id)
  // 응답을 못 받은 초안을 다시 제출해도 완료·수정된 기존 항목을 덮지 않는다.
  return runTransaction(ref.firestore, async (tx) => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) tx.set(ref, value)
    else if (!matchesInput(snapshot.data(), value)) throw new TaskConflictError('task/already-exists', id)
  })
}

/** 폼을 연 뒤 다른 기기에서 바뀐 내용을 오래된 입력으로 덮지 않는다. */
export function saveTask(uid: string, id: string, input: TaskInput, baseline: TaskInput) {
  const ref = doc(col(uid), id)
  const value = clean(input)
  const expected = clean(baseline)
  return runTransaction(ref.firestore, async tx => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) throw new TaskConflictError('task/not-found', id)
    const current = snapshot.data()
    // 첫 응답만 놓친 재시도는 성공으로 처리한다. 완료 상태 등 다른 필드는 건드리지 않는다.
    if (matchesInput(current, value)) return
    if (!matchesInput(current, expected)) throw new TaskConflictError('task/changed', id)
    tx.update(ref, value)
  })
}

export function removeTask(uid: string, id: string) {
  return deleteDoc(doc(col(uid), id))
}

/** 기한만 하루 뒤로 민다. 완료·등록 지표·다른 필드는 건드리지 않는다. */
export function snoozeTask(uid: string, task: Task, next: Date) {
  if (!task.due) return Promise.reject(new Error('먼저 기한을 정해 주세요.'))
  return changeDue(uid, task.id, task.due, next).then(() =>
    () => changeDue(uid, task.id, next, task.due!),
  )
}

/** 다른 기기에서 바꾼 기한을 오래된 변경/되돌리기가 덮어쓰지 않는다. */
async function changeDue(uid: string, id: string, expected: Date, next: Date) {
  const ref = doc(col(uid), id)
  await runTransaction(ref.firestore, async (tx) => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) throw new TaskConflictError('task/not-found', id)
    const current = snapshot.data()
    if (current.done || toDate(current.due)?.getTime() !== expected.getTime()) {
      throw new TaskConflictError('task/changed', id)
    }
    tx.update(ref, { due: Timestamp.fromDate(next) })
  })
}

/**
 * "오늘 끝낼 것" 목록에 넣고 뺀다. 원래 목록에서는 아무것도 사라지지 않는다 —
 * 이 필드는 어디에 또 보여줄지만 정하고, 할일 자체는 그대로 제자리에 남는다.
 */
export function toggleFocus(uid: string, task: Task, today: string) {
  return updateDoc(doc(col(uid), task.id), {
    focusDate: task.focusDate === today ? null : today,
  })
}

export async function toggleDone(uid: string, task: Task) {
  const completing = !task.done
  const tasks = col(uid)
  const ref = doc(tasks, task.id)
  return runTransaction(ref.firestore, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('할 일을 찾을 수 없다')
    const current = snapshot.data()
    // 클릭 당시의 의도를 고정한다. 재시도나 오래된 중복 요청이 완료를 되돌리면 안 된다.
    if (!!current.done === completing) return

    const due = toDate(current.due)
    const repeat = (current.repeat ?? 'none') as Repeat
    const repeating = completing && repeat !== 'none' && due !== null
    if (repeating) {
      transaction.set(doc(tasks), {
        ...clean({
          title: current.title ?? '',
          subjectId: current.subjectId ?? null,
          note: current.note ?? '',
          due: nextRepeat(due, repeat),
          kind: current.kind ?? '과제',
          repeat,
        }),
        dueWasDefault: false,
        entryMs: 0,
        done: false,
        doneAt: null,
        createdAt: serverTimestamp(),
      })
    }
    // 다음 회차 생성과 원본 완료를 함께 커밋한다. 반복을 떼어 재완료도 안전하게 한다.
    transaction.update(ref, {
      done: completing,
      doneAt: completing ? Timestamp.now() : null,
      ...(repeating ? { repeat: 'none' } : {}),
    })
  })
}

type TaskPatch = Partial<Pick<Task, 'done' | 'doneAt' | 'due' | 'focusDate'>>
type Optimistic = <T>(id: string, patch: TaskPatch, save: () => Promise<T>) => Promise<T>
type SnapshotState = { tasks: Task[]; loading: boolean; error: string | null; pending: boolean; fromCache: boolean }
type State = SnapshotState & { optimistic: Optimistic }
export const TasksContext = createContext<State | null>(null)

export function useTasks(uid: string): State {
  const shared = useContext(TasksContext)
  const local = useTaskSubscription(shared ? null : uid)
  return shared ?? local
}

export function useTaskSubscription(uid: string | null): State {
  const initial: SnapshotState = { tasks: [], loading: true, error: null, pending: false, fromCache: true }
  const [state, setState] = useState(initial)
  const session = useRef({ active: false, source: initial, patches: new Map<string, TaskPatch>(), revisions: new Map<string, number>() })

  function publish(current = session.current) {
    if (!current.active || current !== session.current) return
    const tasks = current.source.tasks.map(task => {
      const patch = current.patches.get(task.id)
      return patch ? { ...task, ...patch } : task
    }).sort(taskOrder)
    setState({ ...current.source, tasks, pending: current.source.pending || current.patches.size > 0 })
  }

  async function optimistic<T>(id: string, patch: TaskPatch, save: () => Promise<T>): Promise<T> {
    const current = session.current
    current.patches.set(id, patch)
    publish(current)
    try {
      const result = await save()
      if (current.active && current === session.current && current.patches.get(id) === patch) {
        const before = current.source.tasks.find(task => task.id === id)
        const revision = current.revisions.get(id)
        // transaction 응답이 실시간 구독보다 먼저 와도 화면이 이전 값으로 돌아가지 않는다.
        if (before && !matchesPatch(before, patch)) {
          try {
            const snapshot = await getDocFromServer(doc(col(uid!), id))
            const latest = current.source.tasks.find(task => task.id === id)
            // 조회 중 도착한 새 서버 변경은 값이 원래대로 돌아왔더라도 우선한다.
            if (current.revisions.get(id) !== revision) return result
            if (snapshot.exists() && latest) {
              const confirmed = readTask(id, snapshot.data())
              const fields = Object.fromEntries(Object.entries(confirmed).filter(([key]) =>
                sameValue(latest[key as keyof Task], before[key as keyof Task])))
              current.source = { ...current.source, tasks: current.source.tasks.map(task => task.id === id ? { ...task, ...fields } : task) }
            } else if (latest === before) {
              current.source = { ...current.source, tasks: current.source.tasks.filter(task => task.id !== id) }
            }
          } catch {
            // 저장은 성공했다. 조회 연결만 끊겼으면 확인된 변경을 유지하고 구독으로 갱신한다.
            const latest = current.source.tasks.find(task => task.id === id)
            if (latest && current.revisions.get(id) === revision) {
              const fields = Object.fromEntries(Object.entries(patch).filter(([key]) =>
                sameValue(latest[key as keyof Task], before[key as keyof Task])))
              current.source = { ...current.source, tasks: current.source.tasks.map(task => task.id === id ? { ...task, ...fields } : task) }
            }
          }
        }
      }
      return result
    } finally {
      if (current.patches.get(id) === patch) current.patches.delete(id)
      publish(current)
    }
  }

  useEffect(() => {
    if (!uid) return
    const current = { active: true, source: initial, patches: new Map<string, TaskPatch>(), revisions: new Map<string, number>() }
    session.current = current
    publish(current)
    if (!db) {
      current.source = { ...current.source, loading: false, error: '서비스 연결 설정을 확인해 주세요.' }
      publish(current)
      return () => { current.active = false }
    }
    const unsubscribe = onSnapshot(
      collection(db, 'users', uid, 'tasks'),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.metadata.fromCache) {
          for (const { doc } of snap.docChanges()) {
            if (!doc.metadata.hasPendingWrites) current.revisions.set(doc.id, (current.revisions.get(doc.id) ?? 0) + 1)
          }
        }
        const tasks = snap.docs.map(d => readTask(d.id, d.data()))
        current.source = { tasks, loading: false, error: null, pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache }
        publish(current)
      },
      (e) => { current.source = { ...current.source, loading: false, error: e.message }; publish(current) },
    )
    return () => { current.active = false; unsubscribe() }
  }, [uid])

  return { ...state, optimistic }
}

function matchesPatch(task: Task, patch: TaskPatch) {
  return Object.entries(patch).every(([key, value]) => key === 'doneAt' ||
    sameValue(task[key as keyof Task], value))
}

const sameValue = (a: unknown, b: unknown) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

const taskOrder = (a: Task, b: Task) =>
  (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) ||
  (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)

function readTask(id: string, v: Record<string, unknown>): Task {
  return {
    id, title: (v.title ?? '') as string, subjectId: (v.subjectId ?? null) as string | null,
    note: (v.note ?? '') as string, due: toDate(v.due), kind: (v.kind ?? '과제') as Kind,
    repeat: (v.repeat ?? 'none') as Repeat, done: !!v.done, doneAt: toDate(v.doneAt),
    createdAt: toDate(v.createdAt), focusDate: (v.focusDate ?? null) as string | null,
    dueWasDefault: !!v.dueWasDefault, entryMs: (v.entryMs ?? 0) as number,
  }
}

/** 목록·달력·오늘 할 일 창이 같은 임시 변경을 공유한다. 서버 transaction은 그대로 유지한다. */
export function useTaskActions(uid: string) {
  const { optimistic } = useTasks(uid)
  return {
    toggleDone: (task: Task) => optimistic(task.id, { done: !task.done, doneAt: task.done ? null : new Date() }, () => toggleDone(uid, task)),
    toggleFocus: (task: Task, today: string) => optimistic(task.id, { focusDate: task.focusDate === today ? null : today }, () => toggleFocus(uid, task, today)),
    snoozeTask: (task: Task, next: Date) => optimistic(task.id, { due: next }, async () => {
      const undo = await snoozeTask(uid, task, next)
      return () => optimistic(task.id, { due: task.due }, undo)
    }),
  }
}
