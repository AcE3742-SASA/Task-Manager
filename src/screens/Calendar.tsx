import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { TaskRow } from '../components/TaskRow'
import { dateFromDayNumber, dayNumber, kstDate, kstYmd, monthGrid, snoozeDue, weekStrip } from '../lib/due'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import { useSubjects } from '../lib/subjects'
import { snoozeTask, toggleDone, useTasks } from '../lib/tasks'
import type { Task } from '../lib/tasks'

const WD_KO = ['일', '월', '화', '수', '목', '금', '토']
const WD_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** 하루 칸에 점을 몇 개까지 찍을지. 그 이상은 숫자가 아니라 밀도로만 읽힌다. */
const MAX_DOTS = 4

export function Calendar({ uid }: { uid: string }) {
  const { tasks } = useTasks(uid)
  const { subjects } = useSubjects(uid)
  const { weekStartsOn, lang } = useAppSettings()
  const t = useT()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'month' | 'week'>('month')
  const today = new Date()
  const [cursor, setCursor] = useState(today)
  const [picked, setPicked] = useState<number>(dayNumber(today))

  const byId = new Map(subjects.map((s) => [s.id, s]))
  const perDay = new Map<number, Task[]>()
  for (const task of tasks) {
    // 기한 없는 할일은 달력에 얹을 날짜가 없다 — 목록의 "미정"에서만 보인다.
    if (!task.due) continue
    const k = dayNumber(task.due)
    perDay.set(k, [...(perDay.get(k) ?? []), task])
  }

  const wd = lang === 'en' ? WD_EN : WD_KO
  const weekdays = Array.from({ length: 7 }, (_, i) => wd[(weekStartsOn + i) % 7])

  const cur = kstYmd(cursor)
  const days = mode === 'month'
      ? monthGrid(cur.y, cur.m, weekStartsOn)
      : weekStrip(cur.y, cur.m, cur.d, weekStartsOn)
  const shown = perDay.get(picked) ?? []

  /** 모드를 바꿔도 고른 날은 그대로 둔다 — 날짜가 아니라 배율만 바꾸는 동작이라서. */
  function zoom(next: 'month' | 'week') {
    setMode(next)
    setCursor(dateFromDayNumber(picked))
  }

  function step(dir: 1 | -1) {
    const next =
      mode === 'month'
        ? kstDate(cur.y, cur.m + dir, 1)
        : kstDate(cur.y, cur.m, cur.d + dir * 7)
    setCursor(next)
    // 이동하면 그 구간의 첫 날을 고른다 — 안 보이는 날짜가 선택된 채 남지 않게.
    const p = kstYmd(next)
    setPicked(dayNumber(mode === 'month' ? next : weekStrip(p.y, p.m, p.d, weekStartsOn)[0].date))
  }

  const title =
    mode === 'month'
      ? `${cur.y}.${String(cur.m + 1).padStart(2, '0')}`
      : `${cur.m + 1}/${cur.d} ${t('주', 'week')}`

  return (
    <Screen
      title={t('달력', 'Calendar')}
      action={
        <span className="seg">
          <button
            className={mode === 'month' ? 'on' : ''}
            aria-pressed={mode === 'month'}
            onClick={() => zoom('month')}
          >
            {t('월간', 'Month')}
          </button>
          <button
            className={mode === 'week' ? 'on' : ''}
            aria-pressed={mode === 'week'}
            onClick={() => zoom('week')}
          >
            {t('주간', 'Week')}
          </button>
        </span>
      }
    >
      <div className="cal">
        <div className="calhead">
          <b>{title}</b>
          <span className="calnav">
            <button className="step" onClick={() => step(-1)} aria-label={t('이전', 'Previous')}>
              ‹
            </button>
            <button className="step" onClick={() => step(1)} aria-label={t('다음', 'Next')}>
              ›
            </button>
          </span>
        </div>

        {mode === 'month' ? (
          <div className="month">
            {weekdays.map((d, i) => (
              <span className="wd" key={i}>
                {d}
              </span>
            ))}
            {days.map((cell) => {
              const n = dayNumber(cell.date)
              const q = kstYmd(cell.date)
              const items = perDay.get(n) ?? []
              const cls = [
                'day',
                cell.out && 'out',
                n === dayNumber(today) && 'today',
                n === picked && 'on',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={n}
                  className={cls}
                  aria-pressed={n === picked}
                  aria-label={t(
                    `${q.m + 1}월 ${q.d}일 · 마감 ${items.length}건`,
                    `${q.m + 1}/${q.d} · ${items.length} due`,
                  )}
                  onClick={() => setPicked(n)}
                >
                  {q.d}
                  <span className="dots2">
                    {items.slice(0, MAX_DOTS).map((task) => (
                      <i
                        key={task.id}
                        style={{
                          background: task.subjectId
                            ? (byId.get(task.subjectId)?.color ?? 'transparent')
                            : 'transparent',
                        }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          /* 주간은 시간표 격자를 쓰지 않는다 (PRD 확정) — 날짜 스트립 + 그날 목록. */
          <div className="week">
            {days.map((cell) => {
              const n = dayNumber(cell.date)
              const p = kstYmd(cell.date)
              const count = (perDay.get(n) ?? []).length
              const cls = ['d', n === dayNumber(today) && 'today', n === picked && 'on']
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={n}
                  className={cls}
                  aria-pressed={n === picked}
                  aria-label={t(
                    `${p.m + 1}월 ${p.d}일 · 마감 ${count}건`,
                    `${p.m + 1}/${p.d} · ${count} due`,
                  )}
                  onClick={() => setPicked(n)}
                >
                  <span>{wd[p.day]}</span>
                  <span className="n">{p.d}</span>
                  <span className="c">{count || ''}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grp">
        <h2>{labelFor(picked, t)}</h2>
        <span className="cnt">{shown.length}</span>
        <span className="rule" />
      </div>

      {shown.length === 0 ? (
        <div className="form">
          <div className="hint">{t('이 날 마감은 없다.', 'Nothing due on this day.')}</div>
        </div>
      ) : (
        shown.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            subject={task.subjectId ? byId.get(task.subjectId) : undefined}
            now={today}
            urgent={false}
            onOpen={() => navigate(`/task/${task.id}`)}
            onToggle={() => toggleDone(uid, task)}
            onSnooze={() => snoozeTask(uid, task, snoozeDue(task.due, today))}
          />
        ))
      )}
      <div className="tasks-end" />
    </Screen>
  )
}


function labelFor(picked: number, t: (ko: string, en: string) => string): string {
  const p = kstYmd(dateFromDayNumber(picked))
  return t(`${p.m + 1}월 ${p.d}일 (${WD_KO[p.day]})`, `${p.m + 1}/${p.d} (${WD_EN[p.day]})`)
}
