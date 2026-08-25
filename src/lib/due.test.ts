import { describe, expect, it } from 'vitest'
import {
  dateFromDayNumber,
  dayNumber,
  formatDue,
  fromLocalInput,
  GROUPS,
  groupOf,
  kstDate,
  kstLabel,
  kstYmd,
  monthGrid,
  nextDue,
  nextRepeat,
  snoozeDue,
  toLocalInput,
  weekStrip,
} from './due'
import type { Slot } from './subjects'

const slot = (day: number): Slot => ({ day: day as 1, period: 1 })

/** 테스트를 로컬 시간대와 무관하게 쓰기 위해 UTC 순간으로 다룬다. KST = UTC+9. */
const at = (iso: string) => new Date(iso)
const iso = (d: Date) => d.toISOString()

// 2026-08-20 은 목요일. 8/24 월, 8/30 일, 8/31 월.
describe('nextDue — PRD 확정 규칙', () => {
  it('인공지능(월1·월8·월9)을 월요일에 등록 → 다음 주 첫 수업은 월요일, 기한은 그 전날 일요일 23:59', () => {
    const due = nextDue([slot(1), slot(1), slot(1)], at('2026-08-24T01:00:00Z'))
    expect(iso(due)).toBe('2026-08-30T14:59:00.000Z') // 8/30(일) 23:59 KST
  })

  it('일반물리학I(수·금)을 수요일에 등록 → 다음 주 수요일 수업, 기한은 화요일 23:59', () => {
    const due = nextDue([slot(3), slot(5)], at('2026-08-26T01:00:00Z'))
    expect(iso(due)).toBe('2026-09-01T14:59:00.000Z') // 9/1(화) 23:59 KST
  })

  it('같은 과목을 금요일에 등록해도 결과가 같다 — 교시가 아니라 수업일이 기준', () => {
    const wed = nextDue([slot(3), slot(5)], at('2026-08-26T01:00:00Z'))
    const fri = nextDue([slot(3), slot(5)], at('2026-08-28T01:00:00Z'))
    expect(iso(fri)).toBe(iso(wed))
  })

  it('같은 날 여러 교시는 하루로 묶인다', () => {
    const one = nextDue([{ day: 1, period: 1 }], at('2026-08-24T01:00:00Z'))
    const three = nextDue(
      [{ day: 1, period: 1 }, { day: 1, period: 8 }, { day: 1, period: 9 }],
      at('2026-08-24T01:00:00Z'),
    )
    expect(iso(three)).toBe(iso(one))
  })
})

describe('nextDue — 경계', () => {
  it('슬롯이 없으면 등록 시점 + 7일 23:59 로 후퇴한다', () => {
    const due = nextDue([], at('2026-08-20T06:00:00Z')) // 8/20(목) 15:00 KST
    expect(iso(due)).toBe('2026-08-27T14:59:00.000Z')
  })

  it('주말에 등록해도 다음 주가 제대로 잡힌다', () => {
    // 8/22(토) 등록 → 다음 주는 8/24 시작 → 월요일 수업 → 8/23(일) 23:59
    expect(iso(nextDue([slot(1)], at('2026-08-22T01:00:00Z')))).toBe('2026-08-23T14:59:00.000Z')
    // 8/23(일) 등록도 같은 주 취급 (주 시작이 월요일이므로)
    expect(iso(nextDue([slot(1)], at('2026-08-23T01:00:00Z')))).toBe('2026-08-23T14:59:00.000Z')
  })

  it('연말에 등록하면 해가 넘어간다', () => {
    // 2026-12-30(수) 등록 → 다음 주 월요일은 2027-01-04 → 기한 2027-01-03 23:59
    expect(iso(nextDue([slot(1)], at('2026-12-30T01:00:00Z')))).toBe('2027-01-03T14:59:00.000Z')
  })

  it('KST 자정 직전에 등록해도 날짜가 밀리지 않는다', () => {
    // 8/24(월) 23:30 KST = 8/24T14:30Z. 아직 월요일이다.
    expect(iso(nextDue([slot(1)], at('2026-08-24T14:30:00Z')))).toBe('2026-08-30T14:59:00.000Z')
  })

  it('주 시작 요일을 일요일로 주면 경계가 하루 당겨진다', () => {
    // 8/23(일) 등록. 주 시작이 일요일이면 이번 주는 8/23~8/29, 다음 주는 8/30 시작.
    // 월요일 수업은 8/31, 기한은 8/30(일) 23:59.
    expect(iso(nextDue([slot(1)], at('2026-08-23T01:00:00Z'), 0))).toBe('2026-08-30T14:59:00.000Z')
  })
})

