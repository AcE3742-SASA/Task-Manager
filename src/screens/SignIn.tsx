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
        <span className="eyebrow">SASA Task Manager</span>
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
            'Google 계정으로 로그인하면 휴대폰과 컴퓨터에서 같은 할 일을 볼 수 있어요. 할 일과 시간표는 나만 볼 수 있어요.',
            'Sign in with Google to use the same tasks on your phone and computer. Your tasks and timetable are private to your account.',
          )}
        </p>
      </div>

      {isConfigured ? (
        <button className="bigbtn" onClick={signIn} disabled={busy}>
          {busy ? t('이동 중…', 'Redirecting…') : t('Google로 계속하기', 'Continue with Google')}
          {!busy && <IconArrow />}
        </button>
      ) : (
        <div className="err" role="alert">
          <b>{t('지금은 로그인할 수 없어요', 'Sign-in unavailable')}</b>
          {t(
            '잠시 후 다시 시도해 주세요.',
            'Please try again later.',
          )}
        </div>
      )}

      {shown && (
        <div className="err" role="alert">
          <b>{t('로그인하지 못했어요', 'SIGN-IN FAILED')}</b>
          {t('연결을 확인한 뒤 Google로 계속하기를 눌러 다시 시도해 주세요.', 'Check your connection, then select Continue with Google to try again.')}
        </div>
      )}
    </div>
  )
}
