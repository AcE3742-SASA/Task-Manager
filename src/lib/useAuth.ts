import { useEffect, useState } from 'react'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './firebase'

type AuthState = {
  user: User | null
  loading: boolean
  /** 리다이렉트 로그인 실패는 조용히 사라지기 쉬워서 화면까지 끌어올린다. */
  error: string | null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null })

  useEffect(() => {
    if (!auth) {
      setState({ user: null, loading: false, error: null })
      return
    }

    // 리다이렉트로 돌아온 경우의 실패(승인 안 된 도메인 등)를 여기서 잡는다.
    getRedirectResult(auth).catch((e: unknown) => {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }))
    })

    return onAuthStateChanged(auth, (user) => {
      setState((s) => ({ ...s, user, loading: false }))
    })
  }, [])

  return state
}
