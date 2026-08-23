# M7 웹 푸시 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 정한 시각에 아침 요약·저녁 할일 정리 웹 푸시 알림이 아이폰 홈화면 PWA와 데스크탑 브라우저로 도착한다.

**Architecture:** GitHub Actions가 매시 정각에 Vercel Serverless Function(`api/notify.ts`)을 호출한다. 함수는 현재 KST 시각과 각 사용자의 설정을 대조해 대상을 고르고, Firestore에 저장된 푸시 구독으로 표준 Web Push(VAPID)를 쏜다. 브라우저에서는 우리가 직접 작성한 서비스워커가 `push` 이벤트를 받아 알림을 띄운다.

**Tech Stack:** React 18 · Vite 6 · TypeScript(strict) · Firebase(Auth + Firestore) · vite-plugin-pwa(injectManifest) · workbox · web-push · firebase-admin · Vercel Serverless Functions · GitHub Actions · Vitest

## Global Constraints

이 절의 규칙은 **모든 task의 요구사항에 암묵적으로 포함된다.**

- **설계 문서**: `docs/superpowers/specs/2026-08-23-release2-notifications-design.md`. 이 계획과 어긋나면 spec이 우선한다.
- **FCM을 쓰지 않는다.** `firebase/messaging` 을 절대 import 하지 않는다. 표준 Web Push API + VAPID만 쓴다.
- **클라이언트 번들 증가분 0.** `web-push` 와 `firebase-admin` 은 `api/` 에서만 import 한다. `src/` 어디에서도 import 하지 않는다.
- **시간대는 Asia/Seoul 고정.** 서버가 어느 시간대에서 돌든 KST 기준으로 판정한다. 기존 `src/lib/due.ts` 가 이미 KST 상수를 들고 있으므로 새 시간대 유틸을 만들지 않는다.
- **알림은 조건 없이 보낸다.** 마감 0건이어도 발송한다. "보낼 게 없으면 건너뛴다" 분기를 만들지 않는다.
- **마감 임박 알림은 범위 밖이다.** 만들지 않는다.
- **알림 시각은 시(hour) 단위 정수 0~23 또는 `null`(끔).** 분 단위를 지원하지 않는다 — cron이 매시 정각에만 돌기 때문이다. `<input type="time">` 을 쓰지 않는 이유가 이것이다.
- **언어**: 모든 사용자 노출 문자열은 한/영 양쪽을 쓴다. 화면 코드는 `useT()`, 서버 코드는 `notifyCopy()`(Task 1에서 만든다). 서버는 `src/lib/i18n.ts` 를 import 하지 않는다 — 그 모듈이 `./settings` 를 경유해 React와 firebase 클라이언트 SDK를 끌고 온다.
- **디자인**: 기존 neubrutalism 토큰만 쓴다. `--ink` `--sage` `--sagelt` `--cream` `--tan` `--muted` `--paper`, 테두리 `--b2`, 그림자 `--sh-xs`, 여백 `--gut`, 탭 타깃 `--tap`. **새 색을 도입하지 않는다.** 모서리는 항상 0 (`border-radius: 0`).
- **커밋 메시지는 한국어**로 쓴다. `feat:` 같은 conventional-commit 접두어를 쓰지 않는다 — 이 레포의 기존 15개 커밋이 전부 한국어 평문이다.
- **검증 명령**: `npm test` (vitest) 와 `npm run build` (`tsc --noEmit && vite build`). 두 개가 통과해야 커밋한다.

---

## File Structure

| 파일 | 신규/수정 | 책임 |
|---|---|---|
| `src/lib/notify.ts` | 신규 | 순수 로직. "몇 시에 누구에게 무엇을" 판정 + 알림 문구. 클라이언트와 서버가 함께 import 한다. React·Firebase 의존 없음 |
| `src/lib/notify.test.ts` | 신규 | 위 모듈의 테스트 |
| `src/lib/settings.ts` | 수정 | `notify` 필드 추가 + 중첩 필드 안전 저장 |
| `src/sw.ts` | 신규 | 서비스워커. precache · navigation fallback · push · notificationclick |
| `vite.config.ts` | 수정 | `generateSW` → `injectManifest` |
| `tsconfig.json` | 수정 | `api` 포함, `node` 타입 추가 |
| `src/lib/push.ts` | 신규 | 브라우저 구독 관리. 권한 요청 · subscribe · Firestore 저장 · 해제 |
| `src/screens/Settings.tsx` | 수정 | 알림 UI |
| `src/styles/app.css` | 수정 | 시각 선택 `<select>` 스타일 |
| `api/notify.ts` | 신규 | cron 엔드포인트. 인증 · 대상 선별 · 발송 · 죽은 구독 정리 |
| `.github/workflows/notify.yml` | 신규 | 매시 트리거 |

**의존성 경계**: `notify.ts` 는 아무것도 import 하지 않는 순수 모듈이고(단, `due.ts` 의 `dayNumber` 만 예외), 나머지가 전부 이것을 향한다. 이 방향을 뒤집지 않는다.

> **spec과의 차이 하나** — spec §5는 "서버가 알림 문구를 삼항식으로 직접 들고 있는다"고 썼다. 실제로는 순수 모듈 `notify.ts` 의 `notifyCopy()` 에 두고 서버가 그걸 import 한다. spec의 의도(React를 서버로 끌고 오지 않는다)는 그대로 지키면서 문구가 테스트 대상이 된다. `i18n.ts` 를 import 하지 않는다는 제약은 변함없다.

---

## Task 1: 순수 판정 로직과 설정 필드

**Files:**
- Create: `src/lib/notify.ts`
- Create: `src/lib/notify.test.ts`
- Modify: `src/lib/settings.ts`

