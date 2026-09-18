import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'
import { sendPush } from './send-push.js'

export type SubDoc = { endpoint: string; keys: { p256dh: string; auth: string }; vapid?: string }

/** 사용자 문서의 endpoint를 임의 URL로 이용해 서버 요청을 우회하지 못하게 한다. */
export function validPushSubscription(value: unknown): value is SubDoc {
  const sub = value as Partial<SubDoc> | null
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 4096) return false
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false
  if (!/^[A-Za-z0-9_=-]{20,256}$/.test(sub.keys.p256dh) || !/^[A-Za-z0-9_=-]{16,128}$/.test(sub.keys.auth)) return false
  try {
    const url = new URL(sub.endpoint)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    return url.hostname === 'fcm.googleapis.com' || url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.push.services.mozilla.com') || url.hostname.endsWith('.notify.windows.com')
  } catch { return false }
}

/** API에서만 불러온다. 클라이언트 번들에는 관리자 자격 증명이 들어가지 않는다. */
export function pushServices() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  const publicKey = process.env.VAPID_PUBLIC
  const privateKey = process.env.VAPID_PRIVATE
  if (!serviceAccount || !publicKey || !privateKey) throw new Error('push-server-not-configured')
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:ejunhong03@gmail.com', publicKey, privateKey)
  return { db: getFirestore(app), auth: getAuth(app), webpush: { sendNotification: sendPush }, publicKey }
}
