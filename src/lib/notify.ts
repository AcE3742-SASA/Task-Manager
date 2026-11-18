// 확장자를 명시한다. Vercel 의 @vercel/node 는 번들러가 아니라 nodeFileTrace 를
// 쓴다 — .ts 를 파일별로 .js 로 옮기고 import 경로는 그대로 둔다. package.json 의
// "type": "module" 때문에 출력이 ESM 이 되는데 Node 의 ESM 리졸버는 확장자를
// 붙여주지 않아서, './due' 는 런타임에 못 찾는 경로가 된다.
// 이 모듈은 api/notify.ts 가 읽으므로 확장자를 지우면 함수가 콜드스타트에 죽는다.
import { dayNumber } from './due.js'
import type { Lang } from './i18n'

/**
 * 클라이언트와 Vercel 함수가 함께 읽는 순수 모듈이다.
 * React·Firebase·DOM 을 import 하지 않는다 — 서버 번들에 딸려 들어간다.
 * (i18n.ts 의 makeT 를 안 쓰는 이유도 이것이다. 그 모듈은 settings.ts 를 경유해
 *  React 를 끌고 온다. 문구가 네 개뿐이라 여기서 직접 고른다.)
 */

export type NotifyKind = 'morning' | 'evening'

/**
 * morningHour·eveningHour: 0~23 시(KST). null 이면 그 알림을 끈다. 정각 트리거다.
 * soonBefore: 마감 전 간격들(시). 분 단위는 1/60시로 저장하며 이전 숫자 하나도 읽는다.
 *   null 또는 빈 배열이면 끈다. 과제 하나하나의 마감을 기준으로 걸리는
 *   사건 트리거라 morning·evening 과 성격이 다르다 — pickKinds 가 아니라
 *   서버가 마감 시각에서 간격을 빼서 예약 시점을 계산한다.
 */
export type Notify = {
  morningHour: number | null
  eveningHour: number | null
  soonBefore: number | number[] | null
}

export const DUE_SOON_HOURS = [1, 2, 3, 6, 12] as const
export const MAX_REMINDER_HOURS = 365 * 24

export function validReminderHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 / 60 && value <= MAX_REMINDER_HOURS
    && Math.abs(value * 60 - Math.round(value * 60)) < 1e-7
}

/** 저장된 단일 값과 여러 값을 같은 방식으로 읽고 중복·잘못된 값을 거른다. */
export function dueSoonHours(value: unknown): number[] {
  const values: unknown[] = Array.isArray(value) ? value : [value]
  return [...new Set(values.filter(validReminderHours).map(hour => Math.round(hour * 60) / 60))].sort((a, b) => a - b)
}

/**
 * settings.ts 가 아니라 여기 있어야 한다 — Vercel 함수(api/notify.ts)가 이 값을
 * 읽는데, settings.ts 는 firebase.ts 를 끌고 오고 firebase.ts 는 모듈 최상단에서
 * import.meta.env 를 읽는다. import.meta.env 는 Vite 가 빌드 타임에 주입하는
 * 값이라 Vercel 의 순수 Node 런타임에는 없다 — 있으면 함수가 콜드 스타트마다
 * 죽는다. "정리한답시고" settings.ts 로 다시 옮기지 말 것.
 */
// "곧 마감"은 기본 끔이다. 이 앱의 마감은 대부분 23:59 로 몰려 있어(설계 문서
// 참고) 켜 두면 저녁 알림과 겹치기 쉽다. 원하는 사용자가 Settings 에서 켠다.
export const DEFAULT_NOTIFY: Notify = { morningHour: 7, eveningHour: 21, soonBefore: null }

const KST_MS = 9 * 3600_000

export const kstHour = (now: Date) =>
  Math.floor(((now.getTime() + KST_MS) / 3600_000) % 24)

/**
 * 지금 시각에 이 사용자가 받아야 할 정각 알림들. 아침이 먼저다.
 * soonBefore 는 여기서 보지 않는다 — 정각이 아니라 과제 마감을 기준으로 걸리므로
 * 서버가 마감 시각으로 따로 판정한다. 그래서 이 두 필드만 받는다.
 */
export function pickKinds(
  hour: number,
  notify: Pick<Notify, 'morningHour' | 'eveningHour'>,
): NotifyKind[] {
  const kinds: NotifyKind[] = []
  if (notify.morningHour === hour) kinds.push('morning')
  if (notify.eveningHour === hour) kinds.push('evening')
  return kinds
}

export type DueCounts = { today: number; tomorrow: number }

/**
 * 기한이 지난 것은 오늘로 센다. due.ts 의 groupOf 가 '지남'을 '오늘'에 넣는 것과
 * 같은 규칙이다 — 화면과 알림이 다른 숫자를 말하면 안 된다.
 */
export function countDue(dues: Date[], now: Date): DueCounts {
  const today = dayNumber(now)
  let t = 0
  let m = 0
  for (const due of dues) {
    const n = dayNumber(due)
    if (n <= today) t++
    else if (n === today + 1) m++
  }
  return { today: t, tomorrow: m }
}

export type Copy = { title: string; body: string; screen: string }

export function notifyCopy(kind: NotifyKind, lang: Lang, counts: DueCounts): Copy {
  const ko = lang !== 'en'
  if (kind === 'morning') {
    return {
      title: ko ? '오늘의 요약' : "Today's summary",
      body: ko
        ? `오늘 마감 ${counts.today}건 · 내일 ${counts.tomorrow}건`
        : `Due today ${counts.today} · tomorrow ${counts.tomorrow}`,
      screen: '/',
    }
  }
  return {
    title: ko ? '할 일 정리' : 'Wrap up',
    body: ko
      ? '오늘 받은 과제를 잊기 전에 기록해 두세요.'
      : "Add today's assignments before you forget.",
    screen: '/new',
  }
}

/**
 * "곧 마감" 문구. morning·evening 과 달리 건수가 0 이면 서버가 아예 발송을
 * 건너뛰므로(사건 알림이라 조용한 게 맞다) 여기서 0 을 다루지 않는다.
 * 탭하면 List 로 보낸다.
 */
export function dueSoonCopy(lang: Lang, count: number): Copy {
  const ko = lang !== 'en'
  return {
    title: ko ? '곧 마감' : 'Due soon',
    body: ko ? `마감이 가까운 할 일 ${count}건` : `${count} tasks due soon`,
    screen: '/',
  }
}
