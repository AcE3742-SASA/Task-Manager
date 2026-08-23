import { Timestamp, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 표준 Push API 만 쓴다. firebase/messaging 을 쓰지 않는 이유는
 * spec 에 적혀 있다 — iOS Safari PWA 에서 지원 판정이 불안정하다.
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const permission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported'

/** VAPID 공개키는 base64url 문자열로 오는데 subscribe 는 바이트를 받는다. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  // ArrayBuffer 를 명시해야 한다 — tsconfig 의 "node" 타입이 전역 Uint8Array 를
  // ArrayBufferLike 제네릭으로 넓혀서, PushSubscriptionOptionsInit 이 요구하는
  // ArrayBufferView<ArrayBuffer> 와 안 맞는다 (TS 5.7+ / @types/node 상호작용).
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * 문서 ID 는 endpoint 의 마지막 경로 조각이다. 푸시 서비스가 발급한 토큰이라
 * 기기마다 다르고, 같은 기기가 재구독해도 바뀌므로 죽은 구독은 Task 5 가
 * 410 응답을 보고 지운다.
 * ponytail: 서로 다른 푸시 서비스가 같은 꼬리를 낼 확률은 무시한다.
 * 사용자 1~5명 전제. 충돌이 실제로 보이면 endpoint 전체를 해시한다.
 */
const idOf = (endpoint: string) => endpoint.split('/').pop() ?? endpoint.slice(-64)

const subRef = (uid: string, endpoint: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'pushSubs', idOf(endpoint))
}

/** 이 기기가 이미 구독돼 있는가. Settings 화면의 토글 초기 상태다. */
export async function isSubscribedHere(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) !== null
}

export async function subscribeThisDevice(uid: string): Promise<void> {
  if (!pushSupported()) {
    // iOS 는 홈 화면에 설치하지 않으면 PushManager 자체가 없다.
    // 이 안내가 실제로 제일 자주 보게 될 메시지다.
    throw new Error('unsupported')
  }
  if (!VAPID_PUBLIC) throw new Error('nokey')

  const granted = await Notification.requestPermission()
  if (granted !== 'granted') throw new Error(granted) // 'denied' | 'default'

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    }))

  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('nokeys')

  await setDoc(subRef(uid, sub.endpoint), {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    ua: navigator.userAgent,
    createdAt: Timestamp.now(),
  })
}

export async function unsubscribeThisDevice(uid: string): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const ref = subRef(uid, sub.endpoint)
  await sub.unsubscribe()
  // 구독 해제가 먼저다. Firestore 삭제가 실패해도 브라우저는 이미 안 받는다.
  if ((await getDoc(ref)).exists()) await deleteDoc(ref)
}
