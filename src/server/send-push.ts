import { request } from 'node:https'
import webpush from 'web-push'

/** 암호화/VAPID는 기존 라이브러리를 쓰고, 전송은 Node의 실제 취소 가능한 제한시간을 쓴다. */
export const sendPush: typeof webpush.sendNotification = async (subscription, payload, options) => {
  const details = webpush.generateRequestDetails(subscription, payload ?? undefined, options)
  const controller = new AbortController()
  // web-push의 timeout은 socket idle timeout이다. 여기서는 DNS~응답 끝 전체를 제한한다.
  const timer = setTimeout(() => controller.abort(), options?.timeout ?? 5_000)
  try {
    return await new Promise((resolve, reject) => {
      const req = request(details.endpoint, {
        method: details.method, headers: details.headers, signal: controller.signal,
        // TLS 인증서 검증은 Node 기본값인 true를 그대로 사용한다. 리다이렉트는 따르지 않는다.
      }, res => {
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 65_536) req.destroy(new Error('push-response-too-large'))
        })
        res.on('error', reject)
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0
          if (statusCode >= 200 && statusCode < 300) resolve({ statusCode, headers: {}, body: '' })
          else reject(Object.assign(new Error('push-rejected'), { statusCode }))
        })
      })
      req.on('error', reject)
      req.end(details.body)
    })
  } finally { clearTimeout(timer) }
}
