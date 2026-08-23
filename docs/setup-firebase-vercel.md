# Firebase · Vercel 설정 (사용자가 직접 하는 부분)

에이전트가 못 하는 일만 모았다. **키 값을 에이전트에게 알려줄 필요는 없다.**
전부 마치는 데 15분쯤 걸린다. 순서대로 하면 된다.

순서가 중요한 이유가 하나 있다: **6번의 `authDomain`을 잘못 넣으면 아이폰 홈 화면에서만
로그인이 실패한다.** 맥 브라우저에서는 멀쩡히 되기 때문에 나중에 원인을 찾기 어렵다.

---

## 1. Firebase 프로젝트 만들기

1. <https://console.firebase.google.com> → **프로젝트 추가**
2. 이름: `sasa-task-manager` (아무거나 상관없다)
3. Google 애널리틱스: **끄기** — 쓰지 않는다
4. 요금제: **Spark(무료)** 로 충분하다. 혼자 쓰는 앱이라 무료 한도를 넘길 일이 없다.

## 2. Google 로그인 켜기

1. 왼쪽 **빌드 → Authentication** → **시작하기**
2. **Sign-in method** 탭 → **Google** → 사용 설정
3. 프로젝트 지원 이메일에 본인 Gmail 선택 → **저장**

## 3. 웹 앱 등록하고 설정값 받기

1. **프로젝트 개요** 옆 톱니바퀴 → **프로젝트 설정**
2. 아래 **내 앱** → 웹 아이콘(`</>`) 클릭
3. 앱 닉네임: `web`. **Firebase Hosting 설정은 체크하지 않는다** (Vercel을 쓴다)
4. 나오는 `firebaseConfig` 값 6개를 복사해둔다

## 4. 저장소를 GitHub에 올리고 Vercel에 연결

1. GitHub에 비공개 저장소를 만들고 이 폴더를 push
2. <https://vercel.com> → **Add New → Project** → 그 저장소 선택
3. 프레임워크는 **Vite** 로 자동 인식된다. 빌드 설정은 건드리지 않는다
4. 일단 **Deploy**. 이 시점에는 로그인 화면에 "FIREBASE 설정 없음"이 뜬다 — 정상이다
5. 배포 주소를 적어둔다 (예: `sasa-task-manager.vercel.app`)

## 5. `vercel.json` 의 프로젝트 ID 채우기

`vercel.json` 을 열어 `REPLACE_WITH_PROJECT_ID` 를 3번에서 받은 **projectId** 로 바꾼다.

```json
"destination": "https://sasa-task-manager-1234.firebaseapp.com/__/auth/:path*"
```

**이게 무슨 역할인가**: Google 로그인은 `/__/auth/handler` 라는 주소를 거친다. 그 주소가
`firebaseapp.com`(= 다른 도메인)에 있으면, Safari가 도메인별로 저장소를 분리해버려서 돌아왔을 때
로그인 상태가 사라진다. 이 rewrite는 그 주소를 **우리 도메인 안에 있는 것처럼** 보이게 해서
Safari가 같은 사이트로 인식하게 만든다. 아이폰 PWA에서 로그인이 되게 하는 핵심이다.

바꾼 뒤 커밋 · push 하면 Vercel이 자동으로 다시 배포한다.

## 6. 환경변수 등록 ⚠️ 여기가 함정

Vercel 프로젝트 → **Settings → Environment Variables** 에 아래 표의 값들을 전부 넣는다.
Production · Preview · Development 셋 다 체크한다. 하나라도 빠지면 로그인 화면에
"FIREBASE 설정 없음"이 뜨거나, `/api/notify` 가 500 을 내거나, 설정 화면에
"VAPID 키가 설정되지 않았다"가 뜬다.

| 이름 | 값 |
|---|---|
| `VITE_FIREBASE_API_KEY` | firebaseConfig 의 `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | **배포 주소** (`sasa-task-manager.vercel.app`) |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_VAPID_PUBLIC` | VAPID 공개키 (아래에서 만든다) — 클라이언트 빌드용 |
| `VAPID_PUBLIC` | 위와 같은 값 — 서버리스 함수(`api/notify.ts`)용 |
| `VAPID_PRIVATE` | VAPID 비밀키 — 서버 전용, `VITE_` 접두사 절대 안 붙인다 |
| `VAPID_SUBJECT` | `mailto:본인이메일` 형식 |
| `FIREBASE_SERVICE_ACCOUNT` | 서비스 계정 JSON 전체 (아래에서 받는다) |
| `CRON_SECRET` | 무작위 문자열. **GitHub 저장소 시크릿에도 같은 값을 등록해야 한다** (11번) |

