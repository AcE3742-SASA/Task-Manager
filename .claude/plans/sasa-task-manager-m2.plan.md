# Plan: SASA Task Manager — 시간표와 과목

**Source PRD**: `.claude/prds/sasa-task-manager.prd.md`
**Selected Milestone**: Release 1 / Milestone 2 — 시간표와 과목
**Complexity**: Medium

## Summary

앱에 **처음으로 데이터가 들어온다.** Firestore를 붙이고(사용자별 격리 규칙 포함), 과목을 등록·수정·삭제하는 화면과 요일×교시 격자에 과목을 배치하는 화면을 만든다. 시안 07(과목 편집)은 이미 확정돼 있으므로 그대로 옮기고, 격자 화면만 시안에 없어 같은 디자인 언어로 새로 짠다. 완료 기준은 코드가 아니라 데이터다 — **2026년 2학기 실제 시간표(과목 12개 · 슬롯 32칸)가 앱 안에 들어가 있어야 한다.**

기한 자동 계산은 여기서 하지 않는다. 다만 그 계산이 읽을 데이터 모양(과목 1 : 슬롯 N, 교사는 슬롯에 붙음)을 여기서 확정한다.

## Data Model Decision (핵심 판단)

`users/{uid}/subjects/{subjectId}` **단일 컬렉션. 슬롯은 과목 문서 안의 배열 필드.**

```ts
type Slot = { day: 1|2|3|4|5; period: number; teacher?: string; room?: string }
type Subject = {
  name: string      // 저장 시 로마숫자 → ASCII 정규화
  short: string     // 최대 3글자, 사용자 입력
  icon: string      // 고정 40종의 id
  color: string     // 팔레트 4색 중 하나
  slots: Slot[]
}
```

슬롯을 별도 컬렉션으로 빼지 않는 이유: 과목 10개 남짓 × 슬롯 2~6개다. 한 번 읽으면 격자 전체가 그려지고, 과목 편집이 슬롯 편집과 같은 문서 쓰기 한 번으로 끝나며, 과목을 지우면 슬롯이 같이 사라진다(고아 없음). M5 학기 초기화도 컬렉션 하나 비우기다. 조인이 필요한 쿼리가 하나도 없다.

교사·강의실은 과목이 아니라 **슬롯**에 붙는다 — 팀티칭(미적분학I 월5·6 길승호 / 월7 고민지)이 예외가 아니라 이 학교의 기본값이기 때문이다.

같은 날 연속 교시(인공지능 월8·9)는 **슬롯 2개**로 저장한다. 병합 저장은 하지 않는다. 기한 계산은 교시가 아니라 수업일 기준이라 어차피 `day`로 묶어 읽고, 격자도 칸 단위로 그린다. 병합은 순수한 표시 문제이므로 데이터에 넣지 않는다.

