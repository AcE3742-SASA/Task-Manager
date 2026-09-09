import { describe, expect, it } from 'vitest'
import { isDoubleTap } from './Calendar'

describe('달력 빠른 생성', () => {
  const tap = (day: number, at: number, pointerType = 'touch') => ({ day, at, pointerType })

  it('같은 입력으로 같은 날짜를 짧게 두 번 눌렀을 때만 열린다', () => {
    expect(isDoubleTap(null, tap(10, 1_000))).toBe(false)
    expect(isDoubleTap(tap(10, 1_000), tap(10, 1_400))).toBe(true)
    expect(isDoubleTap(tap(9, 1_000), tap(10, 1_400))).toBe(false)
    expect(isDoubleTap(tap(10, 1_000), tap(10, 1_501))).toBe(false)
    expect(isDoubleTap(tap(10, 1_000, 'pen'), tap(10, 1_400, 'touch'))).toBe(false)
  })
})
