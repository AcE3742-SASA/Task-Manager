import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { TaskRow } from '../components/TaskRow'
import { IconList } from '../components/icons'
import { GROUPS, groupOf } from '../lib/due'
import { useSubjects } from '../lib/subjects'
import { toggleDone, useTasks } from '../lib/tasks'
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

export function List({ uid }: { uid: string }) {
  const { tasks, loading, error } = useTasks(uid)
  const { subjects } = useSubjects(uid)
  const navigate = useNavigate()

  // 렌더 시점에 읽는다. 자정 타이머는 두지 않는다 — 앱을 다시 열면 맞는다.
  const now = new Date()
  const byId = new Map(subjects.map((s) => [s.id, s]))

  const grouped = GROUPS.map((g) => ({
    group: g,
    items: tasks.filter((t) => groupOf(t.due, now, t.done) === g),
  })).filter((x) => x.items.length > 0)

  return (
    <Screen title="할 일" aside={`${stamp(now)}\n${WEEKDAY.format(now)}`}>
      {error && (
        <div className="form">
          <div className="hint">{error}</div>
        </div>
      )}

      {!error && !loading && tasks.length === 0 && (
        <EmptyState
          icon={<IconList />}
          title="아직 등록된 할 일이 없다"
          body="과제를 등록하면 오늘 · 내일 · 이번 주 · 나중 순으로 여기 쌓인다."
        />
      )}

      {grouped.map(({ group, items }) => (
        <section key={group}>
          <div className="grp">
            <h5>{group}</h5>
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
            />
          ))}
        </section>
      ))}

      {grouped.length > 0 && <div className="tasks-end" />}
    </Screen>
  )
}
