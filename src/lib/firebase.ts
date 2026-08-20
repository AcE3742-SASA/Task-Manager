import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'

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

export const auth: Auth | null = isConfigured ? getAuth(initializeApp(config)) : null

export const googleProvider = new GoogleAuthProvider()
