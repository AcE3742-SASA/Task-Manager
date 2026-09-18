/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

/**
 * generateSW 에서 injectManifest 로 옮겨 온 것이다. push 이벤트를 받으려면
 * 서비스워커 코드를 우리가 소유해야 한다. 아래 두 가지는 generateSW 가
 * 자동으로 해주던 것을 손으로 옮긴 것이므로 지우면 안 된다:
 *   1. registerType:'autoUpdate' 의 실체 = skipWaiting + clientsClaim
 *   2. navigateFallback 과 그 denylist
 */

self.skipWaiting()
precacheAndRoute(self.__WB_MANIFEST)

// 선택하지 않은 테마의 서체까지 설치 때 받지 않는다. 한 번 사용한 서체는 오프라인에서도 재사용한다.
// 서체 파일을 같은 이름으로 교체할 때는 cacheName의 버전을 올린다.
registerRoute(
  ({ url }) => url.origin === self.location.origin && /^\/fonts\/.*\.woff2?$/.test(url.pathname),
  new CacheFirst({ cacheName: 'sasa-fonts-v1' }),
)

/**
 * SPA 라우팅. denylist 가 이 파일에서 제일 중요한 줄이다.
 * /__/auth/ 는 vercel.json 이 Firebase 로 프록시하는 로그인 핸들러다.
 * 이걸 index.html 로 떨어뜨리거나 캐시에 굳히면 로그인이 조용히 깨진다.
 * /api/ 는 알림 cron 엔드포인트다. 네비게이션이 아니지만 같이 막아 둔다.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/__\/auth\//, /^\/api\//],
  }),
)

type Payload = { title: string; body: string; screen: string; deliveryId?: string }

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let p: Payload
  try {
    p = event.data.json() as Payload
  } catch {
    // 형식이 깨진 푸시는 조용히 버린다. userVisibleOnly 계약상 알림을
    // 아예 안 띄우면 브라우저가 경고를 대신 띄우지만, 가짜 알림보다는 낫다.
    return
  }
  const options: NotificationOptions & { renotify: boolean } = {
      body: p.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 결과 불명으로 재시도한 같은 발송은 알림함에서 교체한다. 구버전 payload도 지원한다.
      tag: typeof p.deliveryId === 'string' && /^[a-f0-9]{64}$/.test(p.deliveryId) ? p.deliveryId : p.screen,
      renotify: false,
      data: { screen: p.screen },
  }
  event.waitUntil(self.registration.showNotification(p.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const screen = (event.notification.data as { screen?: string } | null)?.screen ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열려 있는 창이 있으면 그걸 쓴다. 홈 화면 PWA 는 창이 하나뿐이라
      // 새로 열면 앱이 통째로 재시작한 것처럼 보인다.
      for (const c of list) {
        if ('focus' in c) {
          void c.navigate(new URL(screen, self.location.origin).href)
          return c.focus()
        }
      }
      return self.clients.openWindow(screen)
    }),
  )
})
