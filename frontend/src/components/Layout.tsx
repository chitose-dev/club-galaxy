import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { useStore } from '../store'
import Clock from './Clock'
import GlobalNavBar from './GlobalNavBar'

/**
 * TRUST 準拠のグローバルレイアウト。
 * - ヘッダー左: 店舗名 + 時計
 * - ヘッダー右: 5 アイコングローバルナビ (GlobalNavBar)
 * - メイン: <Outlet />。各ページが必要なら下部に BottomActionBar を差し込む。
 * - 下部 BottomNav は廃止 (TRUST 仕様に合わせ、ページ別アクションバーに置き換え)。
 */
export default function Layout() {
  const { user, logout } = useAuth()
  const { storeSettings } = useStore()

  return (
    <div className="flex flex-col h-dvh">
      <header className="bg-primary px-4 py-2.5 flex items-center justify-between border-b border-white/10 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl font-semibold tracking-widest text-gold truncate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {storeSettings.storeName}
          </h1>
          <Clock />
          <span className="text-xs text-gray-400 tracking-wide hidden sm:inline">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <GlobalNavBar />
          {user && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 h-12 whitespace-nowrap">
              <span className="text-xs text-gray-200">{user.displayName}</span>
              <span className="text-gray-600">|</span>
              <button
                onClick={logout}
                className="text-xs text-gray-400 hover:text-gold transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-primary">
        <Outlet />
      </main>
    </div>
  )
}
