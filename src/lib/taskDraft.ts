import { KINDS } from './tasks'
import type { Kind } from './tasks'
import { REPEATS } from './due'
import type { Repeat } from './due'

export type TaskDraft = {
  id: string; title: string; subjectId: string | null; kind: Kind; note: string
  repeat: Repeat; due: string; noDue: boolean; dueTouched: boolean
}

export function readTaskDraft(key: string): TaskDraft | null {
  try {
    // 이전 버전의 세션 초안도 한 번은 복원한다. 이후 저장에서 정리한다.
    let raw: string | null = null
    try { raw = sessionStorage.getItem(key) } catch { /* 기기 저장소로 이어간다. */ }
    if (raw === null) raw = localStorage.getItem(key)
    const d = JSON.parse(raw ?? 'null')
    if (!d || typeof d.id !== 'string' || !/^[\w-]{1,128}$/.test(d.id)
      || typeof d.title !== 'string' || typeof d.note !== 'string'
      || !(d.subjectId === null || typeof d.subjectId === 'string')
      || !KINDS.includes(d.kind) || !REPEATS.includes(d.repeat)
      || typeof d.due !== 'string' || !Number.isFinite(Date.parse(d.due))
      || typeof d.noDue !== 'boolean' || typeof d.dueTouched !== 'boolean') return null
    return { id: d.id, title: d.title, subjectId: d.subjectId, kind: d.kind, note: d.note,
      repeat: d.repeat, due: d.due, noDue: d.noDue, dueTouched: d.dueTouched }
  } catch { return null }
}

export function writeTaskDraft(key: string, draft: TaskDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft))
    else localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  } catch {
    // 기기 저장소가 막힌 경우에도 이번 탭에서의 이동·새로고침은 보호한다.
    try {
      if (draft) sessionStorage.setItem(key, JSON.stringify(draft))
      else sessionStorage.removeItem(key)
    } catch { /* 저장소가 모두 막혀도 현재 폼의 입력은 유지한다. */ }
  }
}

/** 이전 화면의 느린 저장 응답이 더 최근에 입력한 초안을 지우지 않는다. */
export function clearTaskDraftIfUnchanged(key: string, submitted: TaskDraft): boolean {
  const current = readTaskDraft(key)
  if (!current || !Object.entries(current).every(([field, value]) => submitted[field as keyof TaskDraft] === value)) return false
  writeTaskDraft(key, null)
  return true
}
