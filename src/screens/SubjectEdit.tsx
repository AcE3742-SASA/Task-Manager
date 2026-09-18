import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { LiquidInput } from '../components/LiquidInput'
import { LiquidSurface } from '../components/LiquidSurface'
import { CATEGORY_EN, ICON_CATEGORIES, SUBJECT_ICONS, iconName } from '../components/subject-icons'
import { useT } from '../lib/i18n'
import { useAppSettings } from '../lib/settings'
import type { IconCategory } from '../components/subject-icons'
import type { Lang } from '../lib/i18n'
import {
  COLORS,
  SHORT_MAX,
  createSubject,
  onColor,
  removeSubject,
  saveSubject,
  useSubjects,
} from '../lib/subjects'
import type { Subject } from '../lib/subjects'

export function SubjectEdit({ uid }: { uid: string }) {
  const { id } = useParams()
  const { subjects, loading, error } = useSubjects(uid)
  const t = useT()
  const title = t('과목', 'Subject')

  if (error) return <Notice title={title} body={error} />
  if (id && loading) return <Notice title={title} body={t('불러오는 중…', 'Loading…')} />

  const existing = id ? subjects.find((s) => s.id === id) : undefined
  if (id && !existing)
    return <Notice title={title} body={t('없는 과목이다.', 'No such subject.')} />

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
  const { lang } = useAppSettings()
  const t = useT()
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
    const warn =
      n > 0
        ? t(
            `\n시간표에 배치된 ${n}칸도 함께 사라진다.`,
            `\nThe ${n} timetable slots using it go too.`,
          )
        : ''
    if (
      !confirm(
        t(`"${subject?.name}" 과목을 삭제한다.${warn}`, `Delete "${subject?.name}".${warn}`),
      )
    )
      return
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
      title={subject ? t('과목 편집', 'Edit subject') : t('새 과목', 'New subject')}
      action={
        <button className="act" onClick={() => navigate('/subjects')}>
          {t('취소', 'Cancel')}
        </button>
      }
    >
      <div className="form">
        {err && <div className="hint">{err}</div>}

        <div className="field">
          <span className="lbl">{t('과목 이름', 'Subject name')}</span>
          <LiquidInput
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('일반물리학I', 'General Physics I')}
            autoFocus={!subject}
          />
        </div>

        <div className="field">
          <span className="lbl">
            {t(`줄임말 — 최대 ${SHORT_MAX}글자`, `Short name — ${SHORT_MAX} chars max`)}
          </span>
          <LiquidInput
            className="inp pix"
            value={short}
            maxLength={SHORT_MAX}
            onChange={(e) => setShort(e.target.value.slice(0, SHORT_MAX))}
            placeholder={t('일물', 'PHYS')}
          />
          <span className="limit">
            <span>
              {short.length} / {SHORT_MAX}
            </span>
            <i>
              <b style={{ width: `${(short.length / SHORT_MAX) * 100}%` }} />
            </i>
            <span>{t('시간표에 이 이름으로', 'Shown on the timetable')}</span>
          </span>
        </div>

        <div className="field">
          <span className="lbl">
            {t('아이콘', 'Icon')}
            <span className="counter">{iconName(icon, lang)}</span>
          </span>
          <div className="pickgrid">
            {ICON_CATEGORIES.map((cat) => (
              <Fragmentish key={cat} cat={cat} icon={icon} color={color} onPick={setIcon} lang={lang} />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl">{t('색', 'Color')}</span>
          <div className="swatches">
            {/* aria-label 로 "#c8a96b" 를 그대로 읽어 주던 자리. 순번이 그보다 낫다. */}
            {COLORS.map((c, i) => (
              <button
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={t(`색 ${i + 1}`, `Color ${i + 1}`)}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {/* 프리셋 밖의 색은 브라우저 기본 피커에 맡긴다. 직접 만들 이유가 없다. */}
          <label className="pickcolor">
            <input
              type="color"
              value={color.toLowerCase()}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
            />
            <span className="rl">
              <b>{t('직접 고르기', 'Pick a color')}</b>
              <em>{color.toUpperCase()}</em>
            </span>
            {/* 실제 시간표 칸이 어떻게 보이는지 그대로 보여준다 — 글자색은 자동이다. */}
            <span className="swpreview" style={{ background: color, color: onColor(color) }}>
              {short.trim() || t('줄임', 'ABBR')}
            </span>
          </label>
        </div>

        <button className="bigbtn" disabled={!ready || busy} onClick={submit}>
          {busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}
        </button>

        {subject && (
          <button className="row danger" disabled={busy} onClick={drop}>
            <span className="rl">
              <b>{t('과목 삭제', 'Delete subject')}</b>
              <em>{t('배치된 시간표 칸도 함께 사라진다', 'Its timetable slots go too')}</em>
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
  color,
  onPick,
  lang,
}: {
  cat: IconCategory
  icon: string
  color: string
  onPick: (id: string) => void
  lang: Lang
}) {
  return (
    <>
      <span className="catrow">{lang === 'en' ? CATEGORY_EN[cat] : cat}</span>
      {SUBJECT_ICONS.filter((i) => i.cat === cat).map((i) => (
        <button
          key={i.id}
          className={i.id === icon ? 'on' : ''}
          style={i.id === icon ? { background: color } : undefined}
          title={lang === 'en' ? i.en : i.name}
          aria-label={lang === 'en' ? i.en : i.name}
          aria-pressed={i.id === icon}
          onClick={() => onPick(i.id)}
        >
          {i.id !== icon && <LiquidSurface />}
          <svg viewBox="0 0 24 24" style={i.id === icon ? { stroke: onColor(color) } : undefined}>{i.d}</svg>
        </button>
      ))}
    </>
  )
}