**Interfaces:**
- Consumes: `src/lib/due.ts` 의 `dayNumber(t: Date): number` (KST 기준 일련 일자)
- Produces:
  - `type NotifyKind = 'morning' | 'evening'`
  - `type Notify = { morningHour: number | null; eveningHour: number | null }`
  - `kstHour(now: Date): number`
  - `pickKinds(hour: number, notify: Notify): NotifyKind[]`
  - `countDue(dues: Date[], now: Date): { today: number; tomorrow: number }`
  - `notifyCopy(kind, lang, counts): { title: string; body: string; screen: string }`
  - `settings.ts` 의 `Settings` 에 `notify: Notify` 추가, `DEFAULT_NOTIFY`, `saveNotify(uid, patch)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/notify.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it } from 'vitest'
import { countDue, kstHour, notifyCopy, pickKinds } from './notify'

/** 테스트를 로컬 시간대와 무관하게 쓰기 위해 UTC 순간으로 다룬다. KST = UTC+9. */
const at = (iso: string) => new Date(iso)

describe('kstHour', () => {
  it('UTC 를 KST 시로 옮긴다', () => {
    expect(kstHour(at('2026-08-23T00:00:00Z'))).toBe(9)
    expect(kstHour(at('2026-08-23T12:00:00Z'))).toBe(21)
  })

  it('자정을 넘기면 0 으로 돌아온다 — 24 가 나오면 안 된다', () => {
    expect(kstHour(at('2026-08-23T15:00:00Z'))).toBe(0) // 8/24 00:00 KST
    expect(kstHour(at('2026-08-23T22:30:00Z'))).toBe(7) // 8/24 07:30 KST
  })
})

describe('pickKinds', () => {
  const both = { morningHour: 7, eveningHour: 21 }

  it('아침 시각이면 아침만', () => {
    expect(pickKinds(7, both)).toEqual(['morning'])
  })

  it('저녁 시각이면 저녁만', () => {
    expect(pickKinds(21, both)).toEqual(['evening'])
  })

  it('아무 시각도 아니면 빈 배열', () => {
    expect(pickKinds(13, both)).toEqual([])
  })

  it('null 은 끈 것이다', () => {
    expect(pickKinds(7, { morningHour: null, eveningHour: 21 })).toEqual([])
    expect(pickKinds(21, { morningHour: 7, eveningHour: null })).toEqual([])
    expect(pickKinds(7, { morningHour: null, eveningHour: null })).toEqual([])
  })

  it('두 시각이 같으면 둘 다 보낸다 — 아침이 먼저다', () => {
    expect(pickKinds(9, { morningHour: 9, eveningHour: 9 })).toEqual(['morning', 'evening'])
  })

  it('0 시는 끔이 아니다', () => {
    expect(pickKinds(0, { morningHour: 0, eveningHour: 21 })).toEqual(['morning'])
  })
})

describe('countDue', () => {
  const now = at('2026-08-20T01:00:00Z') // 8/20(목) 10:00 KST

  it('오늘과 내일을 센다', () => {
    const dues = [
      at('2026-08-20T14:59:00Z'), // 8/20 23:59 KST — 오늘
      at('2026-08-20T02:00:00Z'), // 8/20 11:00 KST — 오늘
      at('2026-08-21T14:59:00Z'), // 8/21 23:59 KST — 내일
      at('2026-08-24T14:59:00Z'), // 8/24 — 둘 다 아님
    ]
    expect(countDue(dues, now)).toEqual({ today: 2, tomorrow: 1 })
  })

  it('기한이 지난 것은 오늘로 센다 — groupOf 와 같은 규칙이다', () => {
    const dues = [at('2026-08-18T14:59:00Z'), at('2026-07-01T14:59:00Z')]
    expect(countDue(dues, now)).toEqual({ today: 2, tomorrow: 0 })
  })

  it('아무것도 없으면 0 건', () => {
    expect(countDue([], now)).toEqual({ today: 0, tomorrow: 0 })
  })

  it('KST 자정 직전에도 날짜가 밀리지 않는다', () => {
    const late = at('2026-08-20T14:30:00Z') // 8/20 23:30 KST, 아직 목요일
    expect(countDue([at('2026-08-20T14:59:00Z')], late)).toEqual({ today: 1, tomorrow: 0 })
  })
})

describe('notifyCopy', () => {
  it('아침은 건수를 담고 List 로 보낸다', () => {
    const c = notifyCopy('morning', 'ko', { today: 2, tomorrow: 1 })
    expect(c.body).toBe('오늘 마감 2건 · 내일 1건')
    expect(c.screen).toBe('/')
  })

  it('0 건이어도 문구를 만든다 — 발송을 건너뛰지 않는다', () => {
    expect(notifyCopy('morning', 'ko', { today: 0, tomorrow: 0 }).body).toBe(
      '오늘 마감 0건 · 내일 0건',
    )
  })

  it('저녁은 건수를 쓰지 않고 New 로 보낸다', () => {
    const c = notifyCopy('evening', 'ko', { today: 0, tomorrow: 0 })
    expect(c.body).toBe('오늘 받은 과제, 지금 넣어두자.')
    expect(c.screen).toBe('/new')
  })

  it('영어 문구가 따로 있다', () => {
    expect(notifyCopy('morning', 'en', { today: 2, tomorrow: 1 }).body).toBe(
      'Due today 2 · tomorrow 1',
    )
    expect(notifyCopy('evening', 'en', { today: 0, tomorrow: 0 }).body).toBe(
      "Add today's assignments before you forget.",
    )
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./notify"`

- [ ] **Step 3: `src/lib/notify.ts` 를 만든다**

```ts
import { dayNumber } from './due'
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS — `notify.test.ts` 의 15개 테스트 전부 통과, 기존 `due.test.ts` · `subjects.test.ts` 도 그대로 통과

- [ ] **Step 5: `src/lib/settings.ts` 에 `notify` 를 넣는다**

`Settings` 타입, 기본값, 저장 함수를 고친다. 아래 조각을 각각 교체한다.

firestore import 줄을 교체:

```ts
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
```

`Lang` import 아래에 추가:

```ts
import type { Notify } from './notify'
```

`Settings` 타입과 기본값 교체:

```ts
/** 0 = 일요일, 1 = 월요일. "이번 주"의 경계와 자동 기한 계산이 함께 읽는다. */
export type Settings = { weekStartsOn: 0 | 1; lang: Lang; notify: Notify }

export const DEFAULT_NOTIFY: Notify = { morningHour: 7, eveningHour: 21 }
export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  lang: 'ko',
  notify: DEFAULT_NOTIFY,
}
```

`saveSettings` 아래에 `saveNotify` 를 추가:

```ts
/**
 * notify 는 중첩 객체다. saveSettings(uid, { notify: {...} }) 로 부분 저장하면
 * merge:true 여도 notify 통째로 교체돼서 아침만 바꿔도 저녁 값이 날아간다.
 * dot-path 로 쓰면 지정한 키만 바뀐다.
 */
export function saveNotify(uid: string, patch: Partial<Notify>) {
  const dotted: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(patch)) dotted[`notify.${k}`] = v
  return updateDoc(ref(uid), dotted)
}
```

`useSettings` 안의 스냅샷 핸들러를 교체한다. 얕은 스프레드는 `notify` 가 없는 기존 문서를 만나면 `undefined` 를 넣어 화면이 죽는다:

```ts
      (snap) => {
        const d = (snap.data() ?? {}) as Partial<Settings>
        // notify 는 한 겹 더 들어가 있어 얕은 스프레드로는 기본값이 안 채워진다.
        // 08-21 이전에 만들어진 설정 문서에는 이 필드가 아예 없다.
        setSettings({ ...DEFAULT_SETTINGS, ...d, notify: { ...DEFAULT_NOTIFY, ...d.notify } })
      },
