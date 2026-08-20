import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { Screen } from '../components/Screen'
import { IconArrow, IconSignOut } from '../components/icons'
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
        <div className="row off">
          <span className="rl">
            <b>시간표 설정</b>
            <em>과목을 등록하고 요일×교시에 배치한다</em>
          </span>
          <span className="tag">M2</span>
          <IconArrow />
        </div>

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