describe('snoozeDue — 하루 미루기', () => {
  const now = at('2026-08-20T01:00:00Z') // 8/20(목) 10:00 KST

  it('앞으로 남은 기한은 딱 하루만 밀린다', () => {
    // 8/24(월) 23:59 → 8/25(화) 23:59
    expect(iso(snoozeDue(at('2026-08-24T14:59:00Z'), now))).toBe('2026-08-25T14:59:00.000Z')
  })

  it('오늘 마감은 내일 23:59 로 뛴다', () => {
    // 8/20 아무 시각 → 8/21(금) 23:59
    expect(iso(snoozeDue(at('2026-08-20T05:00:00Z'), now))).toBe('2026-08-21T14:59:00.000Z')
  })

  it('지난 기한도 오늘 기준 내일로 뛴다 — 계속 지남에 머물지 않는다', () => {
    // 8/15 마감(지남) → now 기준 내일 8/21 23:59
    expect(iso(snoozeDue(at('2026-07-01T14:59:00Z'), now))).toBe('2026-08-21T14:59:00.000Z')
  })

  it('기한이 없던 할일은 내일 23:59 마감이 된다', () => {
    expect(iso(snoozeDue(null, now))).toBe('2026-08-21T14:59:00.000Z')
  })

  it('시각이 어떻든 결과는 23:59 로 정규화된다', () => {
    expect(iso(snoozeDue(at('2026-08-24T02:00:00Z'), now))).toBe('2026-08-25T14:59:00.000Z')
  })

  it('월·연 경계를 넘겨도 정규화된다', () => {
    // 12/31(목) 23:59 → 2027-01-01 23:59 KST
    expect(iso(snoozeDue(at('2026-12-31T14:59:00Z'), now))).toBe('2027-01-01T14:59:00.000Z')
  })
})

describe('nextRepeat — 다음 회차', () => {
  // 8/30(일) 23:59 KST = 8/30T14:59Z
  const due = at('2026-08-30T14:59:00Z')

  it('매일은 하루 뒤, 시각은 그대로', () => {
    expect(iso(nextRepeat(due, 'daily'))).toBe('2026-08-31T14:59:00.000Z')
  })

  it('매주는 7일 뒤', () => {
    expect(iso(nextRepeat(due, 'weekly'))).toBe('2026-09-06T14:59:00.000Z')
  })

  it('매월은 한 달 뒤 같은 날', () => {
    expect(iso(nextRepeat(due, 'monthly'))).toBe('2026-09-30T14:59:00.000Z')
  })

  it('연말 경계도 정규화된다', () => {
    // 12/31 23:59 → 매월이면 다음 해 1월로 넘어간다 (1/31)
    expect(iso(nextRepeat(at('2026-12-31T14:59:00Z'), 'monthly'))).toBe('2027-01-31T14:59:00.000Z')
    expect(iso(nextRepeat(at('2026-12-31T14:59:00Z'), 'daily'))).toBe('2027-01-01T14:59:00.000Z')
  })

  it("'none' 은 그대로 둔다", () => {
    expect(iso(nextRepeat(due, 'none'))).toBe(iso(due))
  })
})

describe('groupOf', () => {
  const now = at('2026-08-20T01:00:00Z') // 8/20(목) 10:00 KST

  it('오늘 마감은 오늘', () => {
    expect(groupOf(at('2026-08-20T14:59:00Z'), now, false)).toBe('오늘')
  })

  it('기한이 지난 것도 오늘에 넣는다 — 별도 그룹을 만들지 않는다', () => {
    expect(groupOf(at('2026-08-19T14:59:00Z'), now, false)).toBe('오늘')
    expect(groupOf(at('2026-07-01T14:59:00Z'), now, false)).toBe('오늘')
  })

  it('내일 · 7일 내 · 나중', () => {
    expect(groupOf(at('2026-08-21T14:59:00Z'), now, false)).toBe('내일')
    expect(groupOf(at('2026-08-27T14:59:00Z'), now, false)).toBe('7일 내') // 오늘(8/20)로부터 7일째
    expect(groupOf(at('2026-08-28T14:59:00Z'), now, false)).toBe('나중') // 8일째 = 나중
  })

  it('완료는 기한과 무관하게 완료', () => {
    expect(groupOf(at('2026-08-20T14:59:00Z'), now, true)).toBe('완료')
    expect(groupOf(at('2026-07-01T14:59:00Z'), now, true)).toBe('완료')
  })

  it('기한이 없으면 미정, 완료면 기한 없어도 완료', () => {
    expect(groupOf(null, now, false)).toBe('미정')
    expect(groupOf(null, now, true)).toBe('완료')
  })
})

describe('그룹 순서', () => {
  it('미정은 7일 내와 나중 사이에 온다', () => {
    expect(GROUPS).toEqual(['오늘', '내일', '7일 내', '미정', '나중', '완료'])
  })
})

