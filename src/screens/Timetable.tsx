import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconCalendar } from '../components/icons'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import {
  DAYS,
  DAY_LABEL,
  DAY_LABEL_EN,
  PERIODS,
  byCell,
  cellKey,
  onColor,
  placeSlot,
  useSubjects,
} from '../lib/subjects'
import type { Day } from '../lib/subjects'
import type { T } from '../lib/i18n'

/** 배치할 과목과, 그 배치에 함께 붙일 교사·강의실. 칸을 누를 때마다 이 값이 그대로 들어간다. */
type Paint = { id: string; teacher: string; room: string }

export function Timetable({ uid }: { uid: string }) {
  const { subjects, loading, error } = useSubjects(uid)
  const [paint, setPaint] = useState<Paint | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const navigate = useNavigate()
  const { lang } = useAppSettings()
  const t = useT()
  const dayLabel = lang === 'en' ? DAY_LABEL_EN : DAY_LABEL

  const cells = byCell(subjects)
  const placed = cells.size

  async function tap(day: Day, period: number) {
    if (!paint) return
    setErr(null)
    try {
      const current = cells.get(cellKey(day, period))
      // 같은 과목을 다시 누르면 지운다 — 오타를 지우려고 지우개를 따로 고르지 않아도 되게.
      const same = current?.subject.id === paint.id
      await placeSlot(uid, subjects, day, period, same ? null : paint)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  if (error) {
    return (
      <Screen title={t('시간표', 'Timetable')}>
        <div className="form">
          <div className="hint">{error}</div>
        </div>
      </Screen>
    )
  }

  if (!loading && subjects.length === 0) {
    return (
      <Screen title={t('시간표', 'Timetable')}>
        <EmptyState
          icon={<IconCalendar />}
          title={t('배치할 과목이 없다', 'Nothing to place yet')}
          body={t(
            '과목을 먼저 등록한다. 연구활동·창의적 체험활동도 과목으로 만들면 된다.',
            'Register subjects first. Research and activity blocks work as subjects too.',
          )}
        />
        <div className="form">
          <Link className="bigbtn" to="/subjects">
            {t('과목 등록하러 가기', 'Go register a subject')}
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      title={t('시간표', 'Timetable')}
      action={
        <button className="act" onClick={() => navigate('/profile')}>
          {t(`${placed}칸`, `${placed} placed`)}
        </button>
      }
    >
      <div className="tt">
        <div className="palette">
          {subjects.map((s) => {
            const on = paint?.id === s.id
            return (
              <button
                key={s.id}
                className={`chip sm${on ? ' on' : ''}`}
                aria-pressed={on}
                style={on ? undefined : { background: s.color, color: onColor(s.color) }}
                onClick={() =>
                  setPaint(
                    on
                      ? null
                      : {
                          id: s.id,
                          // 이미 배치된 칸이 있으면 그 교사·강의실을 이어 쓴다. 대개 그게 맞다.
                          teacher: s.slots?.[0]?.teacher ?? '',
                          room: s.slots?.[0]?.room ?? '',
                        },
                  )
                }
              >
                {s.short}
              </button>
            )
          })}
        </div>

        {paint ? (
          <div className="chips">
            <input
              className="inp grow"
              value={paint.teacher}
              onChange={(e) => setPaint({ ...paint, teacher: e.target.value })}
              placeholder={t('교사', 'Teacher')}
              aria-label={t('교사', 'Teacher')}
            />
            <input
              className="inp grow"
              value={paint.room}
              onChange={(e) => setPaint({ ...paint, room: e.target.value })}
              placeholder={t('강의실', 'Room')}
              aria-label={t('강의실', 'Room')}
            />
          </div>
        ) : (
          <div className="hint">
            {t(
              '과목을 고른 뒤 칸을 누르면 배치된다. 고른 과목은 그대로 남으니 연속 교시는 계속 누르면 된다. 같은 칸을 다시 누르면 지워진다.',
              'Pick a subject, then tap cells to place it. The pick stays selected, so tap straight through consecutive periods. Tap a filled cell again to clear it.',
            )}
          </div>
        )}

        {err && <div className="hint">{err}</div>}

        <div className="grid">
          <span className="hd" />
          {DAYS.map((d) => (
            <span className="hd" key={d}>
              {dayLabel[d]}
            </span>
          ))}

          {PERIODS.map((p) => (
            <Row key={p} period={p} cells={cells} onTap={tap} dayLabel={dayLabel} t={t} />
          ))}
        </div>
      </div>
    </Screen>
  )
}

function Row({
  period,
  cells,
  onTap,
  dayLabel,
  t,
}: {
  period: number
  cells: ReturnType<typeof byCell>
  onTap: (day: Day, period: number) => void
  dayLabel: Record<Day, string>
  t: T
}) {
  return (
    <>
      <span className="pd">{period}</span>
      {DAYS.map((d) => {
        const at = cells.get(cellKey(d, period))
        return (
          <button
            key={d}
            className={`cell${at ? '' : ' free'}`}
            aria-label={t(
              `${dayLabel[d]} ${period}교시 — ${at?.subject.name ?? '빈 칸'}`,
              `${dayLabel[d]} period ${period} — ${at?.subject.name ?? 'empty'}`,
            )}
            style={at ? { background: at.subject.color, color: onColor(at.subject.color) } : undefined}
            onClick={() => onTap(d, period)}
          >
            {at?.subject.short ?? ''}
          </button>
        )
      })}
    </>
  )
}