```

- [ ] **Step 6: 마이그레이션 없이 기존 문서가 읽히는지 테스트로 고정한다**

`src/lib/notify.test.ts` 맨 아래에 추가한다. `useSettings` 자체는 Firestore가 필요해 테스트하지 않고, 병합 규칙만 순수하게 확인한다.

```ts
import { DEFAULT_NOTIFY, DEFAULT_SETTINGS } from './settings'
import type { Settings } from './settings'

describe('설정 병합 — 마이그레이션 없이 옛 문서를 읽는다', () => {
  const merge = (d: Partial<Settings>): Settings => ({
    ...DEFAULT_SETTINGS,
    ...d,
    notify: { ...DEFAULT_NOTIFY, ...d.notify },
  })

  it('notify 가 없는 옛 문서는 기본값을 받는다', () => {
    expect(merge({ weekStartsOn: 0, lang: 'en' }).notify).toEqual({
      morningHour: 7,
      eveningHour: 21,
    })
  })

  it('한쪽만 저장된 문서는 나머지만 기본값으로 채운다', () => {
    expect(merge({ notify: { morningHour: 6 } as never }).notify).toEqual({
      morningHour: 6,
      eveningHour: 21,
    })
  })

  it('null 은 기본값으로 덮이지 않는다 — 꺼둔 상태가 유지돼야 한다', () => {
    expect(merge({ notify: { morningHour: null } as never }).notify.morningHour).toBeNull()
  })
})
```

- [ ] **Step 7: 전체 검증**

Run: `npm test && npm run build`
Expected: 테스트 전부 PASS, 빌드 성공. `Settings.tsx` 는 아직 `notify` 를 안 쓰므로 타입 에러가 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts src/lib/settings.ts
git commit -m "알림 판정 로직과 설정 필드

시각·건수·문구를 정하는 순수 모듈을 만들었다. 클라이언트와
Vercel 함수가 같이 읽어야 해서 React·Firebase 를 import 하지 않는다.

notify 는 중첩 객체라 merge:true 로 부분 저장하면 통째로
교체된다. dot-path 로 쓰는 saveNotify 를 따로 뒀고, 읽을 때도
한 겹 더 병합해 이 필드가 없는 옛 설정 문서를 그대로 읽는다."
```

---

## Task 2: 서비스워커를 직접 소유한다

> **이 task가 M7 전체에서 가장 위험하다.** `vite.config.ts` 의 주석이 경고하듯 서비스워커가 `/__/auth/` 를 가로채면 프록시된 Firebase 응답이 캐시에 굳어 **Google 로그인이 조용히 깨진다.** generateSW가 자동으로 해주던 navigation fallback과 denylist를 손으로 옮기는 작업이므로, 알림보다 로그인 회귀 확인이 먼저다.

**Files:**
- Create: `src/sw.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces: `push` 이벤트로 `{ title, body, screen }` JSON을 받아 알림을 띄우는 서비스워커. Task 3의 `navigator.serviceWorker.ready` 와 Task 5의 payload 형식이 여기에 맞춰진다.

- [ ] **Step 1: workbox 의존성을 설치한다**

```bash
npm i -D workbox-precaching workbox-routing @types/node
```

Expected: `package.json` 의 devDependencies에 세 개가 추가된다. `vite-plugin-pwa` 가 이미 workbox를 끌고 있으므로 버전 충돌이 없어야 한다.

- [ ] **Step 2: `src/sw.ts` 를 만든다**

```ts
/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

/**
 * generateSW 에서 injectManifest 로 옮겨 온 것이다. push 이벤트를 받으려면
 * 서비스워커 코드를 우리가 소유해야 한다. 아래 두 가지는 generateSW 가
 * 자동으로 해주던 것을 손으로 옮긴 것이므로 지우면 안 된다:
 *   1. registerType:'autoUpdate' 의 실체 = skipWaiting + clientsClaim
 *   2. navigateFallback 과 그 denylist
 */

self.skipWaiting()
precacheAndRoute(self.__WB_MANIFEST)

/**
 * SPA 라우팅. denylist 가 이 파일에서 제일 중요한 줄이다.
 * /__/auth/ 는 vercel.json 이 Firebase 로 프록시하는 로그인 핸들러다.
 * 이걸 index.html 로 떨어뜨리거나 캐시에 굳히면 로그인이 조용히 깨진다.
 * /api/ 는 알림 cron 엔드포인트다. 네비게이션이 아니지만 같이 막아 둔다.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/__\/auth\//, /^\/api\//],
  }),
)

type Payload = { title: string; body: string; screen: string }

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let p: Payload
  try {
    p = event.data.json() as Payload
  } catch {
    // 형식이 깨진 푸시는 조용히 버린다. userVisibleOnly 계약상 알림을
    // 아예 안 띄우면 브라우저가 경고를 대신 띄우지만, 가짜 알림보다는 낫다.
    return
  }
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 같은 종류가 쌓이지 않게 한다. 어제 저녁 알림이 남아 있으면 덮어쓴다.
      tag: p.screen,
      data: { screen: p.screen },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const screen = (event.notification.data as { screen?: string } | null)?.screen ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열려 있는 창이 있으면 그걸 쓴다. 홈 화면 PWA 는 창이 하나뿐이라
      // 새로 열면 앱이 통째로 재시작한 것처럼 보인다.
      for (const c of list) {
        if ('focus' in c) {
          void c.navigate(new URL(screen, self.location.origin).href)
          return c.focus()
        }
      }
      return self.clients.openWindow(screen)
    }),
  )
})
```

- [ ] **Step 3: `vite.config.ts` 를 injectManifest 로 바꾼다**

`VitePWA({...})` 안에서 `registerType` 아래에 세 줄을 추가하고, `workbox` 블록을 `injectManifest` 블록으로 교체한다. `manifest` 블록은 손대지 않는다.

```ts
    VitePWA({
      registerType: 'autoUpdate',
      // push 이벤트 핸들러를 넣으려면 서비스워커를 우리가 써야 한다.
      // navigateFallbackDenylist 는 src/sw.ts 안으로 옮겨 갔다.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['apple-touch-icon.png', 'fonts/*.woff2'],
      manifest: {
        /* 변경 없음 — 기존 블록 그대로 둔다 */
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
    }),
