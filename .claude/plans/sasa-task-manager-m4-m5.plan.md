# Plan: SASA Task Manager — 달력 · 손에 맞추기

**Source PRD**: `.claude/prds/sasa-task-manager.prd.md`
**Selected Milestones**: Release 1 / M4 달력 + M5 손에 맞추기
**Complexity**: Medium

## Summary

둘을 함께 한다. **M5 를 먼저** 만든다 — 주 시작 요일이 "이번 주"의 경계를 정하고, 그 경계를 M4 달력과 이미 만들어진 기한 계산이 함께 읽기 때문이다. 설정 없이 달력을 만들면 주 경계를 두 번 짜게 된다.

## 순서와 이유

1. `settings` 문서 + `useSettings()` → 2. 주 시작 요일을 `nextDue`/`groupOf`/달력에 배선 → 3. 한/영 → 4. 학기 초기화·계정 삭제 → 5. 달력 월간/주간

## Data Model

`users/{uid}/settings/app` — 문서 하나. 컬렉션을 쓰는 이유는 규칙(`users/{uid}/**`)이 이미 덮기 때문이다.

```ts
type Settings = { weekStartsOn: 0 | 1; lang: 'ko' | 'en' }   // 0=일요일, 1=월요일
```

## 한/영 — 방식 판단

키 사전(`t('list.title')`)을 만들지 않는다. `t('할 일', 'To-do')` 처럼 **호출 지점에 두 언어를 나란히** 둔다. 키 등록부도, 빠진 키 문제도, 파일 왕복도 없다. 언어가 둘뿐이고 문자열이 화면에만 있는 앱에서 사전은 순수 관리비다.

