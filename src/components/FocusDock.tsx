import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDue, kstToday } from '../lib/due'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import { useSubjects } from '../lib/subjects'
import { toggleDone, toggleFocus, useTasks } from '../lib/tasks'
import type { Task } from '../lib/tasks'

const KEY = 'focusdock.min'

/** 접기/펴기 표시. 접히면 위를 향한다. */
const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" className={`chev${up ? ' up' : ''}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Check = () => (
  <svg viewBox="0 0 24 24">
    <path d="m4 12 6 6L20 5" />
  </svg>
)

/** 접힘 상태는 이 기기에서만 의미가 있는 편의값이다. 못 읽어도 펴진 채로 뜨면 그만. */
function readMin(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * "오늘 끝낼 것" 목록. Gmail 작성 팝업처럼 오른쪽 아래에 떠서 접었다 펼 수 있다.
 * 여기 담긴 할일은 원래 목록에서 사라지지 않는다 — 이 창은 골라 놓은 것을
 * 한 번 더 보여줄 뿐이고, 무엇도 옮기거나 숨기지 않는다.
 * 꽂아 둔 게 없으면 아예 안 뜬다. 빈 창이 화면 구석을 차지할 이유가 없다.
 */
export function FocusDock({ uid }: { uid: string }) {
  const { tasks } = useTasks(uid)
  const { subjects } = useSubjects(uid)
  const navigate = useNavigate()
  const { lang } = useAppSettings()
  const t = useT()
  const [min, setMin] = useState(readMin)

  const now = new Date()
  const today = kstToday(now)
  const byId = new Map(subjects.map((s) => [s.id, s]))

  // 끝낸 것은 아래로 내리되 지우지 않는다 — 오늘 몇 개를 해냈는지가 이 창의 절반이다.
  const picked = tasks
    .filter((x) => x.focusDate === today)
    .sort((a, b) => Number(a.done) - Number(b.done))
  if (picked.length === 0) return null

  const done = picked.filter((x) => x.done).length

  function toggle() {
    setMin((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1')
      } catch {
        // 저장이 막힌 브라우저에서도 이번 세션 동안은 접힌다.
      }
      return !v
    })
  }

  return (
    <div className="dockslot">
      <section className="dock" aria-label={t('오늘 끝낼 것', 'Today’s list')}>
        <button className="dockbar" onClick={toggle} aria-expanded={!min}>
          <b>{t('오늘 끝낼 것', 'Finish today')}</b>
          <span className="dockcount">
            {done}/{picked.length}
          </span>
          <Chevron up={min} />
        </button>

        {!min && (
          <div className="docklist">
            {picked.map((task: Task) => {
              const due = formatDue(task.due, now, task.done, lang)
              const subject = task.subjectId ? byId.get(task.subjectId) : undefined
              return (
                <div className={`dtask${task.done ? ' done' : ''}`} key={task.id}>
                  <button
                    className="dbox"
                    onClick={() => toggleDone(uid, task)}
                    aria-label={task.done ? t('완료 취소', 'Mark not done') : t('완료', 'Mark done')}
                  >
                    {task.done && <Check />}
                  </button>
                  <button className="dhit" onClick={() => navigate(`/task/${task.id}`)}>
                    <b>{task.title}</b>
                    <em>
                      {subject?.name ?? t('과목 없음', 'No subject')} · {due.main}
                    </em>
                  </button>
                  <button
                    className="dx"
                    onClick={() => toggleFocus(uid, task, today)}
                    aria-label={t('오늘 목록에서 빼기', 'Remove from today’s list')}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