```

- [ ] **Step 4: `tsconfig.json` 이 `sw.ts` 와 `api/` 를 받아들이게 한다**

`types` 배열에 `node` 를 추가하고 `include` 에 `api` 를 넣는다. `api/` 는 Task 5에서 만들지만 지금 넣어 둬도 없는 폴더는 무시된다.

```json
    "types": ["vite/client", "vite-plugin-pwa/client", "node"],
```
```json
  "include": ["src", "api", "vite.config.ts"]
```

> **막히면**: `tsc --noEmit` 이 DOM과 WebWorker 전역 충돌(`self` 의 타입이 다르다는 류)을 뱉으면, `tsconfig.json` 에 `"exclude": ["src/sw.ts"]` 를 추가한다. vite-plugin-pwa가 esbuild로 따로 빌드하므로 동작에는 영향이 없다. 타입 검사를 잃는 대신 빌드가 돈다. 이 경우 커밋 메시지에 그 사실을 적는다.

- [ ] **Step 5: 빌드가 서비스워커를 만들어내는지 확인한다**

Run: `npm run build && ls -la dist/sw.js && grep -c "__WB_MANIFEST" dist/sw.js`
Expected: 빌드 성공, `dist/sw.js` 존재, `__WB_MANIFEST` 가 **0건**(빌드 시점에 실제 파일 목록으로 치환됐으므로 문자열이 남아 있으면 안 된다)

- [ ] **Step 6: denylist 가 산출물에 들어갔는지 확인한다**

Run: `grep -o "__/auth" dist/sw.js | head -1`
Expected: `__/auth` 가 출력된다. 안 나오면 denylist가 빌드에서 증발한 것이므로 Step 2로 돌아간다.

- [ ] **Step 7: 로컬에서 로그인 왕복을 확인한다**

```bash
npm run build && npm run preview
```

브라우저에서 preview 주소를 열고 순서대로 확인한다. **`npm run dev` 로는 확인할 수 없다** — 서비스워커는 프로덕션 빌드에서만 등록된다.

1. DevTools → Application → Service Workers 에서 `sw.js` 가 activated 상태인지
2. Google 로그인 → 성공하는지
3. 로그아웃 → 다시 로그인 → **성공하는지** (여기서 깨지면 denylist 문제다)
4. Application → Cache Storage 에 `/__/auth/` 로 시작하는 항목이 **없는지**
5. 하드 리로드 후에도 로그인 상태가 유지되는지

Expected: 5개 전부 정상. 하나라도 실패하면 커밋하지 않고 `src/sw.ts` 의 denylist를 고친다.

- [ ] **Step 8: 커밋**

```bash
git add src/sw.ts vite.config.ts tsconfig.json package.json package-lock.json
git commit -m "서비스워커를 직접 작성하도록 전환

push 이벤트 핸들러를 넣으려면 generateSW 로는 안 된다.
injectManifest 로 바꾸고 sw.ts 를 직접 썼다.

generateSW 가 대신 해주던 두 가지를 손으로 옮겼다: autoUpdate 의
실체인 skipWaiting/clientsClaim, 그리고 navigateFallback 과
denylist. denylist 의 /__/auth/ 를 놓치면 프록시된 Firebase
응답이 캐시에 굳어 로그인이 조용히 깨진다 — preview 빌드에서
로그아웃·재로그인 왕복으로 확인했다."
```

---

## Task 3: 브라우저 구독 관리

**Files:**
- Create: `src/lib/push.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Task 2의 서비스워커 등록 (`navigator.serviceWorker.ready`)
- Produces:
  - `pushSupported(): boolean`
  - `permission(): NotificationPermission | 'unsupported'`
  - `subscribeThisDevice(uid: string): Promise<void>` — 실패 시 `unsupported` · `nokey` · `denied` · `default` · `nokeys` 중 하나를 메시지로 담아 throw
  - `unsubscribeThisDevice(uid: string): Promise<void>`
  - `isSubscribedHere(): Promise<boolean>`
  - Firestore 문서 형태: `users/{uid}/pushSubs/{endpointTail}` = `{ endpoint: string, keys: { p256dh: string, auth: string }, ua: string, createdAt: Timestamp }`

- [ ] **Step 1: `src/lib/push.ts` 를 만든다**

```ts
import { Timestamp, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 표준 Push API 만 쓴다. firebase/messaging 을 쓰지 않는 이유는
 * spec 에 적혀 있다 — iOS Safari PWA 에서 지원 판정이 불안정하다.
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const permission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported'

/** VAPID 공개키는 base64url 문자열로 오는데 subscribe 는 바이트를 받는다. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * 문서 ID 는 endpoint 의 마지막 경로 조각이다. 푸시 서비스가 발급한 토큰이라
 * 기기마다 다르고, 같은 기기가 재구독해도 바뀌므로 죽은 구독은 Task 5 가
 * 410 응답을 보고 지운다.
 * ponytail: 서로 다른 푸시 서비스가 같은 꼬리를 낼 확률은 무시한다.
 * 사용자 1~5명 전제. 충돌이 실제로 보이면 endpoint 전체를 해시한다.
 */
const idOf = (endpoint: string) => endpoint.split('/').pop() ?? endpoint.slice(-64)

const subRef = (uid: string, endpoint: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'pushSubs', idOf(endpoint))
}

/** 이 기기가 이미 구독돼 있는가. Settings 화면의 토글 초기 상태다. */
export async function isSubscribedHere(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) !== null
}

export async function subscribeThisDevice(uid: string): Promise<void> {
  if (!pushSupported()) {
    // iOS 는 홈 화면에 설치하지 않으면 PushManager 자체가 없다.
    // 이 안내가 실제로 제일 자주 보게 될 메시지다.
    throw new Error('unsupported')
  }
  if (!VAPID_PUBLIC) throw new Error('nokey')

  const granted = await Notification.requestPermission()
  if (granted !== 'granted') throw new Error(granted) // 'denied' | 'default'

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    }))

  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('nokeys')

  await setDoc(subRef(uid, sub.endpoint), {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    ua: navigator.userAgent,
    createdAt: Timestamp.now(),
  })
}

export async function unsubscribeThisDevice(uid: string): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const ref = subRef(uid, sub.endpoint)
  await sub.unsubscribe()
  // 구독 해제가 먼저다. Firestore 삭제가 실패해도 브라우저는 이미 안 받는다.
  if ((await getDoc(ref)).exists()) await deleteDoc(ref)
}
```

- [ ] **Step 2: 타입 검사**

