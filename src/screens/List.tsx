import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { TaskRow } from '../components/TaskRow'
import { IconList } from '../components/icons'
import { GROUPS, groupOf, snoozeDue } from '../lib/due'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import { useSubjects } from '../lib/subjects'
import { snoozeTask, toggleDone, useTasks } from '../lib/tasks'
import type { Task } from '../lib/tasks'

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
  '이번 주': 'This week',
  '나중': 'Later',
  '완료': 'Done',
}

export function List({ uid }: { uid: string }) {
  const { tasks, loading, error } = useTasks(uid)
  const { subjects } = useSubjects(uid)
  const navigate = useNavigate()
  const { weekStartsOn } = useAppSettings()
  const t = useT()

  // 렌더 시점에 읽는다. 자정 타이머는 두지 않는다 — 앱을 다시 열면 맞는다.
  const now = new Date()
  const byId = new Map(subjects.map((s) => [s.id, s]))

  const grouped = GROUPS.map((g) => ({
    group: g,
    items: tasks.filter((x) => groupOf(x.due, now, x.done, weekStartsOn) === g),
  })).filter((x) => x.items.length > 0)

  return (
    <Screen title={t('할 일', 'To-do')} aside={`${stamp(now)}\n${WEEKDAY.format(now)}`}>
      {error && (
        <div className="form">
          <div className="hint">{error}</div>
        </div>
      )}

      {!error && !loading && tasks.length === 0 && (
        <EmptyState
          icon={<IconList />}
          title={t('아직 등록된 할 일이 없다', 'Nothing here yet')}
          body={t('과제를 등록하면 오늘 · 내일 · 이번 주 · 나중 순으로 여기 쌓인다.', 'Added tasks stack up here as Today, Tomorrow, This week, Later.')}
        />
      )}

      {grouped.map(({ group, items }) => (
        <section key={group}>
          <div className="grp">
            <h2>{t(group, EN_GROUP[group])}</h2>
            <span className="cnt">{items.length}</span>
            <span className="rule" />
          </div>
          {items.map((task: Task) => (
            <TaskRow
              key={task.id}
              task={task}
              subject={task.subjectId ? byId.get(task.subjectId) : undefined}
              now={now}
              urgent={group === '오늘'}
              onOpen={() => navigate(`/task/${task.id}`)}
              onToggle={() => toggleDone(uid, task)}
              onSnooze={() => snoozeTask(uid, task, snoozeDue(task.due, now))}
            />
          ))}
        </section>
      ))}

      {grouped.length > 0 && <div className="tasks-end" />}
    </Screen>
  )
}
