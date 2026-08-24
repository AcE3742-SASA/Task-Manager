import { useEffect, useState } from 'react'
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
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

export function createTask(uid: string, input: TaskInput, meta: EntryMeta) {
  return addDoc(col(uid), {
    ...clean(input),
    ...meta,
    done: false,
    doneAt: null,
    createdAt: serverTimestamp(),
  })
}

/** 수정은 폼이 다루는 5개만 덮는다. done · createdAt · 등록 지표는 그대로 둔다. */
export function saveTask(uid: string, id: string, input: TaskInput) {
  return updateDoc(doc(col(uid), id), clean(input))
}

export function removeTask(uid: string, id: string) {
  return deleteDoc(doc(col(uid), id))
}

/** 기한만 하루 뒤로 민다. 완료·등록 지표·다른 필드는 건드리지 않는다. */
export function snoozeTask(uid: string, task: Task, next: Date) {
  return updateDoc(doc(col(uid), task.id), { due: Timestamp.fromDate(next) })
}

export async function toggleDone(uid: string, task: Task) {
  const completing = !task.done
  // 반복 할일을 완료하면 다음 회차를 새 문서로 띄우고, 이번 건은 반복을 떼어
  // 평범한 완료 기록으로 남긴다 — 반복을 떼야 다시 눌러도 회차가 겹치지 않는다.
  if (completing && task.repeat !== 'none' && task.due) {
    await createTask(
      uid,
      {
        title: task.title,
        subjectId: task.subjectId,
        note: task.note,
        due: nextRepeat(task.due, task.repeat),
        kind: task.kind,
        repeat: task.repeat,
      },
      // 소급 등록이라 검증 지표에는 넣지 않는다 (직접 등록이 아니다).
      { dueWasDefault: false, entryMs: 0 },
    )
    return updateDoc(doc(col(uid), task.id), {
      done: true,
      doneAt: Timestamp.now(),
      repeat: 'none',
    })
  }
  return updateDoc(doc(col(uid), task.id), {
    done: !task.done,
    // 기한 경과 후 완료를 판정하려면 완료 시각이 있어야 한다 (PRD 지표 "놓친 마감").
    doneAt: task.done ? null : Timestamp.now(),
  })
}

type State = { tasks: Task[]; loading: boolean; error: string | null }

export function useTasks(uid: string): State {
  const [state, setState] = useState<State>({ tasks: [], loading: true, error: null })

  useEffect(() => {
    if (!db) {
      setState({ tasks: [], loading: false, error: 'Firestore 가 설정되지 않았다' })
      return
    }
    return onSnapshot(
      collection(db, 'users', uid, 'tasks'),
      (snap) => {
        const tasks = snap.docs
          .map((d) => {
            const v = d.data()
            return {
              id: d.id,
              title: v.title ?? '',
              subjectId: v.subjectId ?? null,
              note: v.note ?? '',
              due: toDate(v.due),
              kind: (v.kind ?? '과제') as Kind,
              repeat: (v.repeat ?? 'none') as Repeat,
              done: !!v.done,
              doneAt: toDate(v.doneAt),
              createdAt: toDate(v.createdAt),
              dueWasDefault: !!v.dueWasDefault,
              entryMs: v.entryMs ?? 0,
            }
          })
          // 기한 순. 기한 없는 것(미정)은 맨 뒤로. 같은 기한이면 먼저 만든 것이 위로.
          .sort(
            (a, b) =>
              (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) ||
              (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
          )
        setState({ tasks, loading: false, error: null })
      },
      (e) => setState((s) => ({ ...s, loading: false, error: e.message })),
    )
  }, [uid])

  return state
}
