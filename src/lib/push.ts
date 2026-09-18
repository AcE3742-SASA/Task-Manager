import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { Timestamp, deleteDoc, doc, getDocFromServer, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined
const OWNER_KEY = 'push.owner'
type Owner = { uid: string; endpoint: string }
export type PushStatus = 'on' | 'off' | 'reconnect' | 'unsupported'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator &&
  'PushManager' in window && 'Notification' in window

export const permission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported'

function owner(): Owner | null {
  try {
    const value = JSON.parse(localStorage.getItem(OWNER_KEY) ?? 'null')
    return typeof value?.uid === 'string' && typeof value?.endpoint === 'string' ? value : null
  } catch { return null }
}

function remember(value: Owner | null) {
  // 소유 정보를 못 저장하면 다음 실행에서 서버 소유권을 다시 확인한다.
  try {
    if (value) localStorage.setItem(OWNER_KEY, JSON.stringify(value))
    else localStorage.removeItem(OWNER_KEY)
  } catch { /* 저장소가 차단된 기기에서는 서버 확인으로 후퇴한다. */ }
}

function requireAccount(uid: string) {
  if (auth?.currentUser?.uid !== uid) throw new Error('account-changed')
}

function publicKey(): Uint8Array<ArrayBuffer> {
  if (!VAPID_PUBLIC) throw new Error('nokey')
  const raw = atob((VAPID_PUBLIC + '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(sub: PushSubscription) {
  const expected = publicKey()
  const actual = sub.options.applicationServerKey
  return actual !== null && new Uint8Array(actual).length === expected.length &&
    new Uint8Array(actual).every((byte, i) => byte === expected[i])
}

const idOf = (endpoint: string) => endpoint.split('/').pop() ?? endpoint.slice(-64)
const subRef = (uid: string, endpoint: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'pushSubs', idOf(endpoint))
}
async function bounded<T>(promise: Promise<T>, code = 'push-timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), 10_000) }),
    ])
  } finally { clearTimeout(timer) }
}
const ready = () => bounded(navigator.serviceWorker.ready, 'worker-not-ready')
const subscription = async () => bounded((await ready()).pushManager.getSubscription())

async function stopLocal(sub: PushSubscription) {
  const stopped = await bounded(sub.unsubscribe())
  // false가 이미 해제됐음을 뜻할 수도 있으므로 실제 잔존 여부로 판단한다.
  if (!stopped && await subscription()) throw new Error('unsubscribe-failed')
}

/** 로컬 구독만으로 켜짐을 판단하지 않는다. 현재 계정의 서버 등록까지 확인한다. */
export async function getPushStatus(uid: string): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  requireAccount(uid)
  const sub = await subscription()
  if (!sub) return 'off'
  if (permission() !== 'granted' || !VAPID_PUBLIC || !sameKey(sub)) return 'reconnect'
  const savedOwner = owner()
  if (savedOwner && savedOwner.uid !== uid) return 'reconnect'
  const snap = await bounded(getDocFromServer(subRef(uid, sub.endpoint)))
  requireAccount(uid)
  const data = snap.data()
  const keys = sub.toJSON().keys
  const matches = snap.exists() && data?.endpoint === sub.endpoint && data.vapid === VAPID_PUBLIC &&
    data.keys?.p256dh === keys?.p256dh && data.keys?.auth === keys?.auth
  if (matches) remember({ uid, endpoint: sub.endpoint })
  return matches ? 'on' : 'reconnect'
}

/**
 * 계정이 바뀌면 이전 endpoint를 먼저 무효화한다. 다른 사용자의 Firestore 문서를
 * 현재 계정 권한으로 지우지 않는다. 무효 endpoint는 발송 서버의 410 정리 대상이다.
 * 구버전의 소유 메타 없는 구독은 서버에서 현재 계정 소유임을 확인한 뒤에만 유지한다.
 */
export async function reconcilePushAccount(uid: string): Promise<void> {
  if (!pushSupported()) return
  requireAccount(uid)
  const sub = await subscription()
  if (!sub) return
  const previous = owner()
  if (previous?.uid === uid && previous.endpoint === sub.endpoint && VAPID_PUBLIC && sameKey(sub)) return
  if (!previous) {
    try {
      if (await getPushStatus(uid) === 'on') return
    } catch {
      // 소유권을 확인할 수 없을 때 예전 계정 알림이 계속 오는 것보다 해제 후 재연결한다.
      await stopLocal(sub)
      remember(null)
      throw new Error('push-reconnect')
    }
  }
  await stopLocal(sub)
  remember(null)
}

export async function subscribeThisDevice(uid: string): Promise<void> {
  if (!pushSupported()) throw new Error('unsupported')
  requireAccount(uid)
  const key = publicKey()
  const granted = await Notification.requestPermission()
  if (granted !== 'granted') throw new Error(granted)
  requireAccount(uid)
  const reg = await ready()
  let sub = await bounded(reg.pushManager.getSubscription())
  const previous = owner()
  if (sub && (!sameKey(sub) || previous?.uid !== uid || previous.endpoint !== sub.endpoint)) {
    await stopLocal(sub)
    // 현재 로그인한 계정의 이전 등록만 정리할 수 있다.
    if (previous?.uid === uid) await bounded(deleteDoc(subRef(uid, previous.endpoint)))
    remember(null)
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  requireAccount(uid)
  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) {
    await stopLocal(sub)
    throw new Error('nokeys')
  }
  remember({ uid, endpoint: sub.endpoint })
  await bounded(setDoc(subRef(uid, sub.endpoint), {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    vapid: VAPID_PUBLIC,
    ua: navigator.userAgent,
    createdAt: Timestamp.now(),
  }))
  requireAccount(uid)
}

export async function unsubscribeThisDevice(uid: string): Promise<void> {
  requireAccount(uid)
  const previous = owner()
  const sub = pushSupported() ? await subscription() : null
  if (sub) {
    // 서버 정리에 실패해도 이전 계정 알림은 이 기기로 오지 않게 먼저 해제한다.
    if (!previous || previous.uid === uid) remember({ uid, endpoint: sub.endpoint })
    await stopLocal(sub)
  }
  const pending = owner()
  if (pending?.uid === uid) {
    await bounded(deleteDoc(subRef(uid, pending.endpoint)))
    requireAccount(uid)
  }
  remember(null)
}

/** 해제 실패를 무시하고 로그아웃하지 않는다. Profile에서 오류와 재시도를 제공한다. */
export async function signOutSafely(user: User): Promise<void> {
  requireAccount(user.uid)
  await unsubscribeThisDevice(user.uid)
  requireAccount(user.uid)
  await signOut(auth!)
}

/** 사용자가 누를 때만 호출한다. 토큰/endpoint를 로그에 남기지 않는다. */
export async function sendTestPush(uid: string): Promise<void> {
  requireAccount(uid)
  if (await getPushStatus(uid) !== 'on') throw new Error('push-reconnect')
  const sub = await subscription()
  if (!sub) throw new Error('push-reconnect')
  const token = await auth!.currentUser!.getIdToken()
  requireAccount(uid)
  const response = await fetch('/api/test-push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId: idOf(sub.endpoint) }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { code?: string } } | null
    throw new Error(result?.error?.code ?? 'test-failed')
  }
}
