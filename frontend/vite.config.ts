import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => {
  // 本番ビルドで接続先 URL が未設定なら、デプロイ前に build を失敗させる。
  // 実行時（デプロイ後）に画面上で API エラーになるより早く気づけるようにする。
  // ローカル開発（vite dev）は未設定でよい（相対 URL + proxy で localhost:3001）。
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = (env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? '').trim()
  if (command === 'build' && mode === 'production' && !apiBase) {
    throw new Error(
      '[build] VITE_API_BASE_URL が未設定です。本番ビルドでは接続先バックエンド URL を' +
      '明示してください（例: VITE_API_BASE_URL=https://<backend-host> npm run build）。',
    )
  }

  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CLUB GALAXY',
        short_name: 'GALAXY',
        description: 'キャバクラ店舗管理システム',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  }
})
