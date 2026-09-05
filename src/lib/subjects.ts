import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export type Day = 1 | 2 | 3 | 4 | 5
export const DAYS: Day[] = [1, 2, 3, 4, 5]
export const DAY_LABEL: Record<Day, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' }
export const DAY_LABEL_EN: Record<Day, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
}
/** 시간표 양식에는 10교시 칸도 있지만 실제로 배정된 적이 없어 9까지만 그린다. */
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** 줄임말 길이 상한. 격자 칸 폭(약 63px)이 정하는 값이라 늘릴 때 칸을 같이 본다. */
export const SHORT_MAX = 4

/**
 * 시안의 4색으로 시작해 12색으로 늘렸다. 앞 4개는 순서까지 그대로 둔다 —
 * 이미 저장된 과목이 계속 "고른 색"으로 보여야 하기 때문이다.
 * 톤은 시안의 채도 낮은 레트로 계열에 맞췄다. 여기 없는 색은 피커로 직접 고른다.
 *
 * 명도 0.161~0.237 은 피한다. 그 구간은 ink 로도 cream 으로도 4.5:1 이 안 나오는
 * 사각지대라, 처음 고른 테라코타·올리브·청록이 전부 거기 걸려 밝은 쪽으로 옮겼다.
 * subjects.test.ts 가 12색 전부를 다시 잰다.
 */
export const COLORS = [
  '#8FA28A', // 세이지
  '#C7D3C0', // 연세이지
  '#C8A96B', // 탠
  '#34170D', // 잉크
  '#D08A62', // 테라코타
  '#9E4A3C', // 벽돌
  '#D4A29A', // 마른 장미
  '#E8DFC8', // 크림
  '#A5A05C', // 카키
  '#7FA9A4', // 청록
  '#3D5A73', // 남색
  '#7D5A75', // 자두
]

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

/** 시안의 두 극단. 과목 색 위에 올릴 글자는 이 둘 중 하나다. */
const INK = '#34170D'
const CREAM = '#F7F4ED'

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 상대 휘도. `#abc` 와 `#aabbcc` 를 받는다. */
export function luminance(hex: string): number {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  // 못 읽는 값이면 밝은 배경으로 치고 어두운 글자를 쓴다 — 흰 칸에 흰 글자보다 낫다.
  if (full.length !== 6 || Number.isNaN(n)) return 1
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * 칸 배경 위 글자색. 피커로 아무 색이나 고를 수 있게 되면서 특정 색 하드코딩이
 * 통하지 않는다 — ink 와 cream 중 대비가 큰 쪽을 고른다 (기존 4색 결과는 그대로다).
 *
 * 토큰이 아니라 실제 hex 를 돌려주는 것이 중요하다. 배경은 저장된 고정 hex 인데
 * var(--ink) 는 다크모드에서 밝은 색으로 뒤집혀, 밝은 칸 위에 밝은 글자가 됐다.
 */
export function onColor(color: string): string {
  const l = luminance(color)
  return contrast(l, luminance(INK)) >= contrast(l, luminance(CREAM)) ? INK : CREAM
}

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
