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
      <header className="bg-[#1a1a2e] px-4 py-2.5 flex items-center justify-between border-b border-white/10 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl font-semibold tracking-widest text-[#d4af37] truncate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {storeSettings.storeName}
          </h1>
          <Clock />
          <span className="text-xs text-gray-400 tracking-wide hidden sm:inline">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <GlobalNavBar />
          {user && (
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-white transition-colors whitespace-nowrap"
            >
              {user.displayName} <span className="text-gray-600 mx-1">|</span> ログアウト
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#1a1a2e]">
        <Outlet />
      </main>
    </div>
  )
}
