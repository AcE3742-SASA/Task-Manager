import { useState } from 'react'
import { signInWithRedirect } from 'firebase/auth'
import { auth, googleProvider, isConfigured } from '../lib/firebase'
import { IconArrow } from '../components/icons'

/**
 * 팝업이 아니라 리다이렉트를 쓴다.
 * iOS 홈 화면 PWA(standalone)에서 signInWithPopup 은 인앱 창으로 열려 세션을 잃는 일이 잦다.
 * 대신 authDomain 이 배포 도메인이어야 한다 — docs/setup-firebase-vercel.md 참조.
 */
export function SignIn({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function signIn() {
    if (!auth) return
    setBusy(true)
    setLocalError(null)
    try {
      await signInWithRedirect(auth, googleProvider)
    } catch (e: unknown) {
      setBusy(false)
      setLocalError(e instanceof Error ? e.message : String(e))
    }
  }

  const shown = localError ?? error

  return (
    <div className="signin">
      <div className="card">
        <span className="eyebrow">SASA TASK MANAGER / R1</span>
        <h1>
          흩어진 과제를
          <br />
          <em>한 곳에</em>.
        </h1>
        <p>
          Google 계정으로 로그인하면 맥에서 넣은 과제를 아이폰에서 그대로 본다. 계정 하나에 네
          데이터만 들어간다.
        </p>
      </div>

      {isConfigured ? (
        <button className="bigbtn" onClick={signIn} disabled={busy}>
          {busy ? '이동 중…' : 'Google로 계속하기'}
          {!busy && <IconArrow />}
        </button>
      ) : (
        <div className="err">
          <b>FIREBASE 설정 없음</b>
          <code>.env.local</code> 에 <code>VITE_FIREBASE_*</code> 6개 값이 비어 있다.{' '}
          <code>docs/setup-firebase-vercel.md</code> 의 순서를 따라 채운 뒤 다시 배포하면 된다.
        </div>
      )}

      {shown && (
        <div className="err">
          <b>로그인 실패</b>
          {shown}
        </div>
      )}
    </div>
  )
}
