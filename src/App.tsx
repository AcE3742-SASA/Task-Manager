import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { applyAppearance, readAppearance } from './lib/appearance'
import { BottomNav } from './components/BottomNav'
import { FocusDock } from './components/FocusDock'
import { SettingsContext, useSettings } from './lib/settings'
import { useAuth } from './lib/useAuth'
import { Calendar } from './screens/Calendar'
import { List } from './screens/List'
import { New } from './screens/New'
import { Profile } from './screens/Profile'
import { Settings } from './screens/Settings'
import { SignIn } from './screens/SignIn'
import { SubjectEdit } from './screens/SubjectEdit'
import { Subjects } from './screens/Subjects'
import { TaskEdit } from './screens/TaskEdit'
import { Timetable } from './screens/Timetable'
import { browserLang, makeT } from './lib/i18n'
import type { User } from 'firebase/auth'

function Shell({ user }: { user: User }) {
  const settings = useSettings(user.uid)

  return (
    <SettingsContext.Provider value={settings}>
    <div className="app">
      <Routes>
        <Route path="/" element={<List uid={user.uid} />} />
        <Route path="/calendar" element={<Calendar uid={user.uid} />} />
        <Route path="/new" element={<New uid={user.uid} />} />
        <Route path="/task/:id" element={<TaskEdit uid={user.uid} />} />
        <Route path="/settings" element={<Settings uid={user.uid} />} />
        <Route path="/profile" element={<Profile user={user} />} />
        <Route path="/timetable" element={<Timetable uid={user.uid} />} />
        <Route path="/subjects" element={<Subjects uid={user.uid} />} />
        <Route path="/subjects/new" element={<SubjectEdit uid={user.uid} />} />
        <Route path="/subjects/:id" element={<SubjectEdit uid={user.uid} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 높이 0 인 칸에 얹혀 탭바 바로 위에 뜬다 — 어느 화면이든 자리가 같다. */}
      <FocusDock uid={user.uid} />
      <BottomNav />
    </div>
    </SettingsContext.Provider>
  )
}

export function App() {
  const { user, loading, error } = useAuth()
  useEffect(() => {
    if (!user) return applyAppearance(readAppearance())
  }, [user])

  // 로그인 전이라 계정 언어 설정이 아직 없다. SignIn 과 같은 규칙을 쓴다.
  if (loading) return <div className="boot">{makeT(browserLang())('불러오는 중…', 'Loading…')}</div>
  // M1 의 dev 미리보기 우회는 여기서 없앴다. Firestore 가 붙은 뒤로는 가짜 uid 로 읽을 데이터가
  // 없어 화면이 어차피 비고, db 가 null 인 분기를 화면마다 들고 다니게 만든다.
  if (!user) return <SignIn error={error} />

  return <Shell key={user.uid} user={user} />
}