Run: `npm run build`
Expected: 성공. `VITE_VAPID_PUBLIC` 이 아직 `.env.local` 에 없어도 타입상 `string | undefined` 이므로 통과한다.

- [ ] **Step 3: `.env.example` 에 새 변수를 적는다**

기존 내용 끝에 추가한다:

```
# 웹 푸시 공개키. npx web-push generate-vapid-keys 로 만든 publicKey 를 그대로 넣는다.
# 비밀키는 여기가 아니라 Vercel 환경변수(VAPID_PRIVATE)에만 둔다.
VITE_VAPID_PUBLIC=
```

- [ ] **Step 4: 커밋**

```bash
git add src/lib/push.ts .env.example
git commit -m "브라우저 푸시 구독 관리

권한 요청·subscribe·Firestore 저장·해제. 문서 ID 는 endpoint 의
마지막 조각을 쓴다 — 같은 기기가 재구독해도 문서가 안 늘어난다.

firebase/messaging 을 쓰지 않는다. iOS 홈 화면 설치본이 아니면
PushManager 자체가 없어서, 그 경우를 unsupported 로 구분해
설치 안내를 띄울 수 있게 했다."
```

---

## Task 4: Settings 화면의 알림 UI

**Files:**
- Modify: `src/screens/Settings.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: Task 1의 `saveNotify` · `useAppSettings().notify`; Task 3의 `pushSupported` · `permission` · `subscribeThisDevice` · `unsubscribeThisDevice` · `isSubscribedHere`
- Produces: 사용자가 시각을 바꾸고 기기를 구독할 수 있는 화면. 뒤따르는 task가 의존하는 export는 없다.

- [ ] **Step 1: `<select>` 스타일을 추가한다**

`src/styles/app.css` 의 `.seg button.on { ... }` 블록 **바로 뒤**에 넣는다. 코드베이스에 `<select>` 가 처음 들어오므로 스타일이 없다.

```css
/* ─── 시각 선택 (알림). 코드베이스 첫 select 라 .inp 의 규칙을 줄여 옮겼다. ─── */
.hourpick {
  font-family: var(--pix);
  font-size: 11px;
  border: var(--b2);
  background: var(--paper);
  color: var(--ink);
  padding: 6px 8px;
  min-height: 32px;
  flex: none;
  /* iOS 가 select 를 제멋대로 둥글게 만든다. 모서리 0 이 이 디자인의 전부다. */
  border-radius: 0;
  -webkit-appearance: none;
  appearance: none;
}
.hourpick:disabled {
  opacity: 0.4;
}
```

- [ ] **Step 2: `src/screens/Settings.tsx` 의 import 를 고친다**

기존 import 블록을 아래로 교체한다.

```tsx
import { useEffect, useState } from 'react'
import { Screen } from '../components/Screen'
import { SubjectIcon } from '../components/subject-icons'
import { IconArrow } from '../components/icons'
import { useT } from '../lib/i18n'
import type { T } from '../lib/i18n'
import { saveNotify, saveSettings, useAppSettings } from '../lib/settings'
import {
  isSubscribedHere,
  permission,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../lib/push'
import { APP_VERSION } from '../lib/version'
```

- [ ] **Step 3: 시각 선택 컴포넌트를 추가한다**

`Seg` 컴포넌트 정의 **바로 뒤**에 넣는다.

```tsx
const HOURS = Array.from({ length: 24 }, (_, h) => h)

function HourPick({
  value,
  disabled,
  t,
  onPick,
}: {
  value: number | null
  disabled: boolean
  t: T
  onPick: (v: number | null) => void
}) {
  return (
    <select
      className="hourpick"
      value={value === null ? 'off' : String(value)}
      disabled={disabled}
      aria-label={t('알림 시각', 'Notification time')}
      onChange={(e) => onPick(e.target.value === 'off' ? null : Number(e.target.value))}
    >
      <option value="off">{t('끔', 'Off')}</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 4: 구독 상태를 다루는 훅을 추가한다**

`HourPick` 뒤, `export function Settings` 앞에 넣는다.

```tsx
/**
 * 구독 여부는 Firestore 가 아니라 이 브라우저의 PushManager 가 진실이다.
 * 기기마다 다르므로 설정 문서에 담지 않는다.
 */
function useThisDevice(uid: string) {
  const [on, setOn] = useState(false)
  const [perm, setPerm] = useState(permission())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void isSubscribedHere().then(setOn)
  }, [])

  async function toggle() {
    setBusy(true)
    setErr(null)
    try {
      if (on) {
        await unsubscribeThisDevice(uid)
        setOn(false)
      } else {
        await subscribeThisDevice(uid)
        setOn(true)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setPerm(permission())
      setBusy(false)
    }
  }

  return { on, perm, busy, err, toggle }
}
```

- [ ] **Step 5: 두 개의 `REL 2` 자리표시 행을 실제 UI로 교체한다**

`Settings` 함수 본문 앞부분을 고친다:

```tsx
export function Settings({ uid }: { uid: string }) {
  const t = useT()
  const { weekStartsOn, lang, notify } = useAppSettings()
  const dev = useThisDevice(uid)
```

그리고 기존의 `매일 알림` · `마감 임박 알림` 두 `<div className="row off">` 블록을 **통째로** 아래로 교체한다.

```tsx
        <div className="row">
          <SubjectIcon id="bell" />
          <span className="rl">
            <b>{t('이 기기로 알림 받기', 'Notify this device')}</b>
            <em>
              {dev.err === 'unsupported'
                ? t('홈 화면에 추가한 뒤 다시 시도', 'Add to Home Screen, then retry')
                : dev.err === 'denied' || dev.perm === 'denied'
                  ? t('브라우저 설정에서 허용해야 한다', 'Allow it in browser settings')
                  : dev.err === 'nokey'
                    ? t('VAPID 키가 설정되지 않았다', 'VAPID key is missing')
                    : dev.err
                      ? t('실패했다. 다시 시도해 보자', 'Failed. Try again')
                      : dev.on
                        ? t('켜짐', 'On')
                        : t('꺼짐', 'Off')}
            </em>
          </span>
          <span className="seg">
            <button
              className={dev.on ? 'on' : ''}
              aria-pressed={dev.on}
              disabled={dev.busy || !pushSupported()}
              onClick={() => void dev.toggle()}
            >
              {dev.on ? t('끄기', 'OFF') : t('켜기', 'ON')}
            </button>
          </span>
        </div>

        <div className="row">
          <SubjectIcon id="sun" />
          <span className="rl">
            <b>{t('아침 요약', 'Morning summary')}</b>
            <em>{t('오늘·내일 마감 건수', "Today's and tomorrow's count")}</em>
          </span>
          <HourPick
            value={notify.morningHour}
            disabled={!dev.on}
            t={t}
            onPick={(v) => void saveNotify(uid, { morningHour: v })}
          />
        </div>

        <div className="row">
          <SubjectIcon id="moon" />
          <span className="rl">
            <b>{t('할일 정리', 'Wrap up')}</b>
            <em>{t('오늘 받은 과제 넣기', "Add today's assignments")}</em>
          </span>
          <HourPick
            value={notify.eveningHour}
            disabled={!dev.on}
            t={t}
            onPick={(v) => void saveNotify(uid, { eveningHour: v })}
          />
        </div>
```

> **아이콘 확인**: `sun` 과 `moon` 이 40종 세트에 없으면 `SubjectIcon` 이 빈 칸을 낸다. `grep -o "'[a-z]*':" src/components/subject-icons.tsx | sort -u` 로 실제 id 목록을 확인하고, 없으면 있는 것 중에서 고른다 — 아침은 `calendar`, 저녁은 `hourglass` 가 무난하다. **새 아이콘을 그리지 않는다.**

> **`마감 임박 알림` 행은 되살리지 않는다.** 범위에서 제외했으므로 `REL 2` 태그가 붙은 채로 출시되면 거짓말이 된다. 나중에 만들 때 그때 추가한다.

- [ ] **Step 6: 빌드와 화면 확인**

Run: `npm run build && npm run preview`

preview 주소에서 확인한다:
1. 설정 화면에 알림 행 3개가 보인다
2. 구독이 꺼져 있으면 시각 `<select>` 두 개가 흐리게 비활성
3. "켜기"를 누르면 브라우저 권한 팝업이 뜬다
4. 허용하면 라벨이 "켜짐"으로 바뀌고 `<select>` 가 활성화된다
5. 시각을 바꾸면 Firestore `users/{uid}/settings/app` 의 `notify.morningHour` 가 바뀐다 (DevTools → Network 또는 Firebase 콘솔)
6. 아침 시각만 바꿔도 저녁 값이 남아 있다 ← **dot-path 저장이 되는지 보는 지점이다**
7. 언어를 EN 으로 바꾸면 세 행의 문구가 영어가 된다

Expected: 7개 전부 정상.

- [ ] **Step 7: 커밋**

```bash
git add src/screens/Settings.tsx src/styles/app.css
git commit -m "설정 화면에 알림 UI

REL 2 자리표시로 있던 두 행을 실제 컨트롤로 바꿨다. 구독 여부는
설정 문서가 아니라 이 브라우저의 PushManager 가 진실이라 기기별
상태로 다룬다.

마감 임박 알림 행은 되살리지 않았다. 범위에서 뺐으므로 REL 2
태그를 단 채로 출시하면 거짓말이 된다.

코드베이스 첫 select 라 .hourpick 스타일을 새로 넣었다. iOS 가
select 를 둥글게 만드는 것만 .inp 에서 그대로 가져왔다."
```

---

## Task 5: cron 엔드포인트

**Files:**
- Create: `api/notify.ts`

**Interfaces:**
- Consumes: Task 1의 `kstHour` · `pickKinds` · `countDue` · `notifyCopy` · `DEFAULT_NOTIFY`; Task 3이 저장한 `users/{uid}/pushSubs/*` 문서 형태; Task 2의 서비스워커가 기대하는 payload `{ title, body, screen }`
- Produces: `POST /api/notify` — `Authorization: Bearer <CRON_SECRET>` 필요. `{ ok: true, hour, sent, pruned }` 를 돌려준다. Task 6이 이것을 호출한다.

- [ ] **Step 1: 서버 의존성을 설치한다**

```bash
npm i web-push firebase-admin && npm i -D @vercel/node @types/web-push
```

> `web-push` 와 `firebase-admin` 이 dependencies 로 들어가지만 **클라이언트 번들에는 안 들어간다** — `src/` 어디에서도 import 하지 않기 때문에 Vite가 트리에 넣지 않는다. Step 5에서 이걸 실제로 확인한다.

- [ ] **Step 2: `api/notify.ts` 를 만든다**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'
import { DEFAULT_NOTIFY } from '../src/lib/settings'
import { countDue, kstHour, notifyCopy, pickKinds } from '../src/lib/notify'
import type { Notify } from '../src/lib/notify'
import type { Lang } from '../src/lib/i18n'

/**
 * GitHub Actions 가 매시 정각에 호출한다. 공개 URL 이므로 CRON_SECRET 검사가
 * 유일한 방어선이다. 시크릿이 없으면 부팅 자체를 실패시킨다 —
 * 환경변수를 빠뜨린 채 배포하면 엔드포인트가 무방비로 열린다.
 */
const SECRET = process.env.CRON_SECRET
if (!SECRET) throw new Error('CRON_SECRET 이 없다')

const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT
if (!SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT 가 없다')

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(SERVICE_ACCOUNT)) })
}
const db = getFirestore()

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? 'mailto:ejunhong03@gmail.com',
  process.env.VAPID_PUBLIC ?? '',
  process.env.VAPID_PRIVATE ?? '',
)