**`VITE_FIREBASE_AUTH_DOMAIN` 만 firebaseConfig 값과 다르다.** Firebase가 알려주는
`xxx.firebaseapp.com` 이 아니라 **Vercel 배포 주소**를 넣는다. 5번의 rewrite와 짝이다.
여기에 `firebaseapp.com` 을 넣으면 맥에서는 로그인이 되고 아이폰 홈 화면에서만 안 된다.

**VAPID 키페어 만들기**:

```bash
npx web-push generate-vapid-keys
```

나오는 Public Key 는 `VITE_VAPID_PUBLIC` 과 `VAPID_PUBLIC` 두 곳에, Private Key 는
`VAPID_PRIVATE` 에 넣는다. 같은 키를 두 변수 이름으로 중복 등록하는 게 맞다 — 하나는
Vite 빌드가 클라이언트에 넣는 값이고 하나는 서버리스 함수가 읽는 값이라 접두사 규칙이 다르다.

**`FIREBASE_SERVICE_ACCOUNT` 받기**: Firebase 콘솔 → **프로젝트 설정 → 서비스 계정** →
**새 비공개 키 생성**. 다운로드된 JSON 파일 내용 전체를 값으로 붙여넣는다.

**`CRON_SECRET` 만들기**:

```bash
openssl rand -hex 32
```

이 값은 **두 군데**에 들어간다 — Vercel 환경변수(위 표)와 GitHub Actions 시크릿(11번).
하나만 맞으면 cron 호출이 401 로 거부된다.

넣은 뒤 Vercel에서 **Redeploy** (환경변수는 재배포해야 반영된다).

## 7. 승인된 도메인 등록 — **두 군데다**

`authDomain` 을 배포 도메인으로 바꿨기 때문에 Firebase 쪽만으로는 부족하다.
Google 쪽에도 같은 주소를 등록해야 한다. **한쪽만 하면 로그인이 실패한다.**

### 7-1. Firebase 콘솔

**Authentication → Settings → 승인된 도메인**에 추가:

- `sasa-task-manager.vercel.app` (본인 배포 주소)
- `localhost` (보통 이미 들어 있다)

빠지면 → `auth/unauthorized-domain`

### 7-2. Google Cloud 콘솔 ⚠️ 빠뜨리기 쉬운 곳

Firebase가 자동으로 만든 OAuth 클라이언트에는 `xxx.firebaseapp.com` 주소 하나만 등록돼 있다.
`authDomain` 을 바꾸면 Google에 전달되는 `redirect_uri` 가 달라지므로 새 주소를 직접 넣어야 한다.

1. <https://console.cloud.google.com/apis/credentials> → 위쪽에서 **Firebase와 같은 프로젝트** 선택
2. **OAuth 2.0 클라이언트 ID** → `Web client (auto created by Google Service)`
3. **승인된 JavaScript 원본**에 추가: `https://sasa-task-manager.vercel.app`
4. **승인된 리디렉션 URI**에 추가: `https://sasa-task-manager.vercel.app/__/auth/handler`
5. 저장 (반영에 1~2분, 드물게 더 걸린다)

**기존 `xxx.firebaseapp.com` 항목은 지우지 않는다** — 8번의 로컬 개발이 그 주소를 쓴다.

빠지면 → Google 로그인 화면에서 `400: redirect_uri_mismatch`
(`Request details: redirect_uri=https://.../__/auth/handler`)

## 8. 로컬 개발 환경

```bash
cp .env.example .env.local
```

`.env.local` 에 같은 값 6개를 넣는다. 단 **로컬에서는 `VITE_FIREBASE_AUTH_DOMAIN` 에
`xxx.firebaseapp.com`(firebaseConfig 원래 값)을 쓴다** — `localhost` 에는 `/__/auth` 프록시가
없기 때문이다. `.env.local` 은 `.gitignore` 에 있어 커밋되지 않는다.

```bash
npm install
npm run dev
```

