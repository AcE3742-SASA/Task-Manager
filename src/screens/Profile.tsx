import { useState } from 'react'
import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { Screen } from '../components/Screen'
import { Link } from 'react-router-dom'
import { IconArrow, IconCalendar, IconList, IconSignOut } from '../components/icons'
import { SubjectIcon } from '../components/subject-icons'
import { auth } from '../lib/firebase'
import { useT } from '../lib/i18n'
import { NeedsFreshLogin, deleteAccount, wipeSemester } from '../lib/wipe'

export function Profile({ user }: { user: User }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const name = user.displayName ?? t('이름 없음', 'No name')

  async function reset() {
    if (!confirm(t(
      '새 학기를 시작한다. 시간표와 할 일이 모두 사라지고 되돌릴 수 없다.',
      'Start a new semester. The timetable and all tasks are erased permanently.',
    ))) return
    setBusy(true)
    setMsg(null)
    try {
      const n = await wipeSemester(user.uid)
      setMsg(t(`비웠다 — 과목 ${n.subjects}개, 할 일 ${n.tasks}건.`, `Cleared ${n.subjects} subjects and ${n.tasks} tasks.`))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function drop() {
    if (!confirm(t(
      '계정과 모든 데이터를 삭제한다. 되돌릴 수 없다.',
      'Delete the account and all data. This cannot be undone.',
    ))) return
    setBusy(true)
    setMsg(null)
    try {
      await deleteAccount(user)
    } catch (e) {
      setMsg(
        e instanceof NeedsFreshLogin
          ? t(
              '데이터는 지웠지만 계정은 남았다. 보안상 오래된 로그인으로는 계정을 지울 수 없다 — 로그아웃하고 다시 로그인한 뒤 한 번 더 눌러라.',
              'Data is gone but the account remains. Firebase refuses account deletion on an old session — sign out, sign back in, and tap again.',
            )
          : e instanceof Error
            ? e.message
            : String(e),
      )
      setBusy(false)
    }
  }

  return (
    <Screen title={t('프로필', 'Profile')}>
      <div className="acct">
        <span className="av">
          {user.photoURL ? <img src={user.photoURL} alt="" /> : name.slice(0, 1)}
        </span>
        <span className="who">
          <b>{name}</b>
          <em>{user.email ?? ''}</em>
        </span>
      </div>

      <span className="ttlbl">{t('시간표', 'TIMETABLE')}</span>
      <div className="rows">
        <Link className="row" to="/timetable">
          <IconCalendar />
          <span className="rl">
            <b>{t('시간표', 'Timetable')}</b>
            <em>{t('요일×교시 격자에 과목을 배치한다', 'Place subjects on the day × period grid')}</em>
          </span>
          <IconArrow />
        </Link>

        <Link className="row" to="/subjects">
          <IconList />
          <span className="rl">
            <b>{t('과목', 'Subjects')}</b>
            <em>{t('이름 · 줄임말 · 아이콘 · 색', 'Name · short name · icon · color')}</em>
          </span>
          <IconArrow />
        </Link>

        <button className="row" onClick={reset} disabled={busy}>
          <SubjectIcon id="flag" />
          <span className="rl">
            <b>{t('새 학기 시작', 'Start a new semester')}</b>
            <em>{t('시간표와 할 일을 모두 비운다', 'Clears the timetable and every task')}</em>
          </span>
        </button>

        <button className="row danger" onClick={() => auth && signOut(auth)}>
          <span className="rl">
            <b>{t('로그아웃', 'Sign out')}</b>
            <em>{t('이 기기에서 계정 연결을 끊는다', 'Disconnect this device')}</em>
          </span>
          <IconSignOut />
        </button>

        <button className="row danger" onClick={drop} disabled={busy}>
          <span className="rl">
            <b>{t('계정 삭제', 'Delete account')}</b>
            <em>{t('되돌릴 수 없다', 'This cannot be undone')}</em>
          </span>
        </button>
      </div>

      {msg && (
        <div className="form">
          <div className="hint">{msg}</div>
        </div>
      )}
    </Screen>
  )
}