설정값(주 시작 요일 등)은 M5 소관이라 이번에 만들지 않는다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 화면 골격 | [Screen.tsx](src/components/Screen.tsx) | `<Screen title aside>` — appbar + 스크롤 body. 새 화면 3개도 이걸 쓴다. |
| 목록 행 | [app.css:306](src/styles/app.css:306) `.row` / `.rows` / `.ttlbl` | 과목 목록·프로필 진입 행에 그대로 재사용. 새 클래스 만들지 않는다. |
| 아이콘 | [icons.tsx:1](src/components/icons.tsx:1) | viewBox 24, `fill` 없음, stroke 는 CSS가 정함. 40종도 같은 규칙. |
| 폼 · 아이콘 피커 · 색칩 | `design/mockup-v1.html:717` (07 SUBJECT EDIT) + `:179` (`.pickgrid` · `.form` · `.chip` · `.limit` CSS) | **시안에 이미 다 있다. 값을 재해석하지 않고 옮긴다.** |
| Firebase 초기화 | [firebase.ts:19](src/lib/firebase.ts:19) | `isConfigured` 가드 뒤에서 초기화하고 `null` 을 export. Firestore도 동일하게. |
| 구독 훅 | [useAuth.ts:13](src/lib/useAuth.ts:13) | `{data, loading, error}` 3상태 + `useEffect` 안에서 unsubscribe 반환. `useSubjects()` 도 같은 모양. |
| 조용한 실패 금지 | [useAuth.ts:9](src/lib/useAuth.ts:9) | 에러를 삼키지 않고 화면까지 올린다. Firestore 권한 오류가 특히 조용하다. |
| 실물 시간표 | AcEVault `wiki/coursework-2026-2학기-시간표.md` | 입력 원본. 교사·강의실까지 그 표가 정답이다. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/lib/firestore.ts` | CREATE | `db` 초기화. PWA 조회 캐시용 persistent local cache 포함. |
| `src/lib/subjects.ts` | CREATE | `Subject`/`Slot` 타입, 로마숫자 정규화, CRUD, `useSubjects()` |
| `src/lib/subjects.test.ts` | CREATE | 정규화 · 슬롯 중복 · 격자 인덱싱 검증 (Vitest 도입) |
| `src/components/subject-icons.tsx` | CREATE | 시안 iconset 40종을 `{id, name, category, svg}` 배열로 |
| `src/screens/Subjects.tsx` | CREATE | 과목 목록 + 추가. `.rows`/`.row` 재사용 |
| `src/screens/SubjectEdit.tsx` | CREATE | 시안 07 그대로. 이름 · 줄임말(3자) · 아이콘 40 · 색 4 · 삭제 |
| `src/screens/Timetable.tsx` | CREATE | 5요일 × 9교시 격자. 칸 탭 → 과목 배치, 교사·강의실 입력 |
| `src/screens/Profile.tsx` | UPDATE | "시간표 설정" · "과목" 진입 행 추가 (시안 06 캡션대로 여기 산다) |
| `src/App.tsx` | UPDATE | 라우트 3개 추가 + **dev 미리보기 우회 제거** (아래 참조) |
| `src/styles/app.css` | UPDATE | 시안의 `.form` · `.field` · `.inp` · `.pickgrid` · `.chip` · `.limit` + 격자 클래스 |
| `firestore.rules` | CREATE | 사용자별 격리. 사용자가 콘솔에 붙여넣는다. |
| `docs/setup-firebase-vercel.md` | UPDATE | Firestore 활성화 + 규칙 붙여넣기 절 추가 |
| `package.json` | UPDATE | `vitest` devDependency + `test` 스크립트 |
| `.claude/prds/sasa-task-manager.prd.md` | UPDATE | 마일스톤 2 행 → `in-progress` + Plan 경로 |

**dev 미리보기 우회 제거**: [App.tsx:34](src/App.tsx:34)의 `PREVIEW_USER`는 M1 계획에서 "M3에 없앤다"고 적었지만, Firestore가 M2에 들어오므로 여기서 없앤다. 가짜 uid로는 읽을 데이터가 없어 화면이 어차피 비고, `db`가 `null`인 분기를 화면마다 들고 다니게 만든다. Firebase는 이미 설정돼 있으므로 실익이 사라졌다.

## Tasks

### Task 1: Firestore 연결과 보안 규칙
- **Action**: `firestore.ts`에 `db` 초기화(`initializeFirestore` + `persistentLocalCache` — PWA에서 비행기 모드로도 시간표가 보이게). `firestore.rules`에 `match /users/{uid}/{doc=**} { allow read, write: if request.auth != null && request.auth.uid == uid }`. `docs/`에 콘솔 절차(Firestore 생성 → **프로덕션 모드** → 규칙 탭에 붙여넣기 → 게시) 추가.
- **Mirror**: [firebase.ts:19](src/lib/firebase.ts:19)의 `isConfigured` 가드 패턴.
- **Validate**: 콘솔 규칙 시뮬레이터에서 `users/{내uid}/subjects/x` 읽기 allow, `users/other/subjects/x` 읽기 deny. 두 결과를 눈으로 확인.
- **주의**: 이 태스크가 Task 2보다 **먼저** 끝나야 한다. 테스트 모드로 배포된 순간 30일간 인터넷 전체가 읽고 쓸 수 있다.

### Task 2: 과목 데이터 계층 + 로마숫자 정규화
- **Action**: `subjects.ts` — 타입, `normalizeName()`(`Ⅰ~Ⅹ` → `I~X`, U+2160~U+2169 및 소문자 U+2170~), `create/update/remove`, `useSubjects()` 실시간 구독 훅. 정렬은 클라이언트에서 이름순(문서 10개, 인덱스 불필요).
- **Mirror**: [useAuth.ts:13](src/lib/useAuth.ts:13)의 3상태 + unsubscribe 구조. 에러는 삼키지 않고 반환한다.
- **Validate**: `npx vitest run` — `normalizeName('일반물리학Ⅰ') === '일반물리학I'`, `'체육Ⅳ' === '체육IV'`, 로마숫자 없는 이름은 그대로.

### Task 3: 아이콘 40종 이식
- **Action**: 시안 `.iconset`(`design/mockup-v1.html:801`)의 40개를 6축(수학·과학 10 / 컴퓨터 5 / 언어·인문 6 / 예체능 6 / 연구·프로젝트 5 / 일반 8) 그대로 배열로 옮긴다. `id`는 Firestore에 저장되므로 한 번 정하면 바꾸지 않는다.
- **Mirror**: 시안 SVG를 **복사**한다. 다시 그리지 않는다.
- **Validate**: 배열 길이 40, 카테고리별 개수 10/5/6/6/5/8 — 테스트 한 줄로 고정.

### Task 4: 과목 목록 · 과목 편집 화면
- **Action**: `Subjects.tsx`(목록 + 추가 버튼 + 슬롯 개수 표시), `SubjectEdit.tsx`(시안 07: 이름 · 줄임말 3자 카운터 · 6열 아이콘 그리드 · 색칩 4 · 저장 · 삭제). Profile에 진입 행 2개 추가. 줄임말은 3자 초과 입력을 막고 남은 글자수를 시안의 `.limit` 바로 보여준다.
- **Mirror**: 시안 07 마크업/클래스(`.form` `.field` `.inp` `.pickgrid` `.chip` `.limit`)를 그대로. 목록은 기존 `.row`.
- **Validate**: 과목 하나 만들고 새로고침 → 남아 있음. 다른 브라우저 프로필로 같은 계정 로그인 → 같은 과목이 보임(동기화 확인).

### Task 5: 시간표 격자 배치
- **Action**: `Timetable.tsx` — 5열(월~금) × 9행(1~9교시) 격자. 칸에는 **줄임말 3글자 + 과목 색**만 그린다(390px에서 이 이상은 뭉개진다). 빈 칸 탭 → 과목 선택 시트 → 교사·강의실 선택 입력 → 배치. 배치 직후 그 과목이 **선택 상태로 남아** 다음 칸은 한 번의 탭으로 같은 과목이 들어간다(미적분 월5·6·7, 인공지능 월8·9 같은 연속 교시가 대부분이라 이게 입력 시간을 절반으로 줄인다). 배치된 칸 탭 → 해제 또는 교사 수정.
- **Mirror**: 시안에 격자 화면은 없다. 테두리 `--b2`, 하드 섀도우 `--sh-xs`, 라벨은 `--pix`로 기존 언어 안에서 짠다. **새 색이나 새 그림자 값을 만들지 않는다.**
- **Validate**: 실제 시간표 32칸을 넣고 15분 안에 끝나는지 실측. 넘으면 입력 흐름을 고친다(PRD Risks 항목).
- **대비 처리**: 색 4종 중 `#34170D`(ink)를 고른 과목은 칸 배경이 어두우므로 글자를 크림으로 뒤집는다. 한 줄 헬퍼로 처리.

