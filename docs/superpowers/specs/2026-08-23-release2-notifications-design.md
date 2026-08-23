# Release 2 / M7 — 알림

> PRD `.claude/prds/sasa-task-manager.prd.md` 의 마일스톤 7 설계. 2026-08-23 확정.
> M8(다크 모드)은 이 문서 범위가 아니다.

---

## 무엇을 만드는가

정해진 시각에 두 종류의 웹 푸시 알림이 아이폰 홈화면 PWA와 데스크탑 브라우저로 온다.

| 알림 | 시각 | 내용 |
|---|---|---|
| 아침 요약 | 사용자 지정 (기본 07시) | "오늘 마감 N건 · 내일 M건" |
| 저녁 할일 정리 | 사용자 지정 (기본 21시) | "오늘 받은 과제 넣었어?" |

두 알림 모두 **보낼 게 없어도 보낸다.** 마감 0건이면 "오늘 마감 0건 · 내일 0건"이 온다. 루틴을 만드는 것이 목적이므로 조용한 날에 침묵하지 않는다.

### 범위에서 뺀 것

- **마감 임박 알림** — PRD M7 원문에 있었으나 이번에 만들지 않는다. 아래 인프라가 매시 단위로 돌기 때문에 나중에 `api/notify.ts` 안에 분기 하나를 더하는 것으로 붙는다. 지금 안 만드는 이유는 이 앱의 기한이 대부분 23:59로 몰려 있어 "임박"이 저녁 알림과 사실상 겹치기 때문이다.
- **Android 푸시** — PRD와 동일. 웹 표준을 따르므로 따라오지만 검증하지 않는다.
- **알림 내용의 개인화** — 과목별 알림, 우선순위 반영 등 없음.

---

## 왜 이 구조인가 — 확정된 기술 결정

### FCM 대신 표준 Web Push + VAPID

Firebase가 이미 의존성에 있으므로 FCM이 자연스러워 보이지만 쓰지 않는다.

- Firebase JS SDK의 `messaging.isSupported()` 는 iOS Safari PWA에서 판정이 불안정하다. 검증 대상 기기가 아이폰인 이상 이건 직접적인 실패 요인이다.
- 표준 Push API는 iOS 16.4+ 홈화면 설치 PWA에서 동작이 명확하다.
- 검증 대상이 아이폰 + 데스크탑 둘뿐이라 FCM의 크로스플랫폼 이점을 쓸 일이 없다.
- 서버는 `web-push` 하나면 되고 **클라이언트 번들 증가분은 0이다.**

### Vercel Cron 대신 GitHub Actions

알림 시각을 Settings에서 시간 단위로 조절할 수 있게 했으므로, 스케줄러가 매시 돌면서 "지금이 이 사용자의 알림 시각인가"를 걸러야 한다.

- Vercel Hobby의 cron은 하루 1회 빈도까지만 지원한다. 매시 트리거가 불가능하다.
- Vercel Pro는 월 $20. 개인 프로젝트에 cron granularity 하나 때문에 쓸 이유가 없다.
- GitHub Actions는 무료이고 레포(`AcE3742-SASA/Task-Manager`)가 이미 있다.

받아들이는 대가 두 가지:

1. 스케줄 실행이 5~20분 늦을 수 있다. "21시에 할일 정리해라" 알림에는 무방하다.
2. 레포가 60일간 조용하면 GitHub이 스케줄 워크플로를 자동 비활성화한다. 비활성화 시 GitHub이 메일로 알린다.

### 사용자 순회는 `pushSubs` collectionGroup으로

cron이 "지금 이 시각에 알림 받을 사람"을 찾는 방법이다. `users` 컬렉션을 나열하지 않는다 — task와 settings가 서브컬렉션에만 쓰이고 있어 `users/{uid}` 부모 문서가 실제로 존재하지 않기 때문이다.

대신 `collectionGroup('pushSubs')` 를 전부 읽고 경로에서 uid를 뽑아 중복을 제거한다. 구독한 기기가 있는 사용자만 대상이 되므로 미구독자는 공짜로 걸러진다.

```
// ponytail: 전체 스캔이다. 사용자 1~5명 전제. 수십 명이 되면
// settings 에 notifyHours 배열을 두고 collectionGroup 인덱스 쿼리로 바꾼다.
```

---

## 구성 요소

### 1. `src/sw.ts` (신규) — 서비스워커 직접 작성

`vite-plugin-pwa` 를 `generateSW` 에서 `injectManifest` 로 바꾼다. push 이벤트를 받으려면 SW 코드를 우리가 소유해야 한다.

