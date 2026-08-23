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

/** 0~23 시(KST). null 이면 그 알림을 끈다. */
export type Notify = { morningHour: number | null; eveningHour: number | null }

/**
 * settings.ts 가 아니라 여기 있어야 한다 — Vercel 함수(api/notify.ts)가 이 값을
 * 읽는데, settings.ts 는 firebase.ts 를 끌고 오고 firebase.ts 는 모듈 최상단에서
 * import.meta.env 를 읽는다. import.meta.env 는 Vite 가 빌드 타임에 주입하는
 * 값이라 Vercel 의 순수 Node 런타임에는 없다 — 있으면 함수가 콜드 스타트마다
 * 죽는다. "정리한답시고" settings.ts 로 다시 옮기지 말 것.
 */
export const DEFAULT_NOTIFY: Notify = { morningHour: 7, eveningHour: 21 }

const KST_MS = 9 * 3600_000

export const kstHour = (now: Date) =>
  Math.floor(((now.getTime() + KST_MS) / 3600_000) % 24)

/** 지금 시각에 이 사용자가 받아야 할 알림들. 아침이 먼저다. */
export function pickKinds(hour: number, notify: Notify): NotifyKind[] {
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
    title: ko ? '할일 정리' : 'Wrap up',
    body: ko
      ? '오늘 받은 과제, 지금 넣어두자.'
      : "Add today's assignments before you forget.",
    screen: '/new',
  }
}
