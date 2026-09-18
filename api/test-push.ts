import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pushServices, validPushSubscription } from '../src/server/push.js'

const MINUTE = 60_000
const DAY = 86_400_000

/** 현재 계정의 선택한 기기 한 곳에만 보낸다. 브라우저의 UID/endpoint 입력은 받지 않는다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fail = (status: number, code: string) => res.status(status).json({ error: { code } })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return fail(405, 'method-not-allowed')
  }
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 8192) return fail(401, 'unauthorized')
  const id = req.body?.subscriptionId
  if (typeof id !== 'string' || !id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') return fail(400, 'invalid-subscription')

  let services: ReturnType<typeof pushServices>
  try { services = pushServices() }
  catch { return fail(503, 'push-unavailable') }
  const { db, auth, webpush, publicKey } = services
  let uid: string
  try { uid = (await auth.verifyIdToken(header.slice(7), true)).uid }
  catch { return fail(401, 'unauthorized') }

  try {
    const ref = db.collection('users').doc(uid).collection('pushSubs').doc(id)
    const snapshot = await ref.get()
    const sub: unknown = snapshot.data()
    if (!snapshot.exists || !validPushSubscription(sub) || sub.vapid !== publicKey) return fail(409, 'push-reconnect')

    // users 아래는 본인이 수정할 수 있으므로 제한 기록은 서버 전용 루트에 둔다.
    const now = Date.now()
    const day = Math.floor(now / DAY)
    const limitRef = db.collection('pushTestLimits').doc(uid)
    const allowed = await db.runTransaction(async (tx) => {
      const previous = (await tx.get(limitRef)).data()
      const count = previous?.day === day ? Number(previous.count ?? 0) : 0
      if (now - Number(previous?.lastAttempt ?? 0) < MINUTE || count >= 10) return false
      tx.set(limitRef, { day, count: count + 1, lastAttempt: now, expiresAt: new Date(now + 2 * DAY) })
      return true
    })
    if (!allowed) {
      res.setHeader('Retry-After', '60')
      return fail(429, 'rate-limited')
    }

    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({
        title: '알림 연결 확인',
        body: '이 기기에 테스트 알림이 도착했어요.',
        screen: '/settings',
      }), { TTL: 60, timeout: 5_000 })
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        // 이전 요청이 실패한 사이에 다시 등록한 구독은 지우지 않는다.
        await db.runTransaction(async (tx) => {
          const current = (await tx.get(ref)).data()
          if (current?.endpoint === sub.endpoint && current.keys?.p256dh === sub.keys.p256dh &&
              current.keys?.auth === sub.keys.auth && current.vapid === sub.vapid) tx.delete(ref)
        }, { maxAttempts: 2 })
        return fail(409, 'push-reconnect')
      }
      console.error('Test push failed', { code: code ?? 'unknown' })
      return fail(502, 'test-failed')
    }
    // 성공은 push 서비스 접수만 의미한다. 실제 기기 표시 여부는 사용자가 확인한다.
    return res.status(200).json({ ok: true, accepted: true })
  } catch {
    console.error('Test push account operation failed')
    return fail(503, 'push-unavailable')
  }
}