담는 것:
- `precacheAndRoute(self.__WB_MANIFEST)`
- **navigation fallback 과 `/^\/__\/auth\//` denylist 의 수동 재구현**
- `push` 이벤트 → `event.waitUntil(self.registration.showNotification(title, { body, icon, tag, data }))`
- `notificationclick` → 열린 창이 있으면 focus, 없으면 open. `data.screen` 에 따라 아침은 `/`(List), 저녁은 `/new`.
- `tag` 로 같은 종류의 알림이 쌓이지 않게 한다.

> **이 파일이 M7 전체에서 가장 위험한 지점이다.** 현재 `vite.config.ts` 의 `navigateFallbackDenylist` 주석이 명시하듯, SW가 `/__/auth/` 를 가로채면 프록시된 Firebase 응답이 캐시에 굳어 **로그인이 조용히 깨진다.** generateSW가 자동으로 해주던 것을 손으로 옮기는 작업이므로, 알림 동작 확인보다 로그인 왕복 회귀 확인이 먼저다.

### 2. `src/lib/push.ts` (신규) — 클라이언트 구독 관리

- `Notification.requestPermission()`
- `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VITE_VAPID_PUBLIC })`
- 결과를 `users/{uid}/pushSubs/{docId}` 에 저장. endpoint URL의 해시를 문서 ID로 써서 같은 기기가 재구독해도 중복되지 않게 한다. 아이폰 PWA와 데스크탑이 각각 별도 문서를 갖는다.
- 구독 해제 시 `pushManager.unsubscribe()` + 문서 삭제.
- iOS에서 홈화면 설치가 아니면 `pushManager` 자체가 없다. 이 경우 UI에 "홈 화면에 추가한 뒤 다시 시도" 안내를 띄운다.

### 3. `src/lib/settings.ts` (수정)

```ts
export type Settings = {
  weekStartsOn: 0 | 1
  lang: Lang
  /** 0~23 시(KST). null 이면 그 알림을 끈다. */
  notify: { morningHour: number | null; eveningHour: number | null }
}
```

`DEFAULT_SETTINGS` 에 `notify: { morningHour: 7, eveningHour: 21 }` 을 넣는다. `useSettings` 가 이미 `{ ...DEFAULT_SETTINGS, ...snap.data() }` 로 병합하고 있으므로 **기존 문서 마이그레이션이 필요 없다.**

단, 중첩 객체를 `saveSettings` 의 `setDoc(..., { merge: true })` 로 부분 갱신하면 `notify` 전체가 교체된다. 아침만 바꿔도 저녁 값이 날아가지 않도록 dot-path(`'notify.morningHour'`)로 쓰거나, 호출부에서 현재 `notify` 를 통째로 실어 보낸다.

### 4. `src/screens/Settings.tsx` (수정)

알림 섹션 하나를 추가한다. 기존 neubrutalism 컴포넌트와 `--gut` / `--tap` 토큰을 그대로 쓴다.

- 권한 상태 표시 (`default` / `granted` / `denied`)
- 이 기기 구독 토글 — 켜면 권한 요청 + 구독, 끄면 해제
- 아침 알림 시각: 0~23시 선택 + "끔"
- 저녁 알림 시각: 0~23시 선택 + "끔"
- `denied` 이면 브라우저 설정에서 직접 풀어야 한다는 안내 (JS로 되돌릴 수 없다)

### 5. `api/notify.ts` (신규) — Vercel Serverless Function

1. `Authorization: Bearer ${CRON_SECRET}` 검증. 불일치면 401. 이 엔드포인트는 공개 URL이므로 이 검사가 유일한 방어선이다.
2. 현재 KST 시(0~23)를 구한다.
3. `collectionGroup('pushSubs')` 전체 → uid 집합.
4. 각 uid의 `users/{uid}/settings/app` 을 읽는다. `notify.morningHour === hour` 면 아침, `notify.eveningHour === hour` 면 저녁. 둘 다 아니면 건너뛴다.
5. 아침이면 `users/{uid}/tasks` 에서 `done === false` 이고 `due` 가 오늘/내일 KST 범위인 건수를 센다.
6. 해당 uid의 `pushSubs` 문서 전부에 `web-push` 로 발송한다.
7. 발송 응답이 404/410이면 그 구독 문서를 삭제한다. 죽은 구독이 영구히 쌓이는 것을 막는다.
8. 사용자 한 명의 실패가 다른 사용자의 발송을 막지 않게 개별적으로 처리한다.

알림 문구는 `settings.lang` 을 보고 서버에서 직접 삼항식으로 고른다. `src/lib/i18n.ts` 의 `makeT` 는 `./settings` 를 경유해 React와 firebase 클라이언트 SDK를 끌고 오므로 서버리스 함수에서 import 하지 않는다. 문자열 두 개를 위해 모듈을 재구성하지 않는다.

