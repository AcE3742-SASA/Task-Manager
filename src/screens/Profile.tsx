import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { Screen } from '../components/Screen'
import { Link } from 'react-router-dom'
import { IconArrow, IconCalendar, IconList, IconSignOut } from '../components/icons'
import { auth } from '../lib/firebase'

export function Profile({ user }: { user: User }) {
  const name = user.displayName ?? '이름 없음'

  return (
    <Screen title="프로필">
      <div className="acct">
        <span className="av">
          {user.photoURL ? <img src={user.photoURL} alt="" /> : name.slice(0, 1)}
        </span>
        <span className="who">
          <b>{name}</b>
          <em>{user.email ?? ''}</em>
        </span>
      </div>

      <span className="ttlbl">시간표</span>
      <div className="rows">
        <Link className="row" to="/timetable">
          <IconCalendar />
          <span className="rl">
            <b>시간표</b>
            <em>요일×교시 격자에 과목을 배치한다</em>
          </span>
          <IconArrow />
        </Link>

        <Link className="row" to="/subjects">
          <IconList />
          <span className="rl">
            <b>과목</b>
            <em>이름 · 줄임말 · 아이콘 · 색</em>
          </span>
          <IconArrow />
        </Link>

        <button className="row danger" onClick={() => auth && signOut(auth)}>
          <span className="rl">
            <b>로그아웃</b>
            <em>이 기기에서 계정 연결을 끊는다</em>
          </span>
          <IconSignOut />
        </button>
      </div>
    </Screen>
  )
}
