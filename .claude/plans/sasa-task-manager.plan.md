# Plan: SASA Task Manager — 껍데기와 신원

**Source PRD**: `.claude/prds/sasa-task-manager.prd.md`
**Selected Milestone**: Release 1 / Milestone 1 — 껍데기와 신원
**Complexity**: Medium

## Summary

빈 저장소에 Vite + React + TypeScript SPA를 세우고, 시안(`design/mockup-v1.html`)에 이미 확정된 색·서체·테두리·섀도우를 그대로 CSS 토큰으로 옮긴 뒤, 하단 5탭(List · Calendar · New · Settings · Profile)의 빈 화면을 만든다. Firebase Google 로그인으로 인증 게이트를 세우고, PWA로 설치 가능하게 만든 다음 Vercel에 배포한다. 데이터(과목 · task · 기한 계산)는 이 마일스톤에 없다 — 껍데기와 신원까지다.

## Stack Decision (가정 — 이의 없으면 이대로 진행)

PRD가 Firebase와 Vercel을 이미 확정했으므로 남은 선택은 프론트엔드뿐이다.

| 항목 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + React + TypeScript | 서버 렌더링이 필요 없는 개인용 클라이언트 앱. Next.js는 쓰지 않는 서버 런타임을 얹는다. |
| 스타일 | 순수 CSS + custom properties | 시안이 **이미 이 형태로 작성돼 있다.** Tailwind를 넣으면 확정된 디자인을 다시 유틸리티로 번역하는 순수 손실. |
| 라우팅 | `react-router-dom` | PWA 뒤로가기 · 딥링크 · 모달 라우트가 M3부터 필요. 탭 state로 시작하면 M3에서 되돌린다. |
| 인증 | `firebase/auth` Google provider | PRD 확정. |
| PWA | `vite-plugin-pwa` | manifest + service worker + 아이콘을 한 플러그인이 처리. 수동 SW 작성 불필요. |
| 테스트 | **M1에는 없음** | M1에 검증할 로직이 사실상 없다. Vitest는 기한 계산이 들어오는 M3에서 도입한다. |

## Patterns to Mirror

기존 코드가 없다. 아래는 **디자인 소스**이며, 발명하지 말고 그대로 옮긴다.

| Category | Source | Pattern |
|---|---|---|
| 색 토큰 | `design/mockup-v1.html:5` (`:root`) | `--ink #34170D` / `--sage #8FA28A` / `--sagelt #C7D3C0` / `--cream #F7F4ED` / `--tan #C8A96B` / `--muted #8A7568` / `--paper #FFFDF8` |
| 테두리·섀도우 | 동 `:root` | `--b: 3px solid var(--ink)` · `--b2: 2px` · `--sh: 7px 7px 0` · `--sh-s: 4px 4px 0`. 블러 0. |
| 배경 | 동 `body` | 크림 바탕 + `rgba(52,23,13,.055)` 28px 격자 |
| 서체 | 동 `@font-face` (line 3–4) | `MG Rounded`(본문·제목) · `MG Pixel`(라벨·숫자, `letter-spacing:.06em`, `tabular-nums`). 각 1 weight(400). |
| 화면 골격 | 동 `.phone` 7종 | `statusbar → appbar(제목 + 우측 보조) → body(스크롤) → nav(5탭)`, 390 × 756 기준 |
| 아이콘 | 동 `.iconset` (40개 SVG) | `viewBox="0 0 24 24"`, stroke 1.9, fill none |
| 하단 탭 | 동 `nav` | LIST · CAL · **NEW(ink 채운 사각형, 가운데)** · SET(톱니바퀴) · ME |
| 시간표 실물 | AcEVault `wiki/coursework-2026-2학기-시간표.md` | M2 입력 데이터. M1에서는 읽지 않는다. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` | CREATE | 스캐폴드 |
| `.env.example` | CREATE | `VITE_FIREBASE_*` 6개 키 이름만. 값은 사용자가 채운다. |
| `public/fonts/mg-rounded.woff2`, `public/fonts/mg-pixel.woff2` | CREATE | 시안의 base64를 디코드해 실파일로 추출 (약 286KB + 166KB) |
| `src/styles/tokens.css` | CREATE | 시안 `:root` 그대로 |
| `src/styles/base.css` | CREATE | reset · body 격자 배경 · `@font-face` · 타이포 유틸(`.pix`, `.eyebrow`) |
| `src/components/Screen.tsx` | CREATE | appbar + 스크롤 body 껍데기. 5화면 공통. |
| `src/components/BottomNav.tsx` | CREATE | 5탭. New 가운데 ink 사각형. |
| `src/components/EmptyState.tsx` | CREATE | 화면별 빈 상태 문구 1종 |
| `src/screens/{List,Calendar,New,Settings,Profile}.tsx` | CREATE | 빈 화면 5개 |
| `src/screens/SignIn.tsx` | CREATE | Google 로그인 단일 화면 |
| `src/lib/firebase.ts` | CREATE | app + auth 초기화 |
| `src/lib/useAuth.ts` | CREATE | `onAuthStateChanged` 구독 훅 (loading / user / null 3상태) |
| `src/App.tsx`, `src/main.tsx` | CREATE | 라우터 + 인증 게이트 |
| `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `maskable-512.png` | CREATE | 시안 팔레트 기반 앱 아이콘 |
| `vercel.json` | CREATE | SPA rewrite + `/__/auth/*` → Firebase 인증 핸들러 프록시 (아래 위험 참조) |
| `docs/setup-firebase-vercel.md` | CREATE | 사용자가 콘솔에서 직접 해야 하는 단계 (PRD Ownership 절) |
| `.claude/prds/sasa-task-manager.prd.md` | UPDATE | 마일스톤 1 행 → `in-progress` + Plan 경로 |