describe('formatDue', () => {
  const now = at('2026-08-20T01:00:00Z')

  it('오늘·내일은 시각을 크게, 날짜말을 작게', () => {
    expect(formatDue(at('2026-08-20T14:59:00Z'), now, false)).toEqual({ main: '23:59', sub: '오늘' })
    expect(formatDue(at('2026-08-21T14:59:00Z'), now, false)).toEqual({ main: '23:59', sub: '내일' })
  })

  it('그 밖에는 날짜를 크게', () => {
    expect(formatDue(at('2026-08-24T14:59:00Z'), now, false)).toEqual({ main: '8/24 월', sub: '23:59' })
  })

  it('완료는 날짜 + 완료', () => {
    expect(formatDue(at('2026-08-19T14:59:00Z'), now, true)).toEqual({ main: '8/19 수', sub: '완료' })
  })

  it('기한이 없으면 대시 + 미정 (완료면 대시 + 완료)', () => {
    expect(formatDue(null, now, false)).toEqual({ main: '—', sub: '미정' })
    expect(formatDue(null, now, true)).toEqual({ main: '—', sub: '완료' })
    expect(formatDue(null, now, false, 'en')).toEqual({ main: '—', sub: 'No date' })
  })
})

describe('기한이 지난 표시', () => {
  const now = at('2026-08-20T01:00:00Z')

  it('오늘 그룹에 들어가되 "지남"으로 구분된다', () => {
    expect(groupOf(at('2026-08-18T14:59:00Z'), now, false)).toBe('오늘')
    expect(formatDue(at('2026-08-18T14:59:00Z'), now, false)).toEqual({ main: '8/18 화', sub: '지남' })
  })
})

describe('datetime-local 왕복', () => {
  it('KST 벽시계로 나갔다가 같은 순간으로 돌아온다', () => {
    const d = at('2026-08-30T14:59:00Z') // 8/30 23:59 KST
    expect(toLocalInput(d)).toBe('2026-08-30T23:59')
    expect(iso(fromLocalInput(toLocalInput(d))!)).toBe(iso(d))
  })

  it('망가진 값은 null', () => {
    expect(fromLocalInput('')).toBeNull()
  })
})

describe('달력 격자', () => {
  it('월간은 항상 6주 42칸이고 이번 달 밖은 out 이다', () => {
    const g = monthGrid(2026, 7, 1) // 2026년 8월, 주 시작 월요일
    expect(g).toHaveLength(42)
    // 8/1 은 토요일 → 앞에 월~금 5칸이 7월
    expect(g.slice(0, 5).every((c) => c.out)).toBe(true)
    expect(g[5].out).toBe(false)
    expect(kstYmd(g[5].date).d).toBe(1)
  })

  it('주 시작 요일이 앞쪽 여백 칸 수를 바꾼다', () => {
    // 격자는 늘 42칸이라 out 총합은 그대로다. 달라지는 건 1일 앞의 여백이다.
    const lead = (weekStartsOn: number) =>
      monthGrid(2026, 7, weekStartsOn).findIndex((c) => !c.out)
    expect(lead(1)).toBe(5) // 8/1 은 토요일 → 월~금 5칸
    expect(lead(0)).toBe(6) // 일요일 시작이면 한 칸 더
  })

  it('주간 스트립은 그 주의 시작 요일부터 7일', () => {
    // 2026-08-20(목) 이 낀 주, 월요일 시작 → 8/17 ~ 8/23
    const w = weekStrip(2026, 7, 20, 1)
    expect(w).toHaveLength(7)
    expect(kstYmd(w[0].date).d).toBe(17)
    expect(kstYmd(w[6].date).d).toBe(23)
  })

  it('dayNumber 는 왕복한다', () => {
    const d = kstDate(2026, 7, 20)
    expect(kstYmd(dateFromDayNumber(dayNumber(d))).d).toBe(20)
  })
})

// lang 인자는 표시 전용이다. 기본값이 'ko' 라 위의 기존 단언들이 그대로 통과해야 하고,
// 'en' 을 넘겼을 때만 요일과 sub 라벨이 영문으로 바뀌어야 한다.
describe('formatDue / kstLabel 의 언어', () => {
  const now = at('2026-08-20T03:00:00Z')

  it('en 은 sub 라벨을 영문으로 준다', () => {
    expect(formatDue(at('2026-08-20T14:59:00Z'), now, false, 'en').sub).toBe('Today')
    expect(formatDue(at('2026-08-21T14:59:00Z'), now, false, 'en').sub).toBe('Tomorrow')
    expect(formatDue(at('2026-08-18T14:59:00Z'), now, false, 'en').sub).toBe('Overdue')
    expect(formatDue(at('2026-08-19T14:59:00Z'), now, true, 'en').sub).toBe('Done')
  })

  it('en 은 main 의 요일도 영문으로 준다', () => {
    expect(formatDue(at('2026-08-24T14:59:00Z'), now, false, 'en').main).toBe('8/24 Mon')
    expect(formatDue(at('2026-08-24T14:59:00Z'), now, false).main).toBe('8/24 월')
  })

  it('시각만 나오는 sub 는 언어와 무관하다', () => {
    expect(formatDue(at('2026-08-24T14:59:00Z'), now, false, 'en').sub).toBe('23:59')
  })

  it('kstLabel 은 en 에서 영문 요일을 쓴다', () => {
    expect(kstLabel(at('2026-08-24T14:59:00Z'), 'en')).toBe('8/24 (Mon)')
    expect(kstLabel(at('2026-08-24T14:59:00Z'))).toBe('8/24 (월)')
  })
})
