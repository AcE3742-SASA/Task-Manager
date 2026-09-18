/** vite --mode demo에서만 사용하는 로컬 테스트 계정. 실제 Firebase를 초기화하지 않는다. */
import type { User } from 'firebase/auth'

const user = { uid: 'local-demo', displayName: '개발용 테스트', email: 'demo@local.test', photoURL: null } as User
export const db = {}
export const auth: { currentUser: User | null } = { currentUser: user }
export const googleProvider = {}
export const isConfigured = true
const listeners = new Set<(user: User | null) => void>()
const emit = () => listeners.forEach(fn => fn(auth.currentUser))

export function onAuthStateChanged(_auth: unknown, fn: (user: User | null) => void) {
  listeners.add(fn)
  queueMicrotask(() => { if (listeners.has(fn)) fn(auth.currentUser) })
  return () => { listeners.delete(fn) }
}
export const getRedirectResult = async () => null
export async function signInWithRedirect() { auth.currentUser = user; emit() }
export async function signOut() { auth.currentUser = null; emit() }
export const deleteUser = signOut

// 데모는 서비스워커·푸시 서버에 연결하지 않는다.
export const pushSupported = () => false
export const permission = () => 'unsupported' as const
export const isSubscribedHere = async () => false
export const unsubscribeThisDevice = async () => {}
export const subscribeThisDevice = async () => { throw new Error('unsupported') }

if (typeof document !== 'undefined') document.title = '[DEV] Task Manager · 로컬 테스트'