## Tasks

### Task 1: 스캐폴드와 저장소 첫 커밋
- **Action**: `npm create vite@latest . -- --template react-ts`. 기본 CSS/에셋(`App.css`, `index.css`, 로고) 삭제. `.gitignore`에 `.env.local`, `.DS_Store`. 첫 커밋.
- **Mirror**: 없음(신규).
- **Validate**: `npm run build` 성공.

### Task 2: 서체 추출과 디자인 토큰
- **Action**: `design/mockup-v1.html` 3·4행의 `data:font/woff2;base64,…`를 디코드해 `public/fonts/*.woff2`로 저장. `tokens.css`·`base.css`에 `:root` 변수와 body 격자 배경을 시안 그대로 옮긴다. `@font-face`는 `font-display:swap`, fallback은 시안과 동일하게 `"Apple SD Gothic Neo","Pretendard",system-ui`.
- **Mirror**: `design/mockup-v1.html:5` `:root` 블록 — **값을 재해석하지 않는다.**
- **Validate**: 브라우저에서 `document.fonts.check('16px "MG Rounded"') === true`. 한글 "할 일"과 로마숫자 `Ⅰ`을 나란히 렌더해 폰트 튐(로마숫자 글리프 부재)을 눈으로 확인 — 정규화는 M2에서 처리하지만 증상은 여기서 확인해둔다.

### Task 3: 화면 껍데기 5개 + 하단 탭
- **Action**: `Screen`(appbar + body) · `BottomNav`(5탭, New 가운데 ink 사각형, 활성 탭 표시) · `EmptyState`. 5개 라우트를 `react-router`로 연결. 각 화면은 제목과 빈 상태 문구만 갖는다.
- **Mirror**: 시안 `.phone` / `.appbar` / `.body` / `nav` 마크업과 클래스 구조. 아이콘 SVG는 시안 nav에서 그대로 복사(설정 = 톱니바퀴).
- **Validate**: 390px 뷰포트에서 5탭 전환. 하단 탭이 iOS safe-area를 침범하지 않는지 `env(safe-area-inset-bottom)` 적용 후 확인.

### Task 4: Firebase Google 로그인과 인증 게이트
- **Action**: `firebase.ts`(env에서 config 읽기), `useAuth()`(loading / user / null). 미인증 → `SignIn` 화면, 인증 → 5탭 앱. Profile 화면에 계정 표시 + 로그아웃. **로그인은 `signInWithRedirect`를 기본으로 쓴다** (iOS 홈 화면 PWA에서 팝업이 신뢰할 수 없음). Vercel `authDomain` 프록시와 함께 동작해야 한다.
- **Mirror**: 없음(신규). 시안 06 PROFILE의 `.acct` 블록을 계정 표시에 사용.
- **Validate**: 로컬에서 로그인 → 새로고침해도 세션 유지 → 로그아웃 시 SignIn으로 복귀.

