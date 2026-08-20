import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from './Screen'
import { SubjectIcon } from './subject-icons'
import { classDayOf, fromLocalInput, kstLabel, nextDue, toLocalInput, todayEnd } from '../lib/due'
import { createTask, removeTask, saveTask, KINDS } from '../lib/tasks'
import type { Kind, Task } from '../lib/tasks'
import type { Subject } from '../lib/subjects'

const Clock = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6l3.5 2" />
  </svg>
)

type Props = { uid: string; subjects: Subject[]; task?: Task }

export function TaskForm({ uid, subjects, task }: Props) {
  const navigate = useNavigate()
  const editing = !!task

  const [title, setTitle] = useState(task?.title ?? '')
  const [subjectId, setSubjectId] = useState<string | null>(task?.subjectId ?? null)
  const [kind, setKind] = useState<Kind>(task?.kind ?? '과제')
  const [note, setNote] = useState(task?.note ?? '')
  const [due, setDue] = useState<Date>(task?.due ?? todayEnd(new Date()))
  /** 사용자가 기한을 직접 건드렸는가. 수정 화면에서는 자동 계산 자체를 하지 않는다. */
  const [dueTouched, setDueTouched] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enteredAt = useRef(Date.now())
  const subject = subjects.find((s) => s.id === subjectId)

  // 과목을 고르면 그 자리에서 기한이 다시 계산된다. 사용자가 손댄 뒤에는 덮지 않는다.
  useEffect(() => {
    if (dueTouched) return
    setDue(subject ? nextDue(subject.slots ?? [], new Date()) : todayEnd(new Date()))
  }, [subjectId, dueTouched, subject])

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const input = { title, subjectId, note, due, kind }
      if (task) await saveTask(uid, task.id, input)
      else
        await createTask(uid, input, {
          dueWasDefault: !dueTouched && !!subject,
          entryMs: Date.now() - enteredAt.current,
        })
      navigate('/')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function drop() {
    if (!confirm(`"${task?.title}" 을(를) 삭제한다.`)) return
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
      title={editing ? '할 일 수정' : '새 할 일'}
      action={
        <button className="act" onClick={() => navigate(-1)}>
          취소
        </button>
      }
    >
      <div className="form">
        {err && <div className="hint">{err}</div>}

        <div className="field">
          <span className="lbl">제목</span>
          <input
            className="inp"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="3장 연습문제 풀어오기"
            autoFocus={!editing}
          />
        </div>

        <div className="field">
          <span className="lbl">과목</span>
          <div className="chips">
            {subjects.map((s) => (
              <button
                key={s.id}
                className={`chip${s.id === subjectId ? ' on' : ''}`}
                onClick={() => setSubjectId(s.id === subjectId ? null : s.id)}
              >
                <SubjectIcon id={s.icon} />
                {s.name}
              </button>
            ))}
            {subjects.length === 0 && <span className="hint">과목을 먼저 등록하면 기한이 자동으로 채워진다.</span>}
          </div>
        </div>

        {!editing && (
          <div className="autonote">
            <Clock />
            <span>
              <b>자동 계산된 기한</b>
              <br />
              {dueTouched ? (
                '직접 정한 기한을 쓴다.'
              ) : subject && subject.slots?.length ? (
                <>
                  {subject.name} 다음 주 첫 수업은 <b>{kstLabel(classDayOf(due))}</b>. 기한은 그 전날{' '}
                  <b>{kstLabel(due)} 23:59</b>. 아래에서 바꿀 수 있음.
                </>
              ) : subject ? (
                <>시간표에 배치된 수업이 없어 일주일 뒤로 잡았다. 아래에서 바꿀 수 있음.</>
              ) : (
                <>과목을 고르면 다음 주 첫 수업 전날로 기한이 자동으로 채워진다.</>
              )}
            </span>
          </div>
        )}

        <div className="field">
          <span className="lbl">기한</span>
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
        </div>

        <div className="field">
          <span className="lbl">과제 종류 — 표시 전용</span>
          <div className="chips">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`chip sm${k === kind ? ' on' : ''}`}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl">내용 — 선택</span>
          <textarea
            className="inp ta"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="교재 3장 1~12번. 손으로 풀고 사진 찍어 제출."
          />
        </div>

        <button className="bigbtn" disabled={!title.trim() || busy} onClick={submit}>
          {busy ? '저장 중…' : '저장'}
        </button>

        {editing && (
          <button className="row danger" disabled={busy} onClick={drop}>
            <span className="rl">
              <b>할 일 삭제</b>
              <em>되돌릴 수 없다</em>
            </span>
          </button>
        )}
      </div>
    </Screen>
  )
}
