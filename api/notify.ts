import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pushServices } from '../src/server/push.js'
import { runScheduledNotifications } from '../src/server/scheduled-notifications.js'
import { initialNotificationSlot } from '../src/server/notification-schedule.js'

// cron-job.org의 기본30초보다 짧게 종료한다. 종료된 요청은 다음 호출에서 복구한다.
export const config = { maxDuration: 25 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const fail = (code: number, error: string) => res.status(code).json({ ok: false, error })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return fail(405, 'method-not-allowed')
  }
  // 전환 중에는 GitHub의 기존 키도 유지한다. 새 서비스에는 발송 전용 새 키만 등록한다.
  const secrets = [process.env.CRON_SECRET, process.env.CRON_JOB_SECRET].filter((secret): secret is string => !!secret)
  if (!secrets.length) return fail(503, 'cron-not-configured')
  const header = req.headers.authorization
  if (typeof header !== 'string' || header.length > 512 || !secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`)
    const actual = Buffer.from(header)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })) return fail(401, 'unauthorized')

  try {
    initialNotificationSlot(Date.now(), process.env.NOTIFY_START_AT)
    const services = pushServices()
    // 배포/스케줄러 연결 점검: 실제 구독/과제를 읽거나 알림을 보내거나 상태를 쓰지 않는다.
    if (req.query?.check === '1') {
      await services.db.doc('notificationScheduler/state').get()
      return res.status(200).json({ ok: true, check: true, sendsNotifications: false })
    }
    // 요청 본문에 대상 UID, 알림 내용, 과거 시각을 지정하는 기능을 제공하지 않는다.
    const report = await runScheduledNotifications(services)
    const ok = report.failed === 0 && report.userFailures === 0
    return res.status(ok ? 200 : 503).json({ ok, ...report })
  } catch {
    // 오류 객체에는 endpoint/키/사용자 데이터가 포함될 수 있으므로 그대로 출력하지 않는다.
    console.error('Notification run could not finish')
    return fail(503, 'notification-run-failed')
  }
}