### Task 6: 실제 시간표 입력 (이 마일스톤의 완료 조건)
- **Action**: AcEVault 위키 표 그대로 사용자가 직접 입력한다 — 과목 12개(인공지능 · 체육IV · 영어독해와작문 · 시민사회와 정치 · 미적분학I · 프로젝트기반연구I · 알고리즘 · 이산수학 · 일반물리학I · 일반물리학실험I · **연구활동** · **창의적 체험활동**), 슬롯 32칸.
- **Mirror**: 비교과 블록(연구활동 수5~7, 창의적 체험활동 금5)도 **과목과 똑같이** 만든다. 교사·강의실만 비운다. PRD 확정 사항이다.
- **Validate**: 격자를 위키 표와 나란히 놓고 32칸 대조. 아이폰에서 열어 같은 격자가 보이는지 확인.

## Validation

```bash
npm run build && npx vitest run
```

```bash
npm run dev
```

수동 확인 체크리스트:
- [ ] 규칙 시뮬레이터에서 남의 uid 경로 접근이 **거부**된다
- [ ] 과목 저장 → 새로고침 유지 → 다른 기기에서 동일하게 보임
- [ ] `일반물리학Ⅰ` 붙여넣기 → `일반물리학I`로 저장되고 폰트가 튀지 않음
- [ ] 줄임말 4글자 입력 차단, 카운터 동작
- [ ] 아이콘 40개 전부 렌더 (빈 칸 없음)
- [ ] 375px에서 격자 5×9가 가로 스크롤 없이 들어가고 줄임말이 읽힌다
- [ ] ink 색 과목 칸의 글자가 읽힌다
- [ ] 시간표 32칸이 위키 표와 일치
- [ ] 과목 삭제 시 그 과목 슬롯이 격자에서 함께 사라진다

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Firestore를 테스트 모드로 열어둔 채 배포한다.** 30일간 인증 없이 전 세계가 읽고 쓴다. | 중간 | Task 1을 다른 모든 작업보다 먼저 끝낸다. 프로덕션 모드로 생성하고 규칙을 먼저 게시한다. 시뮬레이터 deny 확인을 검증 항목으로 박아둔다. |
| 격자 입력 32칸이 지루해서 시작 자체를 미룬다 | 중간 | 배치 후 과목 선택 유지(연속 교시 1탭). 15분 실측을 Task 5 검증에 넣었다. |
| 390px에 5×9 격자가 안 들어간다 | 중간 | 칸에 줄임말 3글자만 넣는다 — 줄임말 필드가 존재하는 이유가 이것이다. 그래도 좁으면 교시 라벨 열을 줄이고 칸 높이를 낮춘다. 요일을 쪼개는 후퇴안은 마지막. |
| 색 4종으로 과목 12개를 구분하지 못한다 | 확실 | **구분하지 않는 것이 설계다.** 형태(아이콘 40)와 줄임말이 식별을 맡고 색은 덩어리 인식만 돕는다 (PRD Design Direction). 색을 늘리지 않는다. |
| 로마숫자 정규화를 저장 경로 한 곳에서 빠뜨려 우회 입력이 생긴다 | 중간 | 정규화를 화면이 아니라 `subjects.ts`의 쓰기 함수 **안**에서 한다. 화면은 정규화를 모른다. |
| M3에서 task가 `subjectId`를 참조하는데 과목 삭제 정책이 없다 | 낮음 | M2에는 task가 없어 문제가 성립하지 않는다. M3 계획에서 결정한다(고아 task를 "과목 없음"으로 낙하). 지금 미리 만들지 않는다. |
| persistent cache가 Safari PWA에서 예상대로 안 붙는다 | 낮음 | 조회 캐시는 있으면 좋은 것이지 요구사항이 아니다(PRD: 오프라인 편집 out of scope). 실패하면 메모리 캐시로 되돌리고 넘어간다. |

