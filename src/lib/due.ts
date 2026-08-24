import type { Slot } from './subjects'
import type { Lang } from './i18n'

/** 한국은 1988년 이후 서머타임이 없다. Intl 이나 날짜 라이브러리를 쓸 이유가 없는 고정 오프셋. */
const KST = 9 * 60 * 60 * 1000
const DAY_MS = 86_400_000
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** formatDue 의 sub 칸. groupOf 의 Group 과 달리 저장되지 않는 표시 전용 값이다. */
const DUE_SUB_EN: Record<string, string> = {
  '완료': 'Done',
  '오늘': 'Today',
  '내일': 'Tomorrow',
  '지남': 'Overdue',
  '미정': 'No date',
}

/** 0=일요일, 1=월요일. M5 에서 설정값이 붙기 전까지의 기본값. */
export const DEFAULT_WEEK_START = 1

function kstParts(t: Date) {
  const s = new Date(t.getTime() + KST)
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth(),
    d: s.getUTCDate(),
    day: s.getUTCDay(),
    h: s.getUTCHours(),
    min: s.getUTCMinutes(),
  }
}

/** KST 벽시계 값 → 실제 순간. Date.UTC 가 일·월·연 넘침을 알아서 정규화한다. */
function fromKst(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min) - KST)
}

/** KST 기준 며칠째인가. 두 시각이 같은 날인지 비교할 때만 쓴다. */
const kstDayNumber = (t: Date) => Math.floor((t.getTime() + KST) / DAY_MS)

/**
 * 기본 기한 = 다음 주에 그 과목이 처음 있는 수업일의 전날 23:59 (KST).
 * 같은 날 여러 교시(팀티칭)는 하루로 묶인다 — 교시가 아니라 수업일이 기준이다.
 * 슬롯이 없으면 계산하지 않고 등록 시점 + 7일로 후퇴한다 (PRD 확정).
 */
export function nextDue(slots: Slot[], now: Date, weekStartsOn = DEFAULT_WEEK_START): Date {
  const p = kstParts(now)
  if (!slots?.length) return fromKst(p.y, p.m, p.d + 7, 23, 59)

  const sinceWeekStart = (p.day - weekStartsOn + 7) % 7
  const nextWeekStart = p.d - sinceWeekStart + 7
  const earliest = Math.min(...slots.map((s) => s.day))
  const offset = (earliest - weekStartsOn + 7) % 7

  return fromKst(p.y, p.m, nextWeekStart + offset - 1, 23, 59)
}

export type Group = '오늘' | '내일' | '이번 주' | '미정' | '나중' | '완료'
export const GROUPS: Group[] = ['오늘', '내일', '이번 주', '미정', '나중', '완료']

/**
 * 기한이 지난 것은 별도 그룹을 만들지 않고 "오늘" 맨 위로 올린다 (2026-08-20 결정).
 * 기한을 아예 안 잡은 할일(due = null)은 "미정"으로 묶어 "이번 주"와 "나중" 사이에 둔다.
 */
export function groupOf(
  due: Date | null,
  now: Date,
  done: boolean,
  weekStartsOn = DEFAULT_WEEK_START,
): Group {
  if (done) return '완료'
  if (!due) return '미정'
  const diff = kstDayNumber(due) - kstDayNumber(now)
  if (diff <= 0) return '오늘'
  if (diff === 1) return '내일'
  const untilWeekEnd = 6 - ((kstParts(now).day - weekStartsOn + 7) % 7)
  return diff <= untilWeekEnd ? '이번 주' : '나중'
}

/**
 * 시안 01 의 `.due` 두 줄. 가까운 기한은 시각을, 먼 기한은 날짜를 크게 보여준다.
 * lang 은 표시에만 쓴다 — 기본값이 'ko' 라 이 함수의 기존 호출부와 테스트는 그대로다.
 */
export function formatDue(
  due: Date | null,
  now: Date,
  done: boolean,
  lang: Lang = 'ko',
): { main: string; sub: string } {
  const sub0 = (ko: string) => (lang === 'en' ? DUE_SUB_EN[ko] : ko)
  // 기한이 없으면 시각·날짜가 없으니 대시로 두고 상태만 붙인다.
  if (!due) return { main: '—', sub: sub0(done ? '완료' : '미정') }
  const p = kstParts(due)
  const wd = lang === 'en' ? WEEKDAY_EN[p.day] : WEEKDAY[p.day]
  const sub = (ko: string) => (lang === 'en' ? DUE_SUB_EN[ko] : ko)
  const date = `${p.m + 1}/${p.d} ${wd}`
  const time = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`
  if (done) return { main: date, sub: sub('완료') }

  const diff = kstDayNumber(due) - kstDayNumber(now)
  if (diff === 0) return { main: time, sub: sub('오늘') }
  if (diff === 1) return { main: time, sub: sub('내일') }
  if (diff < 0) return { main: date, sub: sub('지남') }
  return { main: date, sub: time }
}

/** `<input type="datetime-local">` 은 KST 벽시계 문자열을 요구한다. */
export function toLocalInput(due: Date): string {
  const p = kstParts(due)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`
}

export function fromLocalInput(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  return fromKst(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}

/** 자동 기한 안내 문장에 쓰는 "8/31 (월)" 표기. */
export function kstLabel(d: Date, lang: Lang = 'ko'): string {
  const p = kstParts(d)
  return `${p.m + 1}/${p.d} (${lang === 'en' ? WEEKDAY_EN[p.day] : WEEKDAY[p.day]})`
}

/** 기한(수업 전날 23:59)에서 그 수업일을 되돌린다. */
export const classDayOf = (due: Date) => new Date(due.getTime() + DAY_MS)

/** 과목을 안 고른 개인 할일의 출발값. 자동 계산이 아니라 그냥 오늘 마감이다. */
export function todayEnd(now: Date): Date {
  const p = kstParts(now)
  return fromKst(p.y, p.m, p.d, 23, 59)
}

/** 달력이 쓰는 KST 날짜 도구. 정오를 앵커로 잡아 자정 경계 혼동을 피한다. */
export const dayNumber = (t: Date) => kstDayNumber(t)
export const kstYmd = (d: Date) => {
  const p = kstParts(d)
  return { y: p.y, m: p.m, d: p.d, day: p.day }
}
export const kstDate = (y: number, m: number, d: number) => fromKst(y, m, d, 12, 0)

/** dayNumber 를 되돌린 그 날의 KST 정오. */
export const dateFromDayNumber = (n: number) => new Date(n * DAY_MS - KST + 12 * 3600_000)

export type Cell = { date: Date; out: boolean }

/** 월간 6주 격자. 앞뒤 달 날짜는 out 으로 표시해 흐린다. */
export function monthGrid(y: number, m: number, weekStartsOn: number): Cell[] {
  const lead = (kstYmd(kstDate(y, m, 1)).day - weekStartsOn + 7) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const date = kstDate(y, m, 1 - lead + i)
    return { date, out: kstYmd(date).m !== m }
  })
}

/** 주간 7일 스트립. 주 시작 요일을 따른다. */
export function weekStrip(y: number, m: number, d: number, weekStartsOn: number): Cell[] {
  const back = (kstYmd(kstDate(y, m, d)).day - weekStartsOn + 7) % 7
  return Array.from({ length: 7 }, (_, i) => ({ date: kstDate(y, m, d - back + i), out: false }))
}
