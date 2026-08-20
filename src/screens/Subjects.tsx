import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconArrow, IconPlus } from '../components/icons'
import { SubjectIcon } from '../components/subject-icons'
import { useSubjects } from '../lib/subjects'

export function Subjects({ uid }: { uid: string }) {
  const { subjects, loading, error } = useSubjects(uid)
  const navigate = useNavigate()

  const slots = subjects.reduce((n, s) => n + (s.slots?.length ?? 0), 0)

  return (
    <Screen
      title="과목"
      action={
        <button className="act" onClick={() => navigate(-1)}>
          닫기
        </button>
      }
    >
      {error && (
        <div className="form">
          <div className="hint">
            <b>불러오지 못했다</b>
            <br />
            {error}
          </div>
        </div>
      )}

      {!error && loading && <div className="ttlbl">불러오는 중…</div>}

      {!error && !loading && subjects.length === 0 && (
        <EmptyState
          icon={<IconPlus />}
          title="과목이 아직 없다"
          body="과목을 먼저 등록한 뒤 시간표 격자에 배치한다. 연구활동·창의적 체험활동도 과목으로 만든다."
        />
      )}

      <span className="ttlbl">
        과목 {subjects.length} · 배치된 칸 {slots}
      </span>
      <div className="rows">
        {subjects.map((s) => (
          <Link className="row" key={s.id} to={`/subjects/${s.id}`}>
            <SubjectIcon id={s.icon} />
            <span className="rl">
              <b>{s.name}</b>
              <em>
                {s.slots?.length ?? 0}칸
                {s.slots?.[0]?.teacher ? ` · ${s.slots[0].teacher}` : ''}
              </em>
            </span>
            <span className="tag" style={{ background: s.color }}>
              {s.short}
            </span>
            <IconArrow />
          </Link>
        ))}

        <Link className="row" to="/subjects/new">
          <IconPlus />
          <span className="rl">
            <b>새 과목</b>
            <em>이름 · 줄임말 · 아이콘 · 색</em>
          </span>
          <IconArrow />
        </Link>
      </div>
    </Screen>
  )
}