## Acceptance

- [x] 보안 규칙이 게시됐고 남의 데이터 접근이 거부된다 — 사용자 확인 (2026-08-20)
- [x] 과목 등록 · 수정 · 삭제가 되고 기기 간에 동기화된다 — 사용자 확인
- [x] 아이콘 40종 · 색 4종 · 줄임말 3자 제한이 시안대로 동작한다 — 40개 렌더 · 축별 10/5/6/6/5/8 확인
- [x] 로마숫자가 저장 시 ASCII로 정규화된다 — 테스트로 고정 (`normalizeName`)
- [x] 요일×교시 격자에 과목이 배치되고 정확히 보인다 — 375px에서 격자 351px, 가로 오버플로 0
- [x] **2026년 2학기 실제 시간표(과목 12 · 슬롯 32)가 앱에 들어가 있다** — 사용자 확인
- [x] `npm run build` · `npx vitest run` 통과 (테스트 9개)
- [x] 발명이 아니라 시안 07을 옮겼다 — `.form` · `.pickgrid` · `.chip` · `.limit` 클래스 그대로

### 구현 중 바뀐 것 (계획과 다른 판단)

- **`src/lib/firestore.ts` 를 만들지 않았다.** `db` 초기화가 3줄이라 `firebase.ts` 안에 넣었다.
  파일 하나를 더 만들 만한 내용이 아니었다.
- **persistent cache 는 `persistentMultipleTabManager` 로.** 기본값(single tab)은 맥에서 탭을
  두 개 열면 두 번째 탭의 캐시가 죽는다. 실제로 그렇게 쓰는 앱이다.
- **아령 아이콘 신규.** 시안의 "달리기"(스틱피겨)를 18px 로 줄이면 팔다리 선이 붙어 형체가
  사라졌다 (사용자 지적, 2026-08-20). 좌우 대칭 사각형 2개 + 바로 다시 그렸다. 세트는 40종 유지.
- **배치 UI 에 시트를 쓰지 않았다.** 계획의 "과목 선택 시트"를 없애고 상단 칩 스트립 +
  교사·강의실 입력 두 칸으로 줄였다. 학기당 1회짜리 화면에 모달을 얹을 이유가 없었다.
- **임시 검증 페이지**(`dev.html` + `src/dev-preview.tsx`)로 로그인 없이 격자·폼 레이아웃을
  실제 CSS·실제 12과목 데이터로 확인한 뒤 삭제했다. 저장소에 남기지 않았다.

## Out of Scope (이 마일스톤 아님)

task CRUD · 기한 자동 계산 · List View 그룹 · 달력 · 설정 화면 실동작(주 시작 요일 · 한/영 · 계정 삭제 · 학기 초기화) · 알림 · 다크 모드. 학기 초기화는 M5지만 이번 데이터 모델이 그걸 "컬렉션 하나 비우기"로 만들어 둔다.
