# Plan: SASA Task Manager — 할일의 일생

**Source PRD**: `.claude/prds/sasa-task-manager.prd.md`
**Selected Milestone**: Release 1 / Milestone 3 — 할일의 일생
**Complexity**: Large

## Summary

앱이 실제로 쓸 만해지는 마일스톤이다. task를 등록·수정·삭제·완료하고, 과목을 고르면 **"다음 주 첫 수업 전날 23:59"** 가 자동으로 채워지며, List View가 오늘 / 내일 / 이번 주 / 나중 / 완료로 묶어 보여준다. M2가 만든 슬롯 데이터를 처음으로 소비한다.

이 마일스톤이 닫히는 순간부터 **실사용을 시작한다.** 그래서 4주 뒤 M6에서 측정할 지표 중 **등록 시점에만 잡을 수 있는 두 값**을 지금 같이 심는다. 나중에 소급이 불가능하다.

## Data Model

`users/{uid}/tasks/{taskId}` — 과목과 같은 격리 규칙 아래 있으므로 `firestore.rules` 는 손대지 않는다.

```ts
type Task = {
  title: string
  subjectId: string | null   // 개인 할일은 null
  note: string
  due: Timestamp             // 항상 존재. 개인 할일도 사용자가 직접 정한다
  kind: '과제' | '수행평가' | '시험' | '개인'   // 표시 전용
  done: boolean
  doneAt: Timestamp | null   // "기한 경과 후 완료" 판정에 필요
  createdAt: Timestamp
  // ── 아래 둘은 M6 검증용. 등록 시점에만 알 수 있어 지금 심는다 ──
  dueWasDefault: boolean     // 자동 계산값을 그대로 저장했는가 → 채택률 지표
  entryMs: number            // New 진입 → 저장까지 → "등록 30초" 지표
}
```

`dueWasDefault` 와 `entryMs` 는 PRD Success Metrics 4개 중 2개의 **유일한 데이터 출처**다. 지금 안 넣으면 M6에서 측정할 것이 없다. 필드 2개가 "등록 30초" 목표와 충돌하지 않는 이유: 사용자가 입력하는 값이 아니라 앱이 자동으로 기록하는 값이다.

## 기한 계산 — 이 마일스톤의 핵심 로직

`src/lib/due.ts` 에 **순수 함수**로 둔다. Firestore도 React도 모른다. 그래야 테스트가 붙는다.

```
nextDue(slots, now, weekStartsOn) -> Date
```

1. `now` 가 속한 주의 **다음 주 시작일**을 구한다 (M3 에서는 월요일 고정, M5 에서 설정값을 넘긴다)
2. 그 주에서 `slots` 의 `day` 중 가장 이른 요일을 고른다 — 같은 날 여러 교시는 하루로 묶인다
3. 기한 = 그 수업일의 **전날 23:59**
4. 슬롯이 없으면 → `now + 7일`, 23:59

시간대는 **Asia/Seoul 고정 오프셋 +09:00** 으로 계산한다. 한국은 1988년 이후 서머타임이 없어 `Intl` 을 돌리거나 라이브러리를 넣을 이유가 없다. 사용자가 해외에 있어도 기한은 한국 시간 기준이어야 맞다.

