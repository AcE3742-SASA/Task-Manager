import { useState } from 'react'
import { signInWithRedirect } from 'firebase/auth'
import { auth, googleProvider, isConfigured } from '../lib/firebase'
import { IconArrow } from '../components/icons'
import { browserLang, makeT } from '../lib/i18n'

/**
 * 팝업이 아니라 리다이렉트를 쓴다.
 * iOS 홈 화면 PWA(standalone)에서 signInWithPopup 은 인앱 창으로 열려 세션을 잃는 일이 잦다.
 * 대신 authDomain 이 배포 도메인이어야 한다 — docs/setup-firebase-vercel.md 참조.
 *
 * 언어: 이 화면은 SettingsContext.Provider 바깥에서 그려진다(App.tsx). 계정별 언어 설정은
 * Firestore 에 있어 로그인 전에는 읽을 수가 없으니, 여기서만 브라우저 언어로 추측한다.
 */
export function SignIn({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const lang = browserLang()
  const t = makeT(lang)

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
        {lang === 'en' ? (
          <h1>
            Every assignment,
            <br />
            <em>one place</em>.
          </h1>
        ) : (
          <h1>
            흩어진 과제를
            <br />
            <em>한 곳에</em>.
          </h1>
        )}
        <p>
          {t(
            'Google 계정으로 로그인하면 맥에서 넣은 과제를 아이폰에서 그대로 본다. 계정 하나에 네 데이터만 들어간다.',
            'Sign in with Google and the tasks you add on your Mac show up on your iPhone. One account, your data only.',
          )}
        </p>
      </div>

      {isConfigured ? (
        <button className="bigbtn" onClick={signIn} disabled={busy}>
          {busy ? t('이동 중…', 'Redirecting…') : t('Google로 계속하기', 'Continue with Google')}
          {!busy && <IconArrow />}
        </button>
      ) : (
        <div className="err">
          <b>{t('FIREBASE 설정 없음', 'FIREBASE NOT CONFIGURED')}</b>
          {t(
            '.env.local 에 VITE_FIREBASE_* 6개 값이 비어 있다. docs/setup-firebase-vercel.md 의 순서를 따라 채운 뒤 다시 배포하면 된다.',
            'The six VITE_FIREBASE_* values in .env.local are empty. Fill them following docs/setup-firebase-vercel.md, then redeploy.',
          )}
        </div>
      )}

      {shown && (
        <div className="err">
          <b>{t('로그인 실패', 'SIGN-IN FAILED')}</b>
          {shown}
        </div>
      )}
    </div>
  )
}
