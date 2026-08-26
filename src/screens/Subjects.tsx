import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconArrow, IconPlus } from '../components/icons'
import { SubjectIcon } from '../components/subject-icons'
import { useT } from '../lib/i18n'
import { useSubjects } from '../lib/subjects'

export function Subjects({ uid }: { uid: string }) {
  const { subjects, loading, error } = useSubjects(uid)
  const navigate = useNavigate()
  const t = useT()

  const slots = subjects.reduce((n, s) => n + (s.slots?.length ?? 0), 0)

  const addRow = (
    <Link className="row" to="/subjects/new">
      <IconPlus />
      <span className="rl">
        <b>{t('새 과목', 'New subject')}</b>
        <em>{t('이름 · 줄임말 · 아이콘 · 색', 'Name · short name · icon · color')}</em>
      </span>
      <IconArrow />
    </Link>
  )

  return (
    <Screen
      title={t('과목', 'Subjects')}
      action={
        <button className="act" onClick={() => navigate(-1)}>
          {t('닫기', 'Close')}
        </button>
      }
    >
      {error && (
        <div className="form">
          <div className="hint">
            <b>{t('불러오지 못했다', 'Could not load')}</b>
            <br />
            {error}
          </div>
        </div>
      )}

      {!error && loading && <div className="ttlbl">{t('불러오는 중…', 'Loading…')}</div>}

      {subjects.length > 0 && (
        <span className="ttlbl">
          {t(
            `과목 ${subjects.length} · 배치된 칸 ${slots}`,
            `${subjects.length} subjects · ${slots} placed`,
          )}
        </span>
      )}

      {/* 추가 버튼이 맨 위다. 과목이 하나도 없을 때 안내문이 화면을 다 채우는 바람에
          첫 과목을 만들려고 스크롤부터 해야 하는 일이 없게. */}
      <div className="rows">
        {addRow}

        {subjects.map((s) => (
          <Link className="row" key={s.id} to={`/subjects/${s.id}`}>
            <SubjectIcon id={s.icon} />
            <span className="rl">
              <b>{s.name}</b>
              <em>
                {t(`${s.slots?.length ?? 0}칸`, `${s.slots?.length ?? 0} slots`)}
                {s.slots?.[0]?.teacher ? ` · ${s.slots[0].teacher}` : ''}
              </em>
            </span>
            <span className="tag" style={{ background: s.color }}>
              {s.short}
            </span>
            <IconArrow />
          </Link>
        ))}
      </div>

      {!error && !loading && subjects.length === 0 && (
        <EmptyState
          icon={<IconPlus />}
          title={t('과목이 아직 없다', 'No subjects yet')}
          body={t(
            '과목을 먼저 등록한 뒤 시간표 격자에 배치한다. 연구활동·창의적 체험활동도 과목으로 만든다.',
            'Register subjects first, then place them on the timetable grid. Research and activity blocks count as subjects too.',
          )}
        />
      )}
    </Screen>
  )
}
