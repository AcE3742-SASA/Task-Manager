import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { TaskRow } from '../components/TaskRow'
import { GROUPS, groupOf, kstToday, snoozeDue } from '../lib/due'
import type { Group } from '../lib/due'
import { useT } from '../lib/i18n'
import { useSubjects } from '../lib/subjects'
import { snoozeTask, toggleDone, toggleFocus, useTasks } from '../lib/tasks'
import type { Task } from '../lib/tasks'
import { readGuideStatus, saveGuideStatus } from '../lib/onboarding'
import { useNow } from '../lib/useNow'
import '../styles/onboarding.css'

const DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const WEEKDAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' })

/** ko-KR 은 "2026. 08. 20." 로 준다. 시안의 "2026.08.20" 표기에 맞춘다. */
function stamp(now: Date): string {
  return DATE.format(now).replace(/\s/g, '').replace(/\.$/, '')
}

const EN_GROUP: Record<string, string> = {
  '오늘': 'Today',
  '내일': 'Tomorrow',
  '7일 내': 'Next 7 days',
  '미정': 'No date',
  '나중': 'Later',
  '완료': 'Done',
}

const KEY = 'list.collapsed'

/** 접기/펴기 표시. 펴져 있으면 아래(∨), 접히면 오른쪽(>)을 가리킨다. */
const Chevron = ({ shut }: { shut: boolean }) => (
  <svg viewBox="0 0 24 24" className={`chev${shut ? ' shut' : ''}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/**
 * 접힌 그룹 이름들. 이 기기에서만 의미가 있는 편의값이라 Firestore 가 아니라
 * localStorage 에 둔다 — 못 읽어도 전부 펴진 채로 뜨면 그만이다.
 */
function readCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function List({ uid }: { uid: string }) {
  const { tasks, loading, error, fromCache } = useTasks(uid)
  const { subjects } = useSubjects(uid)
  const navigate = useNavigate()
  const t = useT()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [guideDismissed, setGuideDismissed] = useState(() => readGuideStatus(uid) !== null)
  const showGuide = !guideDismissed && !fromCache

  const now = useNow()
  const today = kstToday(now)
  const byId = new Map(subjects.map((s) => [s.id, s]))

  const grouped = GROUPS.map((g) => ({
    group: g,
    items: tasks.filter((x) => groupOf(x.due, now, x.done) === g),
  })).filter((x) => x.items.length > 0)

  function toggleGroup(group: Group) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      // delete 는 지웠으면 true 를 준다 — 있으면 펴고, 없으면 접는다.
      if (!next.delete(group)) next.add(group)
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]))
      } catch {
        // 저장이 막힌 브라우저에서도 이번 세션 동안은 접힌다.
      }
      return next
    })
  }

  return (
    <Screen title={t('할 일', 'To-do')} aside={`${stamp(now)}\n${WEEKDAY.format(now)}`}>
      {error && (
        <div className="form">
          <div className="hint" role="alert">
            {t('할 일을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not load your tasks. Check your connection and try again.')}
            <button className="guide-link" onClick={() => window.location.reload()}>{t('다시 불러오기', 'Reload')}</button>
          </div>
        </div>
      )}

      {!error && loading && tasks.length === 0 && <p className="list-loading" role="status">{t('할 일을 불러오고 있어요…', 'Loading your tasks…')}</p>}

      {!error && !loading && tasks.length === 0 && (
        <section className="welcome" aria-labelledby="welcome-title">
          <h2 id="welcome-title">{showGuide ? t('할 일 하나부터 시작해 보세요', 'Start with one task') : t('표시할 할 일이 없어요', 'No tasks to show')}</h2>
          <p>{t('과목이 없어도 바로 기록할 수 있어요. 저장한 할 일은 기한에 따라 이곳에 모여요.', 'You can add a task without a subject. Saved tasks appear here, grouped by due date.')}</p>
          <div className="guide-actions">
            <Link className="bigbtn" to="/new">{showGuide ? t('첫 할 일 추가', 'Add your first task') : t('할 일 추가', 'Add a task')}</Link>
            <div className="welcome-options">
              <Link className="guide-link" to="/help">{t('사용 방법 보기', 'See how it works')}</Link>
              {showGuide && <button className="guide-link" onClick={() => {
                saveGuideStatus(uid, 'skipped')
                setGuideDismissed(true)
              }}>{t('안내 건너뛰기', 'Skip the guide')}</button>}
            </div>
          </div>
        </section>
      )}

      {grouped.map(({ group, items }) => {
        const shut = collapsed.has(group)
        const id = `grp-${GROUPS.indexOf(group)}`
        return (
          <section key={group}>
            {/* 제목 줄 전체가 접기 버튼이다. 접어도 개수는 남아 몇 개가 숨었는지 보인다. */}
            <button className="grp" onClick={() => toggleGroup(group)} aria-expanded={!shut} aria-controls={id}>
              <Chevron shut={shut} />
              <h2>{t(group, EN_GROUP[group])}</h2>
              <span className="cnt">{items.length}</span>
              <span className="rule" />
            </button>
            <div id={id} hidden={shut}>
              {items.map((task: Task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  subject={task.subjectId ? byId.get(task.subjectId) : undefined}
                  now={now}
                  urgent={group === '오늘'}
                  focused={task.focusDate === today}
                  onOpen={() => navigate(`/task/${task.id}`)}
                  onToggle={() => toggleDone(uid, task)}
                  onSnooze={() => snoozeTask(uid, task, snoozeDue(task.due, now))}
                  onFocus={() => toggleFocus(uid, task, today)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {grouped.length > 0 && <div className="tasks-end" />}
    </Screen>
  )
}
