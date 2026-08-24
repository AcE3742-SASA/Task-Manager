import { SubjectIcon } from './subject-icons'
import { formatDue } from '../lib/due'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import { KIND_EN } from '../lib/tasks'
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
  onSnooze: () => void
}

const Check = () => (
  <svg viewBox="0 0 24 24">
    <path d="m4 12 6 6L20 5" />
  </svg>
)

/** 하루 앞으로 감는 시계 — "미루기". */
const Snooze = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v4h-4" />
  </svg>
)

/** 반복 할일 표시 — 두 개의 순환 화살표. */
const RepeatMark = () => (
  <svg viewBox="0 0 24 24" className="repeat-mark">
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 3.5v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20.5V16h4.5" />
  </svg>
)

export function TaskRow({ task, subject, now, urgent, onOpen, onToggle, onSnooze }: Props) {
  const { lang } = useAppSettings()
  const t = useT()
  const due = formatDue(task.due, now, task.done, lang)
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
            <s>{lang === 'en' ? (KIND_EN[task.kind] ?? task.kind) : task.kind}</s>
            {task.repeat !== 'none' && <RepeatMark />}
            {subject?.name ?? t('과목 없음', 'No subject')}
          </em>
        </span>
        <span className="due">
          {due.main}
          <u>{due.sub}</u>
        </span>
      </button>
      {!task.done && (
        <button className="snooze" onClick={onSnooze} aria-label={t('하루 미루기', 'Postpone a day')}>
          <Snooze />
        </button>
      )}
      <button
        className="box"
        onClick={onToggle}
        aria-label={task.done ? t('완료 취소', 'Mark not done') : t('완료', 'Mark done')}
      >
        {task.done && <Check />}
      </button>
    </div>
  )
}
