import { describe, expect, it } from 'vitest'
import { SUBJECT_ICONS, ICON_CATEGORIES } from '../components/subject-icons'
import { byCell, cellKey, normalizeName, onColor } from './subjects'
import type { Subject } from './subjects'

describe('normalizeName', () => {
  it('학사 시스템에서 복사한 로마숫자를 ASCII 로 바꾼다', () => {
    expect(normalizeName('일반물리학Ⅰ')).toBe('일반물리학I')
    expect(normalizeName('체육Ⅳ')).toBe('체육IV')
    expect(normalizeName('프로젝트기반연구Ⅰ')).toBe('프로젝트기반연구I')
  })

  it('소문자 로마숫자도 처리한다', () => {
    expect(normalizeName('ⅲ차시')).toBe('iii차시')
  })

  it('로마숫자가 없으면 그대로 둔다', () => {
    expect(normalizeName('일반물리학I')).toBe('일반물리학I')
    expect(normalizeName('알고리즘')).toBe('알고리즘')
  })
})

describe('아이콘 세트', () => {
  it('40종이다', () => {
    expect(SUBJECT_ICONS).toHaveLength(40)
  })

  it('축별 개수가 10 / 5 / 6 / 6 / 5 / 8 이다', () => {
    const counts = ICON_CATEGORIES.map((c) => SUBJECT_ICONS.filter((i) => i.cat === c).length)
    expect(counts).toEqual([10, 5, 6, 6, 5, 8])
  })

  it('id 가 중복되지 않는다 — Firestore 에 저장되는 값이다', () => {
    expect(new Set(SUBJECT_ICONS.map((i) => i.id)).size).toBe(40)
  })
})

describe('byCell', () => {
  const 인공지능: Subject = {
    id: 'a',
    name: '인공지능',
    short: '인공',
    icon: 'chip',
    color: '#8FA28A',
    // 팀티칭: 월1 임건웅 + 월8·9 이현아
    slots: [
      { day: 1, period: 1, teacher: '임건웅', room: 'S108' },
      { day: 1, period: 8, teacher: '이현아', room: 'S108' },
      { day: 1, period: 9, teacher: '이현아', room: 'S108' },
    ],
  }

  it('한 과목의 여러 슬롯이 각 칸에 따로 들어간다', () => {
    const m = byCell([인공지능])
    expect(m.size).toBe(3)
    expect(m.get(cellKey(1, 1))?.slot.teacher).toBe('임건웅')
    expect(m.get(cellKey(1, 9))?.slot.teacher).toBe('이현아')
    expect(m.get(cellKey(1, 2))).toBeUndefined()
  })

  it('slots 가 없는 문서에도 죽지 않는다', () => {
    expect(byCell([{ ...인공지능, slots: undefined as never }]).size).toBe(0)
  })
})

describe('onColor', () => {
  it('ink 배경에서만 글자를 뒤집는다', () => {
    expect(onColor('#34170D')).toBe('var(--cream)')
    expect(onColor('#8FA28A')).toBe('var(--ink)')
  })
})
