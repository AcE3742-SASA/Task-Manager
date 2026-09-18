import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { applyAppearance, readAppearance } from './lib/appearance'
import { TaskFeedback } from './components/TaskFeedback'
import { RouteBoundary, RouteFallback } from './components/RouteFallback'
import { TasksContext, useTaskSubscription } from './lib/tasks'
import { useT } from './lib/i18n'
import { reconcilePushAccount } from './lib/push'
import { BottomNav } from './components/BottomNav'
import { FocusDock } from './components/FocusDock'
import { SettingsContext, useSettings } from './lib/settings'
import { useAuth } from './lib/useAuth'
import { List } from './screens/List'
import { SignIn } from './screens/SignIn'
import { browserLang, makeT } from './lib/i18n'
import type { User } from 'firebase/auth'

const Calendar = lazy(() => import('./screens/Calendar').then(m => ({ default: m.Calendar })))
const New = lazy(() => import('./screens/New').then(m => ({ default: m.New })))
const Profile = lazy(() => import('./screens/Profile').then(m => ({ default: m.Profile })))
const Settings = lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })))
const SubjectEdit = lazy(() => import('./screens/SubjectEdit').then(m => ({ default: m.SubjectEdit })))
const Subjects = lazy(() => import('./screens/Subjects').then(m => ({ default: m.Subjects })))
const TaskEdit = lazy(() => import('./screens/TaskEdit').then(m => ({ default: m.TaskEdit })))
const Timetable = lazy(() => import('./screens/Timetable').then(m => ({ default: m.Timetable })))

const Help = lazy(() => import('./screens/Help').then(m => ({ default: m.Help })))

function Shell({ user }: { user: User }) {
  const settings = useSettings(user.uid)
  const tasks = useTaskSubscription(user.uid)
  const { pathname } = useLocation()
  const [pushError, setPushError] = useState(false)
  useEffect(() => {
    let active = true
    reconcilePushAccount(user.uid).then(() => { if (active) setPushError(false) }).catch(() => { if (active) setPushError(true) })
    return () => { active = false }
  }, [user.uid, pathname])
  useEffect(() => {
    if (pathname === '/' && !tasks.loading && !tasks.error && (tasks.tasks.length > 0 || !tasks.fromCache) && !performance.getEntriesByName('app:tasks-visible').length) {
      const frame = requestAnimationFrame(() => performance.measure('app:tasks-visible', { start: 0 }))
      return () => cancelAnimationFrame(frame)
    }
  }, [pathname, tasks.loading, tasks.error, tasks.tasks.length, tasks.fromCache])

  return (
    <SettingsContext.Provider value={settings}>
    <TasksContext.Provider value={tasks}>
    <div className="app">
      <TaskFeedback>
      <SyncStatus pending={tasks.pending} fromCache={tasks.fromCache} loading={tasks.loading} pushError={pushError} />
      <RouteBoundary key={pathname}>
      <Suspense fallback={<RouteFallback />}>
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
        <Route path="/help" element={<Help uid={user.uid} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </RouteBoundary>
      {(pathname === '/' || pathname === '/calendar') && <FocusDock uid={user.uid} />}
      <BottomNav />
      </TaskFeedback>
    </div>
    </TasksContext.Provider>
    </SettingsContext.Provider>
  )
}

function SyncStatus({ pending, fromCache, loading, pushError }: { pending: boolean; fromCache: boolean; loading: boolean; pushError: boolean }) {
  const t = useT()
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    setWaiting(false)
    if (!pending && !fromCache) return
    const timer = window.setTimeout(() => setWaiting(true), pending ? 1500 : 8000)
    return () => clearTimeout(timer)
  }, [pending, fromCache])
  if (pushError) return <div className="sync-note" role="alert">{t('이 기기의 알림 연결을 확인하지 못했어요. 설정에서 다시 확인해 주세요.', 'Could not check device notifications. Please check Settings.')}</div>
  if (!waiting || loading) return null
  return <div className="sync-note" role="status">{pending
    ? t('서버에 저장 중이에요. 앱을 닫기 전에 연결을 확인해 주세요.', 'Saving to the server. Check your connection before closing.')
    : t('기기에 저장된 목록이에요. 최신 변경 내용을 확인하고 있어요.', 'Showing the saved list while checking for updates.')}</div>
}

function Boot() {
  const t = makeT(browserLang())
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  return <div className="boot" role="status"><div>
    <p>{slow ? t('로그인 확인이 늦어지고 있어요. 연결을 확인해 주세요.', 'Checking your sign-in is taking longer. Please check your connection.') : t('불러오고 있어요…', 'Loading…')}</p>
    {slow && <button className="bigbtn" onClick={() => location.reload()}>{t('다시 불러오기', 'Reload')}</button>}
  </div></div>
}

export function App() {
  const { user, loading, error } = useAuth()
  useEffect(() => {
    if (!user) return applyAppearance(readAppearance())
  }, [user])

  useEffect(() => {
    if (!loading && !performance.getEntriesByName('app:auth-ready').length) performance.measure('app:auth-ready', { start: 0 })
  }, [loading])

  // 로그인 전이라 계정 언어 설정이 아직 없다. SignIn 과 같은 규칙을 쓴다.
  if (loading) return <Boot />
  // M1 의 dev 미리보기 우회는 여기서 없앴다. Firestore 가 붙은 뒤로는 가짜 uid 로 읽을 데이터가
  // 없어 화면이 어차피 비고, db 가 null 인 분기를 화면마다 들고 다니게 만든다.
  if (!user) return <SignIn error={error} />

  return <Shell key={user.uid} user={user} />
}