type SubDoc = { endpoint: string; keys: { p256dh: string; auth: string } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const now = new Date()
  const hour = kstHour(now)

  /**
   * users 컬렉션을 나열하지 않는다 — task 와 settings 가 서브컬렉션에만 쓰여서
   * users/{uid} 부모 문서가 실제로 존재하지 않는다. 구독 문서에서 uid 를 역산한다.
   * 덤으로 미구독자가 공짜로 걸러진다.
   * ponytail: 전체 스캔이다. 사용자 1~5명 전제. 수십 명이 되면
   * settings 에 notifyHours 를 두고 collectionGroup 인덱스 쿼리로 바꾼다.
   */
  const subs = await db.collectionGroup('pushSubs').get()
  const byUid = new Map<string, { id: string; data: SubDoc }[]>()
  for (const d of subs.docs) {
    // 경로: users/{uid}/pushSubs/{id}
    const uid = d.ref.parent.parent?.id
    if (!uid) continue
    const list = byUid.get(uid) ?? []
    list.push({ id: d.id, data: d.data() as SubDoc })
    byUid.set(uid, list)
  }

  let sent = 0
  let pruned = 0

  for (const [uid, list] of byUid) {
    // 한 사용자의 실패가 다른 사용자의 발송을 막지 않는다.
    try {
      const snap = await db.doc(`users/${uid}/settings/app`).get()
      const s = (snap.data() ?? {}) as { lang?: Lang; notify?: Partial<Notify> }
      const notify: Notify = { ...DEFAULT_NOTIFY, ...s.notify }
      const kinds = pickKinds(hour, notify)
      if (!kinds.length) continue

      let counts = { today: 0, tomorrow: 0 }
      if (kinds.includes('morning')) {
        const tasks = await db.collection(`users/${uid}/tasks`).where('done', '==', false).get()
        counts = countDue(
          tasks.docs.map((t) => t.get('due').toDate() as Date),
          now,
        )
      }

      for (const kind of kinds) {
        const payload = JSON.stringify(notifyCopy(kind, s.lang ?? 'ko', counts))
        for (const sub of list) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.data.endpoint, keys: sub.data.keys },
              payload,
            )
            sent++
          } catch (e) {
            // 404/410 = 이 구독은 죽었다. 영구히 쌓이지 않게 지운다.
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) {
              await db.doc(`users/${uid}/pushSubs/${sub.id}`).delete()
              pruned++
            } else {
              console.error(`발송 실패 uid=${uid} code=${code}`, e)
            }
          }
        }
      }
    } catch (e) {
      console.error(`사용자 처리 실패 uid=${uid}`, e)
    }
  }

  return res.status(200).json({ ok: true, hour, sent, pruned })
}
```

- [ ] **Step 3: 타입 검사**

Run: `npm run build`
Expected: 성공. 실패하면 대개 `tsconfig.json` 의 `include` 에 `api` 가 빠졌거나 `types` 에 `node` 가 없는 것이다 (Task 2 Step 4).

- [ ] **Step 4: 인증 거부를 로컬에서 확인한다**

`vercel dev` 없이 확인할 수 있는 최소 검사다. 401 경로만 본다.

```bash
CRON_SECRET=test FIREBASE_SERVICE_ACCOUNT='{"projectId":"x","clientEmail":"x@x","privateKey":"x"}' \
  npx tsx -e "
