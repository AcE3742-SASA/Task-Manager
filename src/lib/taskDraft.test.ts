import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTaskDraftIfUnchanged, readTaskDraft, writeTaskDraft } from './taskDraft'
import type { TaskDraft } from './taskDraft'

vi.mock('./firebase', () => ({ db: null }))
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(), getItem: key => map.get(key) ?? null,
    key: index => [...map.keys()][index] ?? null,
    removeItem: key => { map.delete(key) }, setItem: (key, value) => { map.set(key, value) },
  }
}
const key = 'task-draft:user:new'
const draft: TaskDraft = { id: 'unique-draft-id', title: '과제', subjectId: null, kind: '과제', note: '메모',
  repeat: 'none', due: '2026-09-18T14:59:00.000Z', noDue: false, dueTouched: false }

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})
afterEach(() => vi.unstubAllGlobals())

describe('기기 초안 보관과 늦은 저장 응답', () => {
  it('새 세션에서도 기기에 저장된 초안을 복원한다', () => {
    writeTaskDraft(key, draft)
    vi.stubGlobal('sessionStorage', memoryStorage())
    expect(readTaskDraft(key)).toEqual(draft)
  })

  it('제출한 내용과 같은 초안만 지운다', () => {
    writeTaskDraft(key, draft)
    expect(clearTaskDraftIfUnchanged(key, { ...draft })).toBe(true)
    expect(readTaskDraft(key)).toBeNull()
  })

  it('이전 화면의 저장 응답이 돌아와도 더 최근의 입력을 지우지 않는다', () => {
    writeTaskDraft(key, draft)
    const newer = { ...draft, title: '다시 들어와 수정한 과제' }
    writeTaskDraft(key, newer)
    expect(clearTaskDraftIfUnchanged(key, draft)).toBe(false)
    expect(readTaskDraft(key)).toEqual(newer)
  })

  it('내용이 같아도 다른 생성 ID의 초안은 유지한다', () => {
    const newer = { ...draft, id: 'new-task-id' }
    writeTaskDraft(key, newer)
    expect(clearTaskDraftIfUnchanged(key, draft)).toBe(false)
    expect(readTaskDraft(key)?.id).toBe('new-task-id')
  })

  it('계정별 키가 달라 다른 사용자의 초안을 복원하지 않는다', () => {
    writeTaskDraft(key, draft)
    expect(readTaskDraft('task-draft:another-user:new')).toBeNull()
  })

  it('이전 세션 초안을 읽고 새 저장에서 기기 저장소로 옮긴다', () => {
    sessionStorage.setItem(key, JSON.stringify(draft))
    expect(readTaskDraft(key)).toEqual(draft)
    writeTaskDraft(key, draft)
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('기기 저장 공간이 꽉 차면 세션의 최신 입력을 오래된 기기 입력보다 먼저 읽는다', () => {
    writeTaskDraft(key, draft)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const newer = { ...draft, note: '최신 메모' }
    writeTaskDraft(key, newer)
    expect(readTaskDraft(key)).toEqual(newer)
  })

  it('형식이 잘못된 초안은 복원하지 않는다', () => {
    localStorage.setItem(key, JSON.stringify({ ...draft, due: 'not-a-date' }))
    expect(readTaskDraft(key)).toBeNull()
    localStorage.setItem(key, JSON.stringify({ ...draft, id: 'invalid/path' }))
    expect(readTaskDraft(key)).toBeNull()
  })
})
