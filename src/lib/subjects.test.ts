import { describe, expect, it } from 'vitest'
import { SUBJECT_ICONS, ICON_CATEGORIES } from '../components/subject-icons'
import { COLORS, byCell, cellKey, luminance, normalizeName, onColor } from './subjects'
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
  const INK = '#34170D'
  const CREAM = '#F7F4ED'
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  it('시안 4색의 판정은 색을 늘리기 전과 같다', () => {
    expect(onColor('#34170D')).toBe(CREAM)
    expect(onColor('#8FA28A')).toBe(INK)
    expect(onColor('#C7D3C0')).toBe(INK)
    expect(onColor('#C8A96B')).toBe(INK)
  })

  it('토큰이 아니라 실제 색을 준다 — 배경이 고정 hex 라 테마를 따라가면 안 된다', () => {
    expect(onColor('#8FA28A').startsWith('#')).toBe(true)
  })

  it('피커로 고른 임의 색에서도 어두우면 밝은 글자, 밝으면 어두운 글자다', () => {
    expect(onColor('#000000')).toBe(CREAM)
    expect(onColor('#1B3A5C')).toBe(CREAM)
    expect(onColor('#FFFFFF')).toBe(INK)
    expect(onColor('#FFE9A8')).toBe(INK)
  })

  it('세 자리 hex 도 읽는다', () => {
    expect(onColor('#000')).toBe(CREAM)
    expect(onColor('#fff')).toBe(INK)
  })

  it('망가진 값이면 어두운 글자로 물러난다 — 흰 칸에 흰 글자보다 낫다', () => {
    expect(onColor('rebeccapurple')).toBe(INK)
    expect(onColor('#12')).toBe(INK)
  })

  it('고른 글자색이 언제나 대비가 더 큰 쪽이다', () => {
    for (const c of COLORS) {
      const picked = onColor(c)
      expect(ratio(c, picked)).toBeGreaterThanOrEqual(ratio(c, picked === INK ? CREAM : INK))
    }
  })

  it('프리셋 12색 전부 본문 대비 4.5:1 을 넘긴다', () => {
    for (const c of COLORS) expect(ratio(c, onColor(c))).toBeGreaterThan(4.5)
  })
})
