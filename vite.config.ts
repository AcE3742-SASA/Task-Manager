import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  // 명시적인 demo 빌드에만 로컬 데이터와 테스트 사용자를 연결한다.
  resolve: { alias: mode === 'demo' ? [
    { find: 'firebase/firestore', replacement: fileURLToPath(new URL('./src/dev/firestore.ts', import.meta.url)) },
    { find: 'firebase/auth', replacement: fileURLToPath(new URL('./src/dev/firebase.ts', import.meta.url)) },
    { find: /^(?:\.\/lib|\.\.\/lib|\.)\/(?:firebase|push)$/, replacement: fileURLToPath(new URL('./src/dev/firebase.ts', import.meta.url)) },
  ] : [] },
  plugins: [
    react(),
    mode !== 'demo' && VitePWA({
      registerType: 'autoUpdate',
      // push 이벤트 핸들러를 넣으려면 서비스워커를 우리가 써야 한다.
      // navigateFallbackDenylist 는 src/sw.ts 안으로 옮겨 갔다.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['apple-touch-icon.png', 'fonts/*LICENSE.txt'],
      manifest: {
        name: 'SASA 할 일',
        short_name: '할 일',
        description: 'SASA 학사 구조에 맞춘 개인 할일 관리',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F4ED',
        theme_color: '#FFFDF8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg}', 'fonts/*LICENSE.txt'],
      },
    }),
  ],
}))
