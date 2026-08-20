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

Vercel 프로젝트 → **Settings → Environment Variables** 에 6개를 넣는다.
Production · Preview · Development 셋 다 체크한다.

| 이름 | 값 |
|---|---|
| `VITE_FIREBASE_API_KEY` | firebaseConfig 의 `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | **배포 주소** (`sasa-task-manager.vercel.app`) |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

**`VITE_FIREBASE_AUTH_DOMAIN` 만 firebaseConfig 값과 다르다.** Firebase가 알려주는
`xxx.firebaseapp.com` 이 아니라 **Vercel 배포 주소**를 넣는다. 5번의 rewrite와 짝이다.
여기에 `firebaseapp.com` 을 넣으면 맥에서는 로그인이 되고 아이폰 홈 화면에서만 안 된다.

넣은 뒤 Vercel에서 **Redeploy** (환경변수는 재배포해야 반영된다).

## 7. 승인된 도메인 등록

Firebase 콘솔 → **Authentication → Settings → 승인된 도메인**에 추가:

- `sasa-task-manager.vercel.app` (본인 배포 주소)
- `localhost` (보통 이미 들어 있다)

여기 없는 도메인에서 로그인하면 `auth/unauthorized-domain` 오류가 화면에 뜬다.

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

---

## 안 되면 볼 것

| 증상 | 원인 |
|---|---|
| "FIREBASE 설정 없음" | 환경변수 미등록, 또는 등록 후 재배포 안 함 |
| `auth/unauthorized-domain` | 7번 승인된 도메인 누락 |
| 맥은 되는데 아이폰 홈 화면만 안 됨 | 6번 `authDomain` 이 `firebaseapp.com` 으로 들어감 |
| 로그인 후 돌아왔는데 로그아웃 상태 | 5번 rewrite 의 projectId 미치환 |
| 배포는 됐는데 새로고침하면 404 | `vercel.json` 의 SPA rewrite 누락 |
