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
 * soonBefore: "곧 마감" 알림의 여유 시간(시). 마감 이 시간 전 정각에 한 번 온다.
 *   null 이면 끈다. 정각(시각)이 아니라 과제 하나하나의 마감을 기준으로 걸리는
 *   사건 트리거라 morning·evening 과 성격이 다르다 — pickKinds 가 아니라
 *   countDueSoon 이 판정한다.
 */
export type Notify = {
  morningHour: number | null
  eveningHour: number | null
  soonBefore: number | null
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

/** 에폭 이후 KST 절대 시(정각 버킷). 자정을 넘겨도 이어지는 시간 차 계산에 쓴다. */
const kstAbsHour = (t: Date) => Math.floor((t.getTime() + KST_MS) / 3600_000)

/**
 * 지금 시각에 이 사용자가 받아야 할 정각 알림들. 아침이 먼저다.
 * soonBefore 는 여기서 보지 않는다 — 정각이 아니라 과제 마감을 기준으로 걸리므로
 * countDueSoon 이 따로 판정한다. 그래서 이 두 필드만 받는다.
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

/**
 * 지금 실행에서 "곧 마감" 알림에 걸릴 미완료 과제 수.
 *
 * 각 과제는 마감이 기준 정각에서 leadHours 시간(정각 버킷) 뒤일 때 선택된다.
 * 중복 억제와 지연 복구는 서버의 notificationDeliveries 기록이 담당한다.
 *
 * 정각 버킷 기준이라 마감 23:59 짜리를 leadHours=2 로 두면 21시 실행에 걸리고,
 * 실제 여유는 leadHours ~ leadHours+1 시간이다(늦기보다 이르게 알린다).
 * 서버는 놓친 정각을 최대90분 동안 다시 평가한다.
 * 완료 여부·null 마감 거르기는 호출부(서버)가 이미 처리해 dues 로 넘긴다.
 */
export function countDueSoon(dues: Date[], now: Date, leadHours: number): number {
  const nowH = kstAbsHour(now)
  let n = 0
  for (const due of dues) {
    if (kstAbsHour(due) - nowH === leadHours) n++
  }
  return n
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
