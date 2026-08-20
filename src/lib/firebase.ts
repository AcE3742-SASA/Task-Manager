import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** 콘솔 설정 전에도 앱이 흰 화면으로 죽지 않게 한다. 로그인 화면이 안내를 대신 보여준다. */
export const isConfigured = Object.values(config).every(
  (v) => typeof v === 'string' && v.length > 0,
)

const app = isConfigured ? initializeApp(config) : null

export const auth: Auth | null = app ? getAuth(app) : null

/**
 * 조회 캐시를 디스크에 둔다 — 홈 화면 PWA를 지하철에서 열어도 시간표가 보인다.
 * 오프라인 "편집"은 범위 밖이다 (PRD). 탭 매니저는 multiple 을 쓴다 —
 * 맥에서 탭 두 개를 열어두는 일이 흔한데 single 은 두 번째 탭에서 캐시가 죽는다.
 */
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null

export const googleProvider = new GoogleAuthProvider()
