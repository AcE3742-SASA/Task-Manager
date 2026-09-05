import { describe, expect, it } from 'vitest'
import { kstToday } from './due'

/** KST 벽시계로 시각을 만든다. 테스트가 도는 기기의 시간대에 흔들리지 않게. */
const kst = (s: string) => new Date(`${s}+09:00`)

/**
 * "오늘 끝낼 것" 목록은 이 문자열 하나로 굴러간다.
 * 자정을 넘기는 순간 값이 달라져야 어제 꽂아 둔 것들이 저절로 빠진다.
 */
describe('kstToday', () => {
  it('KST 벽시계 날짜를 YYYY-MM-DD 로 준다', () => {
    expect(kstToday(kst('2026-09-05T15:00'))).toBe('2026-09-05')
  })

  it('자정 직전과 직후가 다르다 — 이게 자동 초기화의 전부다', () => {
    expect(kstToday(kst('2026-09-05T23:59'))).toBe('2026-09-05')
    expect(kstToday(kst('2026-09-06T00:00'))).toBe('2026-09-06')
  })

  it('UTC 가 아니라 KST 로 끊는다', () => {
    // UTC 로는 아직 9/5 15:30 이지만 서울은 이미 9/6 이다.
    expect(kstToday(new Date('2026-09-05T15:30:00.000Z'))).toBe('2026-09-06')
  })

  it('월·일을 두 자리로 채운다', () => {
    expect(kstToday(kst('2026-01-07T09:00'))).toBe('2026-01-07')
  })

  it('월말·연말을 넘긴다', () => {
    expect(kstToday(kst('2026-12-31T23:59'))).toBe('2026-12-31')
    expect(kstToday(kst('2027-01-01T00:01'))).toBe('2027-01-01')
  })
})
