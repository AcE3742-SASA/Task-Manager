import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ICON_CATEGORIES, SUBJECT_ICONS } from '../components/subject-icons'
import {
  COLORS,
  SHORT_MAX,
  createSubject,
  removeSubject,
  saveSubject,
  useSubjects,
} from '../lib/subjects'
import type { Subject } from '../lib/subjects'

export function SubjectEdit({ uid }: { uid: string }) {
  const { id } = useParams()
  const { subjects, loading, error } = useSubjects(uid)

  if (error) return <Notice title="과목" body={error} />
  if (id && loading) return <Notice title="과목" body="불러오는 중…" />

  const existing = id ? subjects.find((s) => s.id === id) : undefined
  if (id && !existing) return <Notice title="과목" body="없는 과목이다." />

  // key 로 과목이 바뀔 때 폼 상태를 통째로 새로 만든다 — 초기값 동기화 코드를 안 짜는 방법.
  return <Form uid={uid} subject={existing} key={existing?.id ?? 'new'} />
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Screen title={title}>
      <div className="form">
        <div className="hint">{body}</div>
      </div>
    </Screen>
  )
}

function Form({ uid, subject }: { uid: string; subject?: Subject }) {
  const navigate = useNavigate()
  const [name, setName] = useState(subject?.name ?? '')
  const [short, setShort] = useState(subject?.short ?? '')
  const [icon, setIcon] = useState(subject?.icon ?? SUBJECT_ICONS[0].id)
  const [color, setColor] = useState(subject?.color ?? COLORS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ready = name.trim().length > 0 && short.trim().length > 0

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const input = { name, short, icon, color, slots: subject?.slots ?? [] }
      if (subject) await saveSubject(uid, subject.id, input)
      else await createSubject(uid, input)
      navigate('/subjects')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function drop() {
    const n = subject?.slots?.length ?? 0
    const warn = n > 0 ? `\n시간표에 배치된 ${n}칸도 함께 사라진다.` : ''
    if (!confirm(`"${subject?.name}" 과목을 삭제한다.${warn}`)) return
    setBusy(true)
    try {
      await removeSubject(uid, subject!.id)
      navigate('/subjects')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen
      title={subject ? '과목 편집' : '새 과목'}
      action={
        <button className="act" onClick={() => navigate('/subjects')}>
          취소
        </button>
      }
    >
      <div className="form">
        {err && <div className="hint">{err}</div>}

        <div className="field">
          <span className="lbl">과목 이름</span>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="일반물리학I"
            autoFocus={!subject}
          />
        </div>

        <div className="field">
          <span className="lbl">줄임말 — 최대 {SHORT_MAX}글자</span>
          <input
            className="inp pix"
            value={short}
            maxLength={SHORT_MAX}
            onChange={(e) => setShort(e.target.value.slice(0, SHORT_MAX))}
            placeholder="일물"
          />
          <span className="limit">
            <span>
              {short.length} / {SHORT_MAX}
            </span>
            <i>
              <b style={{ width: `${(short.length / SHORT_MAX) * 100}%` }} />
            </i>
            <span>시간표에 이 이름으로</span>
          </span>
        </div>

        <div className="field">
          <span className="lbl">
            아이콘
            <span className="counter">
              {SUBJECT_ICONS.find((i) => i.id === icon)?.name ?? '—'}
            </span>
          </span>
          <div className="pickgrid">
            {ICON_CATEGORIES.map((cat) => (
              <Fragmentish key={cat} cat={cat} icon={icon} onPick={setIcon} />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl">색</span>
          <div className="swatches">
            {/* aria-label 로 "#c8a96b" 를 그대로 읽어 주던 자리. 순번이 그보다 낫다. */}
            {COLORS.map((c, i) => (
              <button
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={`색 ${i + 1}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <button className="bigbtn" disabled={!ready || busy} onClick={submit}>
          {busy ? '저장 중…' : '저장'}
        </button>

        {subject && (
          <button className="row danger" disabled={busy} onClick={drop}>
            <span className="rl">
              <b>과목 삭제</b>
              <em>배치된 시간표 칸도 함께 사라진다</em>
            </span>
          </button>
        )}
      </div>
    </Screen>
  )
}

/** 카테고리 헤더 + 그 축의 아이콘들. pickgrid 의 자식으로 평평하게 들어가야 해서 조각으로 뺐다. */
function Fragmentish({
  cat,
  icon,
  onPick,
}: {
  cat: string
  icon: string
  onPick: (id: string) => void
}) {
  return (
    <>
      <span className="catrow">{cat}</span>
      {SUBJECT_ICONS.filter((i) => i.cat === cat).map((i) => (
        <button
          key={i.id}
          className={i.id === icon ? 'on' : ''}
          title={i.name}
          aria-label={i.name}
          aria-pressed={i.id === icon}
          onClick={() => onPick(i.id)}
        >
          <svg viewBox="0 0 24 24">{i.d}</svg>
        </button>
      ))}
    </>
  )
}
