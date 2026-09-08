import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from './Screen'
import { SubjectIcon } from './subject-icons'
import { classDayOf, fromLocalInput, kstLabel, nextDue, REPEATS, toLocalInput, todayEnd } from '../lib/due'
import type { Repeat } from '../lib/due'
import { createTask, removeTask, saveTask, KINDS, KIND_EN } from '../lib/tasks'
import type { Kind, Task } from '../lib/tasks'
import type { Subject } from '../lib/subjects'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'

const Clock = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6l3.5 2" />
  </svg>
)

type Props = { uid: string; subjects: Subject[]; task?: Task; initialDue?: Date }

const REPEAT_LABELS: Record<Repeat, { ko: string; en: string }> = {
  none: { ko: '안 함', en: 'Never' },
  daily: { ko: '매일', en: 'Daily' },
  weekly: { ko: '매주', en: 'Weekly' },
  monthly: { ko: '매월', en: 'Monthly' },
}

export function TaskForm({ uid, subjects, task, initialDue }: Props) {
  const navigate = useNavigate()
  const editing = !!task
  const { weekStartsOn, lang } = useAppSettings()
  const t = useT()

  const [title, setTitle] = useState(task?.title ?? '')
  const [subjectId, setSubjectId] = useState<string | null>(task?.subjectId ?? null)
  const [kind, setKind] = useState<Kind>(task?.kind ?? '과제')
  const [note, setNote] = useState(task?.note ?? '')
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? 'none')
  const [due, setDue] = useState<Date>(task?.due ?? initialDue ?? todayEnd(new Date()))
  /** 기한을 아예 잡지 않는 할일인가. 수정 화면에서는 저장된 값(null이면 켜짐)을 따른다. */
  const [noDue, setNoDue] = useState(editing ? task?.due == null : false)
  /** 사용자가 기한을 직접 건드렸는가. 수정 화면에서는 자동 계산 자체를 하지 않는다. */
  const [dueTouched, setDueTouched] = useState(editing || !!initialDue)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enteredAt = useRef(Date.now())
  const subject = subjects.find((s) => s.id === subjectId)

  // 과목을 고르면 그 자리에서 기한이 다시 계산된다. 사용자가 손댄 뒤에는 덮지 않는다.
  useEffect(() => {
    if (dueTouched) return
    setDue(subject ? nextDue(subject.slots ?? [], new Date(), weekStartsOn) : todayEnd(new Date()))
  }, [subjectId, dueTouched, subject, weekStartsOn])

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const input = { title, subjectId, note, due: noDue ? null : due, kind, repeat }
      if (task) await saveTask(uid, task.id, input)
      else
        await createTask(uid, input, {
          dueWasDefault: !noDue && !dueTouched && !!subject,
          entryMs: Date.now() - enteredAt.current,
        })
      navigate('/')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function drop() {
    if (
      !confirm(
        t(`"${task?.title}" 을(를) 삭제한다.`, `Delete "${task?.title}". This cannot be undone.`),
      )
    )
      return
    setBusy(true)
    try {
      await removeTask(uid, task!.id)
      navigate('/')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen
      title={editing ? t('할 일 수정', 'Edit task') : t('새 할 일', 'New task')}
      action={
        <button className="act" onClick={() => navigate(-1)}>
          {t('취소', 'Cancel')}
        </button>
      }
    >
      <div className="form">
        {err && <div className="hint">{err}</div>}

        <div className="field">
          <span className="lbl">{t('제목', 'TITLE')}</span>
          <input
            className="inp"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('3장 연습문제 풀어오기', 'Ch. 3 practice problems')}
            autoFocus={!editing}
          />
        </div>

        <div className="field">
          <span className="lbl">{t('과목', 'SUBJECT')}</span>
          <div className="chips">
            {subjects.map((s) => (
              <button
                key={s.id}
                className={`chip${s.id === subjectId ? ' on' : ''}`}
                aria-pressed={s.id === subjectId}
                onClick={() => setSubjectId(s.id === subjectId ? null : s.id)}
              >
                <SubjectIcon id={s.icon} />
                {s.name}
              </button>
            ))}
            {subjects.length === 0 && (
              <span className="hint">
                {t(
                  '과목을 먼저 등록하면 기한이 자동으로 채워진다.',
                  'Register a subject first and the due date fills itself in.',
                )}
              </span>
            )}
          </div>
        </div>

        {!editing && !noDue && (
          <div className="autonote">
            <Clock />
            <span>
              <b>{t('자동 계산된 기한', 'AUTO-FILLED DUE DATE')}</b>
              <br />
              {dueTouched ? (
                t('직접 정한 기한을 쓴다.', 'Using the date you set.')
              ) : subject && subject.slots?.length ? (
                lang === 'en' ? (
                  <>
                    Next {subject.name} class is <b>{kstLabel(classDayOf(due), lang)}</b>, so this is
                    due the evening before — <b>{kstLabel(due, lang)} 23:59</b>. Change it below.
                  </>
                ) : (
                  <>
                    {subject.name} 다음 주 첫 수업은 <b>{kstLabel(classDayOf(due), lang)}</b>. 기한은
                    그 전날 <b>{kstLabel(due, lang)} 23:59</b>. 아래에서 바꿀 수 있음.
                  </>
                )
              ) : subject ? (
                t(
                  '시간표에 배치된 수업이 없어 일주일 뒤로 잡았다. 아래에서 바꿀 수 있음.',
                  'No classes are placed on the timetable, so this is set a week out. Change it below.',
                )
              ) : (
                t(
                  '과목을 고르면 다음 주 첫 수업 전날로 기한이 자동으로 채워진다.',
                  'Pick a subject and the due date fills in as the day before its next class.',
                )
              )}
            </span>
          </div>
        )}

        <div className="field">
          <span className="lbl">{t('기한', 'DUE')}</span>
          <div className="chips">
            <button
              className={`chip sm${noDue ? ' on' : ''}`}
              aria-pressed={noDue}
              onClick={() => setNoDue((v) => !v)}
            >
              {t('기한 없음', 'No due date')}
            </button>
          </div>
          {!noDue && (
            <input
              className="inp pix"
              type="datetime-local"
              value={toLocalInput(due)}
              onChange={(e) => {
                const d = fromLocalInput(e.target.value)
                if (!d) return
                setDue(d)
                setDueTouched(true)
              }}
            />
          )}
        </div>

        {/* 반복은 기한이 있어야 다음 회차를 계산할 수 있다. "기한 없음"이면 숨긴다. */}
        {!noDue && (
          <div className="field">
            <span className="lbl">{t('반복', 'REPEAT')}</span>
            <div className="chips">
              {REPEATS.map((r) => (
                <button
                  key={r}
                  className={`chip sm${r === repeat ? ' on' : ''}`}
                  aria-pressed={r === repeat}
                  onClick={() => setRepeat(r)}
                >
                  {lang === 'en' ? REPEAT_LABELS[r].en : REPEAT_LABELS[r].ko}
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <div className="limit">
                {t(
                  '완료할 때마다 다음 회차가 자동으로 생긴다.',
                  'Completing it spawns the next occurrence automatically.',
                )}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <span className="lbl">{t('과제 종류 — 표시 전용', 'KIND — LABEL ONLY')}</span>
          <div className="chips">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`chip sm${k === kind ? ' on' : ''}`}
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
              >
                {lang === 'en' ? (KIND_EN[k] ?? k) : k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl">{t('내용 — 선택', 'NOTE — OPTIONAL')}</span>
          <textarea
            className="inp ta"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              '교재 3장 1~12번. 손으로 풀고 사진 찍어 제출.',
              'Textbook ch.3 #1-12. Work by hand, photograph, submit.',
            )}
          />
        </div>

        <button className="bigbtn" disabled={!title.trim() || busy} onClick={submit}>
          {busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}
        </button>

        {editing && (
          <button className="row danger" disabled={busy} onClick={drop}>
            <span className="rl">
              <b>{t('할 일 삭제', 'Delete task')}</b>
              <em>{t('되돌릴 수 없다', 'Cannot be undone')}</em>
            </span>
          </button>
        )}
      </div>
    </Screen>
  )
}
