import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from './Screen'
import { SubjectBadge } from './SubjectBadge'
import { LiquidSurface } from './LiquidSurface'
import { LiquidInput, LiquidTextarea } from './LiquidInput'
import { classDayOf, fromLocalInput, kstLabel, nextDue, REPEATS, toLocalInput, todayEnd } from '../lib/due'
import type { Repeat } from '../lib/due'
import { createTask, removeTask, saveTask, TaskConflictError, KINDS, KIND_EN } from '../lib/tasks'
import type { Kind, Task, TaskInput } from '../lib/tasks'
import type { Subject } from '../lib/subjects'
import { useT } from '../lib/i18n'
import { clearTaskDraftIfUnchanged, readTaskDraft, writeTaskDraft } from '../lib/taskDraft'
import type { TaskDraft } from '../lib/taskDraft'
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

  const draftKey = `task-draft:${uid}:${initialDue?.toISOString() ?? 'new'}`
  const [draft] = useState(() => task ? null : readTaskDraft(draftKey))
  const createId = useRef(draft?.id ?? crypto.randomUUID())
  const baseline = useRef<TaskInput | null>(task ?? null)
  const mounted = useRef(true)
  const lock = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [title, setTitle] = useState(task?.title ?? draft?.title ?? '')
  const [subjectId, setSubjectId] = useState<string | null>(task?.subjectId ?? draft?.subjectId ?? null)
  const [kind, setKind] = useState<Kind>(task?.kind ?? draft?.kind ?? '과제')
  const [note, setNote] = useState(task?.note ?? draft?.note ?? '')
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? draft?.repeat ?? 'none')
  const [due, setDue] = useState<Date>(task?.due ?? (draft ? new Date(draft.due) : undefined) ?? initialDue ?? todayEnd(new Date()))
  /** 기한을 아예 잡지 않는 할일인가. 수정 화면에서는 저장된 값(null이면 켜짐)을 따른다. */
  const [noDue, setNoDue] = useState(editing ? task?.due == null : draft?.noDue ?? false)
  /** 사용자가 기한을 직접 건드렸는가. 수정 화면에서는 자동 계산 자체를 하지 않는다. */
  const [dueTouched, setDueTouched] = useState(draft?.dueTouched ?? (editing || !!initialDue))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conflict, setConflict] = useState<TaskConflictError | null>(null)

  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (editing) return
    writeTaskDraft(draftKey, { id: createId.current, title, subjectId, kind, note, repeat, due: due.toISOString(), noDue, dueTouched })
  }, [draftKey, editing, title, subjectId, kind, note, repeat, due, noDue, dueTouched])
  useEffect(() => {
    setSlow(false)
    if (!busy) return
    const timer = window.setTimeout(() => setSlow(true), 1500)
    return () => clearTimeout(timer)
  }, [busy])
  const enteredAt = useRef(Date.now())
  const subject = subjects.find((s) => s.id === subjectId)

  // 과목을 고르면 그 자리에서 기한이 다시 계산된다. 사용자가 손댄 뒤에는 덮지 않는다.
  useEffect(() => {
    if (dueTouched || busy) return
    setDue(subject ? nextDue(subject.slots ?? [], new Date(), weekStartsOn) : todayEnd(new Date()))
  }, [subjectId, dueTouched, subject, weekStartsOn, busy])

  async function submit(asNew = false) {
    if (lock.current || !title.trim()) return
    lock.current = true
    setBusy(true)
    setErr(null)
    setConflict(null)
    if (asNew) createId.current = crypto.randomUUID()
    const submitted: TaskDraft = { id: createId.current, title, subjectId, kind, note, repeat,
      due: due.toISOString(), noDue, dueTouched }
    if (!task) writeTaskDraft(draftKey, submitted)
    try {
      const input = { title, subjectId, note, due: noDue ? null : due, kind, repeat }
      if (task) await saveTask(uid, task.id, input, baseline.current!)
      else
        await createTask(uid, input, {
          dueWasDefault: !noDue && !dueTouched && !!subject,
          entryMs: Date.now() - enteredAt.current,
        }, submitted.id)
      if (!task) clearTaskDraftIfUnchanged(draftKey, submitted)
      if (mounted.current) navigate('/')
    } catch (error) {
      if (mounted.current) {
        if (error instanceof TaskConflictError) {
          setConflict(error)
          setErr(error.code === 'task/already-exists'
            ? t('이 초안은 이미 저장됐고 내용이 달라졌어요. 입력은 보관했어요. 기존 할 일을 확인하거나 새 할 일로 저장해 주세요.', 'This draft is already saved with different content. Your input is kept. Open the existing task or save a new one.')
            : error.code === 'task/changed'
              ? t('다른 곳에서 이 할 일을 수정했어요. 입력한 내용은 그대로 남아 있어요. 최신 내용을 확인해 주세요.', 'This task changed elsewhere. Your input is still here. Check the latest version.')
              : t('이 할 일을 찾을 수 없어요. 이미 삭제됐을 수 있어요.', 'This task no longer exists. It may have been deleted.'))
        } else setErr(t('저장하지 못했어요. 입력한 내용은 남아 있어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not save. Your input is still here. Check your connection and try again.'))
        setBusy(false)
      }
    } finally {
      lock.current = false
    }
  }

  function reloadLatest() {
    if (!task || !confirm(t('입력 중인 변경을 버리고 최신 내용을 불러올까요?', 'Discard your unsaved edits and load the latest version?'))) return
    baseline.current = task
    setTitle(task.title); setSubjectId(task.subjectId); setKind(task.kind); setNote(task.note)
    setRepeat(task.repeat); setDue(task.due ?? todayEnd(new Date())); setNoDue(task.due === null)
    setDueTouched(true); setErr(null); setConflict(null)
  }

  async function drop() {
    if (lock.current || !task || !confirm(
      t(`‘${task.title}’ 할 일을 삭제할까요? 삭제하면 되돌릴 수 없어요.`, `Delete "${task.title}". This cannot be undone.`),
    )) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      await removeTask(uid, task.id)
      if (mounted.current) navigate('/')
    } catch {
      if (mounted.current) {
        setErr(t('삭제하지 못했어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not delete. Check your connection and try again.'))
        setBusy(false)
      }
    } finally { lock.current = false }
  }

  return (
    <Screen
      title={editing ? t('할 일 수정', 'Edit task') : t('새 할 일', 'New task')}
      action={
        <button className="act" disabled={busy} onClick={() => navigate(-1)}>
          {t('취소', 'Cancel')}
        </button>
      }
    >
      <div className="form">
        {err && <div className="hint" role="alert">{err}</div>}
        {conflict?.code === 'task/already-exists' && <div className="chips">
          <button className="chip" disabled={busy} onClick={() => navigate(`/task/${conflict.taskId}`)}>{t('기존 할 일 보기', 'Open existing task')}</button>
          <button className="chip" disabled={busy} onClick={() => void submit(true)}>{t('새 할 일로 저장', 'Save as a new task')}</button>
        </div>}
        {conflict?.code === 'task/changed' && <button className="chip" disabled={busy} onClick={reloadLatest}>{t('최신 내용 불러오기', 'Load latest version')}</button>}
        {draft?.title && <p className="hint">{t('이어서 작성할 수 있도록 입력한 내용을 불러왔어요.', 'Your unfinished task has been restored.')}</p>}
        {slow && <p className="hint" role="status">{t('서버의 응답을 기다리고 있어요. 저장 결과가 나올 때까지 잠시 기다려 주세요.', 'Waiting for the server. Please wait for the save result.')}</p>}
        <fieldset className="form-fields" disabled={busy}>

        <div className="field">
          <label htmlFor="task-title" className="lbl">{t('제목', 'TITLE')}</label>
          <LiquidInput
            id="task-title" className="inp"
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
                {s.id !== subjectId && <LiquidSurface />}
                <SubjectBadge icon={s.icon} color={s.color} />
                {s.name}
              </button>
            ))}
            {subjects.length === 0 && (
              <span className="hint">
                {t(
                  '과목 없이도 저장할 수 있어요. 과목과 시간표를 등록하면 기한을 자동으로 채워드려요.',
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
              <b>{t('기한 안내', 'AUTO-FILLED DUE DATE')}</b>
              <br />
              {dueTouched ? (
                t('직접 정한 기한을 사용해요.', 'Using the date you set.')
              ) : subject && subject.slots?.length ? (
                lang === 'en' ? (
                  <>
                    Next {subject.name} class is <b>{kstLabel(classDayOf(due), lang)}</b>, so this is
                    due the evening before — <b>{kstLabel(due, lang)} 23:59</b>. Change it below.
                  </>
                ) : (
                  <>
                    {subject.name} 다음 주 첫 수업은 <b>{kstLabel(classDayOf(due), lang)}</b>이에요.
                    기한은 전날인 <b>{kstLabel(due, lang)} 23:59</b>로 정했어요. 아래에서 바꿀 수 있어요.
                  </>
                )
              ) : subject ? (
                t(
                  '등록된 수업 시간이 없어 일주일 뒤로 정했어요. 아래에서 바꿀 수 있어요.',
                  'No classes are placed on the timetable, so this is set a week out. Change it below.',
                )
              ) : (
                t(
                  '과목을 고르면 다음 주 첫 수업 전날로 기한을 채워드려요.',
                  'Pick a subject and the due date fills in as the day before its next class.',
                )
              )}
            </span>
          </div>
        )}

        <div className="field">
          <label htmlFor="task-due" className="lbl">{t('기한 (한국 시간)', 'DUE (KST)')}</label>
          <div className="chips">
            <button
              className={`chip sm${noDue ? ' on' : ''}`}
              aria-pressed={noDue}
              onClick={() => setNoDue((v) => !v)}
            >
              {!noDue && <LiquidSurface />}
              {t('기한 없음', 'No due date')}
            </button>
          </div>
          {!noDue && (
            <LiquidInput
              className="inp pix"
              id="task-due" type="datetime-local"
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
                  {r !== repeat && <LiquidSurface />}
                  {lang === 'en' ? REPEAT_LABELS[r].en : REPEAT_LABELS[r].ko}
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <div className="limit">
                {t(
                  '완료하면 다음 할 일이 자동으로 추가돼요.',
                  'Completing it spawns the next occurrence automatically.',
                )}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <span className="lbl">{t('종류', 'KIND — LABEL ONLY')}</span>
          <div className="chips">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`chip sm${k === kind ? ' on' : ''}`}
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
              >
                {k !== kind && <LiquidSurface />}
                {lang === 'en' ? (KIND_EN[k] ?? k) : k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-note" className="lbl">{t('메모 (선택)', 'NOTE — OPTIONAL')}</label>
          <LiquidTextarea
            id="task-note" className="inp ta"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              '교재 3장 1~12번. 손으로 풀고 사진 찍어 제출.',
              'Textbook ch.3 #1-12. Work by hand, photograph, submit.',
            )}
          />
        </div>

        </fieldset>
        <button className="bigbtn" aria-busy={busy} disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}
        </button>

        {editing && (
          <button className="row danger" disabled={busy} onClick={drop}>
            <span className="rl">
              <b>{t('할 일 삭제', 'Delete task')}</b>
              <em>{t('삭제하면 되돌릴 수 없어요', 'Cannot be undone')}</em>
            </span>
          </button>
        )}
      </div>
    </Screen>
  )
}