import h from './api/notify.ts'
const res: any = { status: (c:number) => ({ json: (b:any) => console.log(c, JSON.stringify(b)) }) }
await h({ headers: {} } as any, res)
await h({ headers: { authorization: 'Bearer wrong' } } as any, res)
"
```

Expected: `401 {"error":"unauthorized"}` 가 두 번 출력된다.

> `tsx` 가 없으면 `npx tsx` 가 알아서 받는다. 이 검사가 환경 때문에 안 되면 건너뛰고 Task 6 Step 3의 실제 호출에서 401을 확인한다 — 다만 **401 확인 없이 알림을 켜지 않는다.**

- [ ] **Step 5: 클라이언트 번들이 안 커졌는지 확인한다**

이게 "번들 증가분 0" 제약의 실제 검사다.

```bash
npm run build && grep -rl "firebase-admin\|web-push" dist/assets/ | head
```

Expected: **출력 없음.** 하나라도 나오면 `src/` 어딘가가 서버 모듈을 import 하고 있다는 뜻이므로 찾아서 끊는다.

- [ ] **Step 6: 커밋**

```bash
git add api/notify.ts package.json package-lock.json
git commit -m "알림 발송 cron 엔드포인트

매시 호출되어 지금이 알림 시각인 사용자에게 웹 푸시를 쏜다.

users 컬렉션을 나열하지 않고 pushSubs collectionGroup 에서 uid 를
역산한다 — task 와 settings 가 서브컬렉션에만 쓰여서 users/{uid}
부모 문서가 실제로 없기 때문이다. 미구독자도 덤으로 걸러진다.

공개 URL 이라 CRON_SECRET 이 유일한 방어선이다. 환경변수가 없으면
부팅을 실패시켜 무방비로 열린 채 배포되는 일을 막았다.
410/404 응답은 죽은 구독으로 보고 문서를 지운다."
```

---

## Task 6: 매시 트리거와 실기기 검증

**Files:**
- Create: `.github/workflows/notify.yml`
- Modify: `src/lib/version.ts`
- Modify: `package.json`
- Modify: `.claude/prds/sasa-task-manager.prd.md`

**Interfaces:**
- Consumes: Task 5의 `POST /api/notify`
- Produces: 매시 트리거. 산출물을 소비하는 후속 task 없음.

- [ ] **Step 1: 워크플로를 만든다**

`.github/workflows/notify.yml`:

```yaml
# 알림 스케줄러. Vercel Hobby 의 cron 은 하루 1회 빈도가 한계라
# 매시 트리거를 여기서 돌린다. 자세한 배경은
# docs/superpowers/specs/2026-08-23-release2-notifications-design.md
name: notify

on:
  schedule:
    # 매시 정각(UTC). 함수가 KST 로 환산해 판정하므로 UTC 로 둬도 된다.
    - cron: '0 * * * *'
  # 실기기 수신 확인용 수동 발사.
  workflow_dispatch:

jobs:
  fire:
    runs-on: ubuntu-latest
    steps:
      - name: POST /api/notify
        run: |
          code=$(curl -sS -o /tmp/out.json -w '%{http_code}' -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ vars.NOTIFY_URL }}")
          cat /tmp/out.json
          echo
          test "$code" = "200"
```

> **`vars.NOTIFY_URL`** 은 GitHub 레포 Variables 에 `https://<배포주소>/api/notify` 로 넣는다. 시크릿이 아니라 변수다 — URL 자체는 비밀이 아니고, 로그에 찍혀야 디버깅이 된다.

- [ ] **Step 2: 사용자가 직접 해야 하는 설정 — 여기서 멈추고 요청한다**

에이전트가 대신할 수 없다. 아래를 사용자에게 그대로 전달하고 완료를 기다린다.

1. VAPID 키를 만든다:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Vercel** → 프로젝트 → Settings → Environment Variables 에 넣는다 (Production 체크):
   - `VAPID_PUBLIC` = 위 publicKey
   - `VAPID_PRIVATE` = 위 privateKey
   - `VAPID_SUBJECT` = `mailto:ejunhong03@gmail.com`
   - `VITE_VAPID_PUBLIC` = publicKey (위와 같은 값. 클라이언트 빌드용이라 별도 이름이 필요하다)
   - `FIREBASE_SERVICE_ACCOUNT` = Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 받은 JSON **파일 내용 전체**
   - `CRON_SECRET` = `openssl rand -hex 32` 결과
3. **로컬** `.env.local` 에도 `VITE_VAPID_PUBLIC` 을 넣는다 (preview 확인용)
4. **GitHub** → 레포 → Settings → Secrets and variables → Actions:
   - Secrets 탭 → `CRON_SECRET` = 위와 **같은 값**
   - Variables 탭 → `NOTIFY_URL` = `https://<배포주소>/api/notify`