> **한 가지 이견을 적어둔다.** 한/영 토글은 PRD MVP 항목이라 만들지만, 이 앱의 유일한 사용자가 한국어 원어민이고 영어가 필요하다는 근거는 아직 없다. 앞으로 추가되는 모든 문자열이 두 벌이 된다. M6 검증에서 영어를 한 번도 안 켰다면 걷어내는 것을 후보에 올린다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 설정 행 | `design/mockup-v1.html:598` (05) + `:216` (`.seg`) | `.row` + 우측 `.seg` 토글. REL 2 항목은 `.row.off` + `.tag` 로 자리만 |
| 위험 행 | 동 `:661` (06) | `새 학기 시작` · `계정 삭제` 는 **Profile** 에 산다 (시안 확정). `.row.danger` |
| 데이터 계층 | [subjects.ts](src/lib/subjects.ts) · [tasks.ts](src/lib/tasks.ts) | 타입 → CRUD → `use*()` 3상태 |
| 할일 행 | [TaskRow.tsx](src/components/TaskRow.tsx) | 달력의 날짜별 목록이 **그대로 재사용**한다 (PRD 명시) |
| 주 경계 | [due.ts](src/lib/due.ts) `nextDue`/`groupOf` | 이미 `weekStartsOn` 을 인자로 받게 만들어 뒀다. 배선만 한다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/lib/settings.ts` | CREATE | 설정 문서 · `useSettings()` |
| `src/lib/i18n.ts` | CREATE | `LangContext` + `useT()` |
| `src/lib/wipe.ts` | CREATE | 학기 초기화 · 계정 삭제의 데이터 삭제 |
| `src/screens/Settings.tsx` | REWRITE | 주 시작 요일 · 언어 · 버전 · 개발자 |
| `src/screens/Profile.tsx` | UPDATE | 새 학기 시작 · 계정 삭제 |
| `src/screens/Calendar.tsx` | REWRITE | 월간 · 주간 토글 |
| `src/screens/List.tsx`, `src/components/TaskForm.tsx` | UPDATE | `weekStartsOn` 배선 + 한/영 |
| `src/App.tsx` | UPDATE | `LangContext` 공급 |
| `src/styles/app.css` | UPDATE | `.seg` · 달력 격자 |

## Tasks

### Task 1: 설정 + 주 시작 요일 배선
- **Validate**: 주 시작을 일요일로 바꾸면 List 의 "이번 주" 경계와 새 할일의 자동 기한이 함께 움직인다.

### Task 2: 한/영
- **Validate**: 토글 즉시 화면 문자열이 바뀌고, 새로고침해도 유지된다.

### Task 3: 학기 초기화 · 계정 삭제
- **Action**: 초기화는 `subjects` + `tasks` 전부 삭제(설정은 남긴다). 계정 삭제는 데이터 삭제 후 `deleteUser`.
- **Validate**: 초기화 후 시간표·목록이 비고 설정은 유지된다. 확인 문구 없이는 실행되지 않는다.

### Task 4: 달력
- **월간**: 6주 격자. 날짜 칸에 그날 마감 task 의 **과목 색 점**. 오늘 표시. 날짜를 누르면 아래에 그날 목록.
- **주간**: 시간표 격자를 쓰지 않는다 (PRD 확정). 7일 날짜 스트립(요일·날짜·건수) + 그 아래 날짜별 목록.
- **Validate**: 월 이동·주 이동, 주 시작 요일 반영, 375px 에서 격자가 들어간다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **계정 삭제가 `auth/requires-recent-login` 으로 실패한다.** Firebase 는 오래된 세션의 삭제를 거부한다. | 높음 | 재인증 리다이렉트 흐름을 새로 짜지 않는다. 그 오류를 잡아 "로그아웃 후 다시 로그인하고 시도하라"고 화면에 띄운다. 데이터는 이미 지워진 상태이므로 계정만 남는다 — 그 사실도 문구에 적는다. |
| 학기 초기화가 실수로 눌린다 | 중간 | `confirm()` 로 과목·할일 개수를 보여주고 확인받는다. 되돌리기는 없다 (PRD: 과거 기록 보존 안 함). |
| 월간 격자가 375px 에서 뭉갠다 | 중간 | 날짜 칸에 숫자 + 색 점만. 제목은 넣지 않는다. 시간표 격자에서 이미 검증된 방식. |
| 한/영이 유지비만 남긴다 | 중간 | 위 "이견" 참조. M6 에서 재검토. |

## Out of Scope
알림 · 다크 모드 (Release 2). 과거 학기 보존.

## 완료 (2026-08-21)

- [x] 설정 문서 + 주 시작 요일이 List 그룹 · 자동 기한 · 달력 3곳에 함께 배선됐다
- [x] 한/영 토글 — 호출 지점 2언어 방식
- [x] 학기 초기화 · 계정 삭제
- [x] 달력 월간(6주 격자 · 과목 색 점) · 주간(날짜 스트립 + 그날 목록)
- [x] `npm run build` · 테스트 32개 통과
- [x] 375px 확인 — 월간 42칸, 주간 7칸, 설정 행 전부 렌더

### 구현 중 바뀐 것
- **달력 날짜 계산을 `due.ts` 로 옮겼다.** `monthGrid`/`weekStrip` 을 화면에 두면 테스트가 안 붙는다.
  옮기고 나서 4건을 테스트로 박았다.
- **모드 전환 시 커서를 고른 날짜로 옮긴다.** 월간에서 26일을 고르고 주간으로 넘어가면 스트립엔
  17~23일이 뜨는데 아래 목록은 26일 것이 남는 버그가 있었다. 배율만 바꾸고 날짜는 유지한다.
- **설정을 props 가 아니라 context 로.** 거의 모든 화면이 주 시작 요일이나 언어를 읽어 prop
  drilling 이 더 길어졌다.
- **계정 삭제 재인증 흐름은 만들지 않았다.** `auth/requires-recent-login` 을 잡아 "로그아웃 후
  다시 로그인하고 시도하라"고 안내한다. 데이터는 이미 지워진 상태라는 것도 문구에 넣었다.