PRD의 두 예시를 그대로 테스트로 박는다:
- 인공지능(월1 · 월8 · 월9), 월요일 등록 → **일요일 23:59**
- 일반물리학I(수3·4 · 금3·4), 수요일 등록 → **화요일 23:59**. 같은 과목을 금요일에 등록해도 결과 동일

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 데이터 계층 | [subjects.ts](src/lib/subjects.ts) | 타입 → `clean()` → CRUD → `use*()` 구독 훅. `tasks.ts` 도 같은 순서·같은 3상태. |
| 쓰기 정규화 | `subjects.ts` `clean()` | 정규화·기본값을 쓰기 함수 **안**에서 한다. 화면이 우회할 수 없게. |
| 조용한 실패 금지 | [useAuth.ts:9](src/lib/useAuth.ts:9) | 권한 오류를 화면까지 올린다. |
| 할일 행 | `design/mockup-v1.html:342` (01 LIST) + `:95` (`.task` CSS) | `ic → txt(b + em) → due → box`. `.urgent`(오늘, ink 반전) · `.done`(점선·취소선) 변형 포함. |
| 그룹 헤더 | 동 `:90` (`.grp`) | 제목 + 개수 배지 + 가로줄 |
| 등록 폼 | 동 `:531` (04 NEW) + `:207` (`.autonote`) | `.field`/`.inp`/`.chips`/`.chip.sm` — M2 에서 이미 이식한 클래스 그대로 |
| 자동 기한 안내 | 동 `.autonote` | 왜 이 날짜인지 문장으로 보여준다. 자동값이 틀렸을 때 사용자가 알아채는 장치다. |
| 아이콘 | [subject-icons.tsx](src/components/subject-icons.tsx) | `<SubjectIcon id>`. 과목 없으면 `dots` 로 낙하. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/lib/due.ts` | CREATE | 기한 계산 · 그룹 분류 · 날짜 표기. 순수 함수만 |
| `src/lib/due.test.ts` | CREATE | PRD 예시 2건 + 경계(주말·방학·슬롯없음·연말) |
| `src/lib/tasks.ts` | CREATE | 타입 · CRUD · `useTasks()` · 완료 토글 |
| `src/components/TaskRow.tsx` | CREATE | 시안 `.task` 행. M4 달력이 그대로 재사용한다 |
| `src/screens/List.tsx` | REWRITE | 5개 그룹 + 빈 상태 |
| `src/screens/New.tsx` | REWRITE | 등록 폼. 과목 선택 시 기한 자동 채움 |
| `src/screens/TaskEdit.tsx` | CREATE | 수정·삭제. New 와 폼 본체를 공유 |
| `src/App.tsx` | UPDATE | `/task/:id` 라우트 |
| `src/styles/app.css` | UPDATE | `.task` · `.grp` · `.autonote` · 날짜 입력 |
| `.claude/prds/...prd.md` | UPDATE | 마일스톤 3 → `in-progress` |

`firestore.rules` 는 바꾸지 않는다 — `users/{uid}/{document=**}` 가 이미 tasks 를 덮는다.

## Tasks

### Task 1: 기한 계산 엔진 (테스트 먼저)
- **Action**: `due.ts` — `nextDue()`, `groupOf(due, now)`, `formatDue(due, now)`. KST 고정 오프셋. 테스트를 먼저 쓰고 통과시킨다.
- **Mirror**: 없음(신규 로직). 기존 코드에 날짜 계산이 없다.
- **Validate**: `npx vitest run`. PRD 예시 2건 + 슬롯 없음 → +7일 + 12/31 등록 시 연도 넘김 + 주말 등록.

### Task 2: task 데이터 계층
- **Action**: `tasks.ts` — 타입, `clean()`(제목 trim·빈 note 제거·로마숫자 정규화 재사용), `createTask/saveTask/removeTask/toggleDone`, `useTasks()`. 완료 토글은 `done` 과 `doneAt` 을 함께 쓴다.
- **Mirror**: [subjects.ts](src/lib/subjects.ts) 구조 그대로.
- **Validate**: 등록 → 새로고침 유지 → 다른 기기에서 보임.

### Task 3: 등록 화면
- **Action**: 제목 · 과목 칩 · 자동 기한 안내 · 기한(수정 가능) · 종류 칩 4개 · 내용. 과목을 고르는 **즉시** 기한이 다시 계산되고 `.autonote` 가 "왜 이 날짜인지"를 문장으로 보여준다. 사용자가 기한을 직접 건드리면 `dueWasDefault = false`. 화면 진입 시각을 잡아 저장 시 `entryMs` 기록.
- **Mirror**: 시안 04. `.chip`/`.chip.sm`/`.autonote` 는 M2 에서 이미 CSS 가 들어와 있다.
- **Validate**: 등록 30초 실측. 과목만 고르고 바로 저장하는 최단 경로가 몇 초인지 잰다.

### Task 4: List View
- **Action**: 오늘 / 내일 / 이번 주 / 나중 / 완료 5그룹. 그룹별 개수 배지. 체크박스로만 완료가 바뀌고, 본문을 누르면 수정 화면으로 간다. 오늘 그룹은 `.urgent`(ink 반전).
- **Mirror**: 시안 01 마크업·클래스.
- **Validate**: 각 그룹에 최소 1건씩 넣고 경계(오늘 23:59, 내일 00:00)를 눈으로 확인.

### Task 5: 수정 · 삭제
- **Action**: `/task/:id` 에서 등록과 같은 폼으로 수정. 삭제는 확인 후. 여기서는 기한을 자동 재계산하지 않는다 — 이미 정해진 기한을 화면 여는 것만으로 바꾸면 안 된다.
- **Mirror**: [SubjectEdit.tsx](src/screens/SubjectEdit.tsx) 의 `key` 로 폼 상태를 새로 만드는 패턴.
- **Validate**: 수정 후 목록 반영, 삭제 후 사라짐, 뒤로가기 정상.

### Task 6: 고아 task 처리
- **Action**: 과목이 삭제됐는데 task 가 그 `subjectId` 를 가리키면 "과목 없음"으로 낙하시킨다. 아이콘은 `dots`. task 는 지우지 않는다.
- **Mirror**: [subject-icons.tsx](src/components/subject-icons.tsx) `SubjectIcon` 의 모르는 id 낙하 방식과 같은 태도.
- **Validate**: 과목 하나 지우고 그 과목 task 가 목록에 남아 있는지 확인.

## Validation

```bash
npm run build && npx vitest run
```

수동 확인 (2026-08-21 사용자 확인 — 실사용 시작):
- [x] 과목 고르면 기한이 자동으로 채워지고, 안내 문장의 날짜가 실제 시간표와 맞는다
- [x] 자동값을 안 건드리고 저장 → `dueWasDefault: true` 로 기록된다
- [x] 오늘 / 내일 / 이번 주 / 나중 / 완료 분류가 자정 경계에서 맞다
- [x] 체크박스로만 완료가 토글되고, 본문 탭은 수정 화면을 연다
- [x] 맥에서 등록 → 아이폰에서 보인다
- [x] 등록 1건 30초 이내 — 사용자 평 "완전 편해"

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **기한 계산이 조용히 하루 어긋난다.** UTC/KST 경계, 자정, 주 경계에서 흔하다. | 높음 | 순수 함수로 분리하고 PRD 예시를 테스트로 박는다. 고정 오프셋 +09:00 만 쓴다 — `new Date()` 의 로컬 시간대에 의존하지 않는다. |
| 그룹 경계가 자정에 안 바뀐다 (앱을 계속 켜둔 경우) | 중간 | `now` 를 렌더 시점에 읽는다. 자정 타이머는 넣지 않는다 — 앱을 다시 열면 맞는다. 거슬리면 그때 추가. |
| 등록이 30초를 넘는다 | 중간 | 최단 경로를 제목 → 과목 → 저장 3동작으로 유지한다. 넘으면 필드를 빼지 말고 순서·기본값을 고친다. |
| M6 지표를 못 재게 된다 | 낮음 | `dueWasDefault`·`entryMs` 를 이번에 심는다. 소급 불가라 나중이 없다. |
| 과목 삭제로 task 가 깨진다 | 낮음 | Task 6. task 는 살리고 표시만 낙하시킨다. |

## 확정된 판단 2개 (2026-08-21, 사용자)

1. **기한이 지난 task 는 "오늘" 그룹 맨 위**에 넣고 `.urgent` 로 표시한다. 별도 그룹을 만들지 않는다.
   기한 표기만 `지남` 으로 구분한다.
2. **수정은 전체 화면 라우트**(`/task/:id`). PRD 의 "상세 모달"을 화면으로 바꾼다 — 뒤로가기가
   자연스럽고 등록 폼을 그대로 재사용한다.

## Out of Scope

달력(M4) · 설정 실동작(M5) · 알림 · 다크 모드 · 반복 task · 첨부 · 하위 체크리스트 · 우선순위. 주 시작 요일은 M5 이지만 `nextDue()` 가 인자로 받게 만들어 그때 배선만 하면 되게 둔다.

## 완료 (2026-08-21)

실사용 시작. 남은 검증은 M6 에서 4주치 실데이터로 한다 — 자동 기한 채택률(목표 70%)과
등록 소요 시간 중앙값(목표 30초)은 `dueWasDefault` · `entryMs` 에 쌓이고 있다.

### 구현 중 바뀐 것
- **`TaskForm` 을 컴포넌트로 뺐다.** New 와 TaskEdit 이 폼 본체를 공유한다. 계획은 두 화면에
  각각 두는 것이었는데, 필드 5개가 똑같아 나눌 이유가 없었다.
- **기한 입력은 네이티브 `datetime-local`.** 날짜 피커를 만들지 않았다. iOS 휠 피커가 그대로 뜬다.
- **`toLocalInput`/`fromLocalInput`** 을 due.ts 에 추가했다. 네이티브 입력이 KST 벽시계 문자열을
  요구하는데 저장은 UTC 순간이라 왕복 변환이 필요했다. 왕복 테스트로 고정했다.
