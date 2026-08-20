import { SubjectIcon } from './subject-icons'
import { formatDue } from '../lib/due'
import type { Subject } from '../lib/subjects'
import type { Task } from '../lib/tasks'

type Props = {
  task: Task
  /** 과목이 지워졌으면 undefined 로 들어온다 — task 는 살리고 표시만 낙하시킨다. */
  subject?: Subject
  now: Date
  urgent: boolean
  onOpen: () => void
  onToggle: () => void
}

const Check = () => (
  <svg viewBox="0 0 24 24">
    <path d="m4 12 6 6L20 5" />
  </svg>
)

export function TaskRow({ task, subject, now, urgent, onOpen, onToggle }: Props) {
  const due = formatDue(task.due, now, task.done)
  const cls = ['task', task.done && 'done', !task.done && urgent && 'urgent'].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <button className="hit" onClick={onOpen}>
        <span className="ic">
          <SubjectIcon id={subject?.icon ?? 'dots'} />
        </span>
        <span className="txt">
          <b>{task.title}</b>
          <em>
            <s>{task.kind}</s>
            {subject?.name ?? '과목 없음'}
          </em>
        </span>
        <span className="due">
          {due.main}
          <u>{due.sub}</u>
        </span>
      </button>
      <button className="box" onClick={onToggle} aria-label={task.done ? '완료 취소' : '완료'}>
        {task.done && <Check />}
      </button>
    </div>
  )
}