5. 아이폰: 홈 화면에 설치된 앱을 연다. **설치 안 된 Safari 탭에서는 iOS가 push를 지원하지 않는다.**

- [ ] **Step 3: 배포하고 인증을 확인한다**

```bash
git push
```

배포가 끝나면:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<배포주소>/api/notify
```

Expected: `401`. 200이 나오면 `CRON_SECRET` 이 Vercel에 안 들어간 것이므로 **즉시 멈추고** Step 2로 돌아간다.

- [ ] **Step 4: 실기기 구독**

1. 아이폰 홈 화면 앱을 연다 → 설정 → "이 기기로 알림 받기" → 켜기 → 권한 허용
2. 라벨이 "켜짐"으로 바뀌는지 확인
3. 데스크탑 브라우저에서도 같은 계정으로 켜기
4. Firebase 콘솔 → Firestore → `users/{uid}/pushSubs` 에 문서가 **2개** 있는지 확인

Expected: 4개 전부 정상. 아이폰에서 "홈 화면에 추가한 뒤 다시 시도"가 뜨면 Safari 탭에서 연 것이다.

- [ ] **Step 5: 수동 발사로 실제 수신을 확인한다**

1. 설정에서 아침 시각을 **지금 시각(KST 기준 현재 시)** 으로 맞춘다
2. GitHub → Actions → notify → "Run workflow"
3. 실행 로그에 `{"ok":true,"hour":<지금 시>,"sent":2,"pruned":0}` 가 찍히는지 확인
4. 아이폰과 데스크탑에 알림이 오는지 확인
5. 알림을 탭하면 앱이 List 화면으로 열리는지 확인
6. 저녁 시각을 지금 시각으로 맞추고 다시 발사 → `/new` 로 열리는지 확인
7. 두 시각 모두 "끔"으로 두고 발사 → `sent: 0` 이고 알림이 **안 오는지** 확인

Expected: 7개 전부 정상. `sent` 가 0인데 시각이 맞다면 `notify` 필드가 저장 안 된 것이므로 Firebase 콘솔에서 문서를 직접 본다.

- [ ] **Step 6: 로그인 회귀를 마지막으로 한 번 더 확인한다**

Task 2에서 확인했지만 배포된 실물에서 다시 본다. **서비스워커 관련 문제는 프로덕션에서만 드러나는 경우가 있다.**

1. 아이폰 홈 화면 앱에서 로그아웃 → 다시 Google 로그인
2. 데스크탑에서 로그아웃 → 다시 로그인
3. 둘 다 성공하고, 로그인 후 할일 목록이 정상적으로 보이는지

Expected: 전부 정상. 실패하면 `src/sw.ts` 의 denylist 문제다 — 알림보다 이게 우선이므로 즉시 고친다.

- [ ] **Step 7: 버전을 올리고 PRD 를 갱신한다**

`src/lib/version.ts`:

```ts
// package.json 과 손으로 맞춘다. 빌드 타임 주입을 넣을 만큼 자주 바뀌지 않는다.
export const APP_VERSION = '1.1.0'
```

`package.json` 의 `"version": "0.1.0"` 을 `"version": "1.1.0"` 으로 바꾼다.

`.claude/prds/sasa-task-manager.prd.md` 의 M7 행에서 `| pending |` 을 `| complete |` 로 바꾸고, `Plan` 칸에 이 계획 경로를 덧붙인다:

```
| 7 | 알림 | ... | complete | spec `docs/superpowers/specs/2026-08-23-release2-notifications-design.md` · plan `docs/superpowers/plans/2026-08-23-m7-notifications.md` |
```

- [ ] **Step 8: 커밋과 태그**

```bash
npm test && npm run build
git add .github/workflows/notify.yml src/lib/version.ts package.json .claude/prds/sasa-task-manager.prd.md
git commit -m "M7 완료: 매시 트리거와 실기기 수신 확인

GitHub Actions 가 매시 정각에 /api/notify 를 호출한다.
Vercel Hobby cron 이 하루 1회 빈도가 한계라 우회한 것이다.

아이폰 홈 화면 PWA 와 데스크탑에서 아침·저녁 알림 수신,
탭 시 화면 이동, 끔 처리, 그리고 서비스워커 교체 후의
로그인 왕복까지 실기기로 확인했다."
git tag v1.1.0
git push && git push --tags
```

---

## Self-Review

**Spec 커버리지** — spec의 각 절이 어느 task로 가는지:

| spec 절 | task |
|---|---|
| 알림 2종 · 무조건 발송 | Task 1 (`notifyCopy`, 0건 테스트), Task 5 |
| 마감 임박 제외 | 어느 task에서도 만들지 않음. Task 4 Step 5가 자리표시 행 삭제 |
| Web Push + VAPID (FCM 아님) | Task 3, Task 5. Global Constraints에 금지 명시 |
| GitHub Actions 매시 cron | Task 6 |
| pushSubs collectionGroup 순회 | Task 5 Step 2 |
| `src/sw.ts` + denylist | Task 2 |
| `src/lib/push.ts` | Task 3 |
| `settings.ts` 의 `notify` + dot-path | Task 1 Step 5 |
| `Settings.tsx` UI | Task 4 |
| `api/notify.ts` | Task 5 |
| `.github/workflows/notify.yml` | Task 6 |
| `firestore.rules` 변경 없음 | 어느 task도 건드리지 않음 |
| 새 의존성 · 번들 증가분 0 | Task 5 Step 1, 검사는 Step 5 |
| `notify.test.ts` | Task 1 |
| 사용자가 할 일 6가지 | Task 6 Step 2 |
| 완료 조건 7개 | Task 6 Step 4~6, Step 8 |

빠진 요구사항 없음.

**타입 일관성** — `Notify` 는 `notify.ts` 가 정의하고 `settings.ts` 가 import 한다(반대 방향이면 서버가 React를 끌고 온다). `NotifyKind` 는 Task 1이 정의하고 Task 5가 쓴다. `Copy.screen` 은 Task 1이 `'/'` · `'/new'` 로 내고, Task 2의 `notificationclick` 이 그 값으로 이동한다. `DEFAULT_NOTIFY` 는 Task 1이 export 하고 Task 5가 import 한다. 이름 불일치 없음.

**미해결로 남긴 것** — Task 4 Step 5의 `sun`/`moon` 아이콘 존재 여부는 실행 시 확인해야 한다. 대체안(`calendar`/`hourglass`)을 같은 자리에 적어 뒀으므로 막히지 않는다.