## 9. 아이폰에 설치하고 확인 — 시뮬레이터로 대체 불가

1. 아이폰 **Safari**로 배포 주소를 연다 (Chrome 앱은 홈 화면 추가가 다르게 동작한다)
2. 공유 버튼 → **홈 화면에 추가**
3. 홈 화면 아이콘으로 실행 (Safari에서 열지 말고)
4. **Google로 계속하기** → 로그인 → 돌아와서 프로필 화면에 본인 계정이 보이면 성공
5. 앱을 완전히 종료했다가 다시 열어도 로그인이 유지되는지 확인

여기서 실패하면 6번의 `authDomain` 과 5번의 rewrite를 먼저 의심한다.

## 10. Firestore 켜기 ⚠️ 규칙을 먼저 게시한다 (마일스톤 2)

과목·시간표가 저장되는 곳이다. **여기서 "테스트 모드"를 고르면 30일 동안 인터넷의 누구나
당신의 데이터를 읽고 쓸 수 있다.** 순서대로 하면 그 상태를 거치지 않는다.

1. 왼쪽 **빌드 → Firestore Database** → **데이터베이스 만들기**
2. 위치: **asia-northeast3 (서울)** — 한 번 정하면 못 바꾼다
3. 모드: **프로덕션 모드에서 시작** (테스트 모드 아님). 이 상태는 모든 접근을 막는다 — 정상이다
4. 만들어지면 **규칙** 탭 → 내용을 전부 지우고 저장소의 `firestore.rules` 파일 내용을 붙여넣는다 → **게시**
5. 규칙 탭의 **Playground(시뮬레이터)** 로 두 번 확인한다:
   - `/users/<본인 uid>/subjects/x` 읽기 + 인증됨(본인 uid) → **허용**
   - `/users/somebody-else/subjects/x` 읽기 + 인증됨(본인 uid) → **거부**

   본인 uid는 Authentication → Users 탭에서 복사한다. 두 결과가 모두 나와야 넘어간다.

**색인은 만들지 않아도 된다.** 과목이 10개 남짓이라 정렬을 앱이 직접 한다.

## 11. GitHub Actions cron 설정

매시 정각에 `/api/notify` 를 호출하는 워크플로가 필요로 하는 값 둘이다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **Secrets** 탭 → **New repository secret** → 이름 `CRON_SECRET`, 값은 6번에서
   Vercel 에 넣은 것과 **완전히 같은 값**
3. **Variables** 탭 → **New repository variable** → 이름 `NOTIFY_URL`, 값
   `https://<배포주소>/api/notify` (예: `https://sasa-task-manager.vercel.app/api/notify`)

시크릿과 변수를 헷갈리지 않는다 — `CRON_SECRET` 은 Secrets 탭, `NOTIFY_URL` 은 Variables 탭이다.

---

## 안 되면 볼 것

| 증상 | 원인 |
|---|---|
| "FIREBASE 설정 없음" | 환경변수 미등록, 또는 등록 후 재배포 안 함 |
| `400: redirect_uri_mismatch` | **7-2** Google Cloud OAuth 클라이언트에 리디렉션 URI 미등록 |
| `auth/unauthorized-domain` | 7-1 Firebase 승인된 도메인 누락 |
| 맥은 되는데 아이폰 홈 화면만 안 됨 | 6번 `authDomain` 이 `firebaseapp.com` 으로 들어감 |
| 로그인 후 돌아왔는데 로그아웃 상태 | 5번 rewrite 의 projectId 미치환 |
| 배포는 됐는데 새로고침하면 404 | `vercel.json` 의 SPA rewrite 누락 |
| 과목 저장 시 "Missing or insufficient permissions" | 10번 규칙 미게시, 또는 붙여넣기 후 **게시** 안 누름 |
| 과목 화면이 계속 "불러오는 중" | 10번 Firestore 데이터베이스 자체가 없음 |
| 설정 화면에 "VAPID 키가 설정되지 않았다" | `VITE_VAPID_PUBLIC` 미등록, 또는 등록 후 재배포 안 함 |
| `/api/notify` 가 500 | `VAPID_PRIVATE` · `VAPID_SUBJECT` · `FIREBASE_SERVICE_ACCOUNT` 중 하나 미등록 |
| cron 이 401 | 11번 GitHub `CRON_SECRET` 이 Vercel 값과 다름 |
