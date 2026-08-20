import { Navigate, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { BottomNav } from './components/BottomNav'
import { isConfigured } from './lib/firebase'
import { useAuth } from './lib/useAuth'
import { Calendar } from './screens/Calendar'
import { List } from './screens/List'
import { New } from './screens/New'
import { Profile } from './screens/Profile'
import { Settings } from './screens/Settings'
import { SignIn } from './screens/SignIn'

function Shell({ user }: { user: User }) {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<List />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/new" element={<New />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  )
}

/**
 * Firebase 콘솔 설정 전에도 화면을 보며 개발할 수 있게 한다.
 * import.meta.env.DEV 가 상수로 접히므로 프로덕션 번들에는 남지 않는다.
 * ponytail: M3에서 Firestore가 붙으면 이 우회로는 실데이터 경로가 되므로 그때 없앤다.
 */
const PREVIEW_USER = {
  displayName: '미리보기',
  email: 'dev@localhost',
  photoURL: null,
} as User

export function App() {
  const { user, loading, error } = useAuth()

  if (loading) return <div className="boot">불러오는 중…</div>

  if (!user) {
    if (import.meta.env.DEV && !isConfigured) return <Shell user={PREVIEW_USER} />
    return <SignIn error={error} />
  }

  return <Shell user={user} />
}