### Task 5: PWA 설치
- **Action**: `vite-plugin-pwa`(`registerType: 'autoUpdate'`). manifest: 이름 "SASA 할 일", `display: standalone`, `theme_color #F7F4ED`, `background_color #F7F4ED`, 세로 고정. 아이콘 4종 생성. `apple-touch-icon` 링크와 `apple-mobile-web-app-*` 메타 추가(iOS는 manifest만으로 부족).
- **Mirror**: 아이콘은 시안 팔레트(크림 바탕 · ink 테두리 · tan 액센트)로 만든다.
- **Validate**: Lighthouse Installable 통과. 그 뒤 **사용자가 실제 아이폰에서** 홈 화면 추가 → standalone 실행 → 로그인까지 확인(시뮬레이터 대체 불가).

### Task 6: 배포와 사용자 안내 문서
- **Action**: `vercel.json`에 SPA rewrite와 `/__/auth/(.*)` → `https://<project>.firebaseapp.com/__/auth/$1` 프록시 작성. `docs/setup-firebase-vercel.md`에 사용자가 콘솔에서 할 일을 화면별 순서로 기록: 프로젝트 생성 → Google 공급자 활성화 → 승인된 도메인에 Vercel 주소 + `localhost` 등록 → Vercel 저장소 연결 → `VITE_FIREBASE_*` 환경변수 등록.
- **Mirror**: PRD "Ownership" 절의 사용자/에이전트 경계를 그대로 따른다. **키 값을 에이전트가 볼 필요 없다.**
- **Validate**: 배포 주소에서 로그인 성공 + 아이폰 설치 성공.

## Validation

```bash
npm run build && npx tsc --noEmit
```

```bash
npm run dev
```

수동 확인 체크리스트:
- [ ] 390 × 756에서 5탭 전환, 하단 탭이 홈 인디케이터에 가리지 않음
- [ ] MG Rounded / MG Pixel 실제 적용 (시스템 폰트 폴백 아님)
- [ ] 로그인 → 새로고침 → 세션 유지 → 로그아웃
- [ ] Lighthouse PWA Installable 통과
- [ ] (사용자) 아이폰 홈 화면 설치 후 standalone에서 Google 로그인 성공

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **iOS 홈 화면 PWA에서 Google 로그인이 안 된다.** Safari 스토리지 파티셔닝 이후 `signInWithRedirect`가 기본 `*.firebaseapp.com` authDomain으로는 세션을 잃는다. | 높음 | `vercel.json`으로 `/__/auth/*`를 Firebase 핸들러에 프록시하고 `authDomain`을 자체 배포 도메인으로 설정한다. Task 4·6을 **함께** 검증한다. 그래도 실패하면 팝업 방식으로 후퇴하고 M1을 막지 않는다. |
| 서체 파일이 커서(약 450KB) 첫 로딩이 느리다 | 중간 | `font-display:swap` + 폰트 preload. 실측이 거슬리면 그때 한글 서브셋으로 줄인다 — 지금 최적화하지 않는다. |
| 로마숫자 `Ⅰ~Ⅳ` 글리프 부재로 과목명 한 글자가 시스템 폰트로 튄다 | 확실 | M1은 증상 확인만. 정규화는 과목 입력이 생기는 **M2**에서 저장 시 ASCII 변환으로 처리한다. |
| 시안을 코드로 옮기며 값이 미묘하게 달라진다 | 중간 | 토큰을 손으로 다시 고르지 않고 시안 `:root`에서 **복사**한다. 완료 후 시안과 실제 화면을 나란히 놓고 비교한다. |
| Firebase 콘솔 설정을 사용자가 못 끝내 M1이 멈춘다 | 낮음 | Task 1–3·5는 Firebase 없이 완결된다. 인증만 뒤로 미룰 수 있게 순서를 잡았다. |

## Acceptance

- [ ] 배포 주소에서 Google 계정으로 로그인된다
- [ ] 빈 상태의 5개 화면이 시안의 디자인 언어로 보인다
- [ ] 아이폰 홈 화면에 설치되고 standalone으로 실행된다
- [ ] `npm run build` · `tsc --noEmit` 통과
- [ ] 사용자용 콘솔 설정 문서가 있다
- [ ] 발명이 아니라 시안을 옮겼다 (색·테두리·섀도우·서체 값 일치)

## Out of Scope (이 마일스톤 아님)

Firestore 스키마 · 과목/시간표 입력 · task CRUD · 기한 자동 계산 · 달력 · 다크 모드 · 알림. 40종 아이콘 세트도 M1에서는 **하단 탭 5개만** 옮기고 나머지 35개는 과목 편집이 생기는 M2에서 옮긴다.
