import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'fonts/*.woff2'],
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // 인증 핸들러는 SW가 가로채면 안 된다 — 프록시된 Firebase 응답이 굳으면 로그인이 조용히 깨진다.
        navigateFallbackDenylist: [/^\/__\/auth\//],
      },
    }),
  ],
})