### 6. `.github/workflows/notify.yml` (신규)

```yaml
on:
  schedule: [{ cron: '0 * * * *' }]
  workflow_dispatch:
```

curl 한 줄로 `https://<배포주소>/api/notify` 에 `Authorization: Bearer ${{ secrets.CRON_SECRET }}` 를 실어 POST 한다. `workflow_dispatch` 는 실기기 수신 확인용 수동 발사 수단이다.

### 7. `firestore.rules` — 변경 없음

현재 규칙 `match /users/{uid}/{document=**}` 이 `pushSubs` 를 이미 덮는다. 서버는 Admin SDK라 규칙을 우회한다.

---

## 새 의존성

| 패키지 | 위치 | 이유 |
|---|---|---|
| `web-push` | 서버 전용 | VAPID 서명 + 푸시 전송 |
| `firebase-admin` | 서버 전용 | 규칙 우회 읽기, collectionGroup 쿼리 |

둘 다 `api/` 에서만 import 한다. **클라이언트 번들 증가분 0.**

---

## 테스트

`src/lib/due.test.ts` 와 같은 자리에 `src/lib/notify.test.ts` 하나.

발송 대상 선택 로직을 순수 함수로 뽑아 테스트한다:

```ts
pickRecipients(hour: number, settings: Settings): ('morning' | 'evening')[]
countDue(tasks: Task[], now: Date): { today: number; tomorrow: number }
```

경계 케이스: `null`(끔) 처리, 아침과 저녁 시각이 같을 때, KST 자정 전후의 오늘/내일 경계, 완료된 task 제외.

Firestore 접근과 실제 전송은 테스트하지 않는다. 그건 `workflow_dispatch` 수동 발사와 실기기 확인의 몫이다.

---

## 사용자가 직접 해야 하는 일

에이전트가 대신할 수 없다.

1. `npx web-push generate-vapid-keys` 실행
2. Vercel 환경변수 등록: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`(mailto:), `VITE_VAPID_PUBLIC`(공개키와 동일, 클라이언트 빌드용)
3. Firebase 콘솔에서 서비스 계정 키 발급 → Vercel 환경변수 `FIREBASE_SERVICE_ACCOUNT` (JSON 통째로)
4. `CRON_SECRET` 임의 문자열 생성 → **Vercel 환경변수 + GitHub 레포 시크릿 양쪽에** 등록
5. 아이폰: 홈 화면에 설치된 앱을 열어 알림 권한 허용. 설치되지 않은 Safari 탭에서는 iOS가 push를 아예 지원하지 않는다.
6. 실기기 수신 확인 — 시뮬레이터로 대체 불가

---

## 완료 조건

- [ ] 아이폰 홈화면 PWA에서 아침/저녁 알림을 실제로 수신한다
- [ ] 데스크탑 브라우저에서 수신한다
- [ ] 알림을 탭하면 아침은 List, 저녁은 New 화면이 열린다
- [ ] Settings에서 시각을 바꾸면 다음 날 그 시각에 온다
- [ ] 시각을 "끔"으로 두면 오지 않는다
- [ ] **SW 교체 후 로그아웃 → 로그인 왕복이 실기기에서 정상 동작한다**
- [ ] `npm run build` 와 `npm test` 가 통과한다

---

## 리스크

| 리스크 | 대응 |
|---|---|
| SW를 직접 작성하면서 `/__/auth/` 처리를 놓쳐 로그인이 조용히 깨진다 | 최우선. 알림 확인보다 로그인 왕복 회귀 확인을 먼저 한다. 프로덕션 배포 전 실기기에서 검증한다. |
| iOS가 권한을 받고도 알림을 조용히 누락한다 | 실기기 검증이 유일한 확인 수단. 실패 시 PRD 원문대로 앱 내 배지·목록 표시로 후퇴한다. |
| GitHub Actions 스케줄이 5~20분 지연된다 | 수용한다. 알림 성격상 무방. |
| 레포 60일 무활동으로 워크플로가 비활성화된다 | GitHub이 메일로 통보한다. 알림이 끊기면 여기를 먼저 본다. |
| `CRON_SECRET` 없이 엔드포인트가 노출된다 | 401 검증을 먼저 구현하고, 시크릿 미설정 시 함수가 부팅에 실패하도록 한다. |
| 중첩된 `notify` 객체를 부분 저장하다 다른 필드를 날린다 | dot-path 저장 또는 객체 통째 전송. 테스트로 고정하지는 않는다(Firestore 동작이라). 구현 시 명시적으로 처리한다. |

---

*Status: APPROVED — 2026-08-23. 구현 계획은 `/plan` 으로 전개한다.*
