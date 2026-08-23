import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'
import { DEFAULT_NOTIFY, countDue, kstHour, notifyCopy, pickKinds } from '../src/lib/notify'
import type { Notify } from '../src/lib/notify'
import type { Lang } from '../src/lib/i18n'

/**
 * GitHub Actions 가 매시 정각에 호출한다. 공개 URL 이므로 CRON_SECRET 검사가
 * 유일한 방어선이다. 시크릿이 없으면 부팅 자체를 실패시킨다 —
 * 환경변수를 빠뜨린 채 배포하면 엔드포인트가 무방비로 열린다.
 */
const SECRET = process.env.CRON_SECRET
if (!SECRET) throw new Error('CRON_SECRET 이 없다')

const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT
if (!SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT 가 없다')

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(SERVICE_ACCOUNT)) })
}
const db = getFirestore()

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? 'mailto:ejunhong03@gmail.com',
  process.env.VAPID_PUBLIC ?? '',
  process.env.VAPID_PRIVATE ?? '',
)

type SubDoc = { endpoint: string; keys: { p256dh: string; auth: string } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const now = new Date()
  const hour = kstHour(now)

  /**
   * users 컬렉션을 나열하지 않는다 — task 와 settings 가 서브컬렉션에만 쓰여서
   * users/{uid} 부모 문서가 실제로 존재하지 않는다. 구독 문서에서 uid 를 역산한다.
   * 덤으로 미구독자가 공짜로 걸러진다.
   * ponytail: 전체 스캔이다. 사용자 1~5명 전제. 수십 명이 되면
   * settings 에 notifyHours 를 두고 collectionGroup 인덱스 쿼리로 바꾼다.
   */
  const subs = await db.collectionGroup('pushSubs').get()
  const byUid = new Map<string, { id: string; data: SubDoc }[]>()
  for (const d of subs.docs) {
    // 경로: users/{uid}/pushSubs/{id}
    const uid = d.ref.parent.parent?.id
    if (!uid) continue
    const list = byUid.get(uid) ?? []
    list.push({ id: d.id, data: d.data() as SubDoc })
    byUid.set(uid, list)
  }

  let sent = 0
  let pruned = 0

  for (const [uid, list] of byUid) {
    // 한 사용자의 실패가 다른 사용자의 발송을 막지 않는다.
    try {
      const snap = await db.doc(`users/${uid}/settings/app`).get()
      const s = (snap.data() ?? {}) as { lang?: Lang; notify?: Partial<Notify> }
      const notify: Notify = { ...DEFAULT_NOTIFY, ...s.notify }
      const kinds = pickKinds(hour, notify)
      if (!kinds.length) continue

      let counts = { today: 0, tomorrow: 0 }
      if (kinds.includes('morning')) {
        const tasks = await db.collection(`users/${uid}/tasks`).where('done', '==', false).get()
        counts = countDue(
          tasks.docs.map((t) => t.get('due').toDate() as Date),
          now,
        )
      }

      for (const kind of kinds) {
        const payload = JSON.stringify(notifyCopy(kind, s.lang ?? 'ko', counts))
        for (const sub of list) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.data.endpoint, keys: sub.data.keys },
              payload,
            )
            sent++
          } catch (e) {
            // 404/410 = 이 구독은 죽었다. 영구히 쌓이지 않게 지운다.
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) {
              await db.doc(`users/${uid}/pushSubs/${sub.id}`).delete()
              pruned++
            } else {
              console.error(`발송 실패 uid=${uid} code=${code}`, e)
            }
          }
        }
      }
    } catch (e) {
      console.error(`사용자 처리 실패 uid=${uid}`, e)
    }
  }

  return res.status(200).json({ ok: true, hour, sent, pruned })
}
