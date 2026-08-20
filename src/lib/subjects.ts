import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export type Day = 1 | 2 | 3 | 4 | 5
export const DAYS: Day[] = [1, 2, 3, 4, 5]
export const DAY_LABEL: Record<Day, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' }
/** 시간표 양식에는 10교시 칸도 있지만 실제로 배정된 적이 없어 9까지만 그린다. */
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** 시안의 색칩 4종. 12개 과목을 4색으로 구분하지 않는다 — 식별은 아이콘과 줄임말이 한다. */
/** 줄임말 길이 상한. 격자 칸 폭(약 63px)이 정하는 값이라 늘릴 때 칸을 같이 본다. */
export const SHORT_MAX = 4

export const COLORS = ['#8FA28A', '#C7D3C0', '#C8A96B', '#34170D']

export type Slot = { day: Day; period: number; teacher?: string; room?: string }

export type SubjectInput = {
  name: string
  /** 최대 4글자. 시간표 칸에 이 값이 들어간다. */
  short: string
  icon: string
  color: string
  slots: Slot[]
}

export type Subject = SubjectInput & { id: string }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'L', 'C', 'D', 'M']

/**
 * 학사 시스템에서 복사한 "일반물리학Ⅰ" 의 Ⅰ 은 U+2160 이고, 두 서체 모두 이 글리프가 없어
 * 그 한 글자만 시스템 폰트로 튄다. 저장 경로에서 ASCII 로 바꿔 애초에 들어오지 못하게 한다.
 * U+2160~216F 가 대문자, U+2170~217F 가 소문자다.
 */
export function normalizeName(name: string): string {
  return name.replace(/[Ⅰ-ⅿ]/g, (ch) => {
    const i = ch.codePointAt(0)! - 0x2160
    return i < 16 ? ROMAN[i] : ROMAN[i - 16].toLowerCase()
  })
}

/**
 * 정규화·길이 제한·빈 값 제거를 쓰기 직전 한 곳에서 한다. 화면은 이걸 몰라도 된다.
 * Firestore 는 undefined 필드를 그대로 거부하므로 빈 교사/강의실은 키째 뺀다.
 */
function clean(input: SubjectInput): SubjectInput {
  return {
    name: normalizeName(input.name).trim(),
    short: normalizeName(input.short).trim().slice(0, SHORT_MAX),
    icon: input.icon,
    color: input.color,
    slots: input.slots.map(({ day, period, teacher, room }) => ({
      day,
      period,
      ...(teacher?.trim() ? { teacher: teacher.trim() } : {}),
      ...(room?.trim() ? { room: room.trim() } : {}),
    })),
  }
}

function col(uid: string) {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return collection(db, 'users', uid, 'subjects')
}

export function createSubject(uid: string, input: SubjectInput) {
  return addDoc(col(uid), clean(input))
}

export function saveSubject(uid: string, id: string, input: SubjectInput) {
  return setDoc(doc(col(uid), id), clean(input))
}

export function removeSubject(uid: string, id: string) {
  return deleteDoc(doc(col(uid), id))
}

type State = { subjects: Subject[]; loading: boolean; error: string | null }

export function useSubjects(uid: string): State {
  const [state, setState] = useState<State>({ subjects: [], loading: true, error: null })

  useEffect(() => {
    if (!db) {
      setState({ subjects: [], loading: false, error: 'Firestore 가 설정되지 않았다' })
      return
    }
    return onSnapshot(
      collection(db, 'users', uid, 'subjects'),
      (snap) => {
        const subjects = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as SubjectInput) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        setState({ subjects, loading: false, error: null })
      },
      // 규칙 거부는 콘솔에만 찍히고 화면은 영원히 빈 채로 남는다. 끌어올린다.
      (e) => setState((s) => ({ ...s, loading: false, error: e.message })),
    )
  }, [uid])

  return state
}

export const cellKey = (day: number, period: number) => `${day}-${period}`

export type Placed = { subject: Subject; slot: Slot }

/** 격자 한 칸을 O(1) 로 찾기 위한 인덱스. 과목 10개 남짓이라 매 렌더 다시 만들어도 싸다. */
export function byCell(subjects: Subject[]): Map<string, Placed> {
  const m = new Map<string, Placed>()
  for (const subject of subjects) {
    for (const slot of subject.slots ?? []) m.set(cellKey(slot.day, slot.period), { subject, slot })
  }
  return m
}

/** ink 색 과목은 칸 배경이 어두우므로 글자를 뒤집는다. */
export const onColor = (color: string) => (color.toLowerCase() === '#34170d' ? 'var(--cream)' : 'var(--ink)')

/**
 * 격자 한 칸에 과목을 놓거나(target) 비운다(null).
 * 슬롯이 과목 문서 안에 있으므로 "다른 과목이 있던 칸"은 그 과목 문서에서도 빼야 한다.
 * 최악의 경우 쓰기 2회 — 학기당 32칸짜리 작업이라 배치 최적화는 하지 않는다.
 */
export async function placeSlot(
  uid: string,
  subjects: Subject[],
  day: Day,
  period: number,
  target: { id: string; teacher?: string; room?: string } | null,
) {
  const here = (s: Slot) => s.day === day && s.period === period
  const occupant = byCell(subjects).get(cellKey(day, period))?.subject

  if (occupant && occupant.id !== target?.id) {
    await saveSubject(uid, occupant.id, {
      ...occupant,
      slots: occupant.slots.filter((s) => !here(s)),
    })
  }
  if (!target) return

  const subject = subjects.find((s) => s.id === target.id)
  if (!subject) return
  await saveSubject(uid, subject.id, {
    ...subject,
    slots: [
      ...(subject.slots ?? []).filter((s) => !here(s)),
      { day, period, teacher: target.teacher, room: target.room },
    ],
  })
}
