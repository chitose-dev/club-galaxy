import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import { LayoutGrid, ClipboardList, Receipt, Wallet, Archive, Settings, TrendingUp } from 'lucide-react'

const allTabs = [
  { to: '/floor', label: 'フロア', icon: LayoutGrid, roles: ['owner', 'staff'] },
  { to: '/order', label: '注文', icon: ClipboardList, roles: ['owner', 'staff'] },
  { to: '/billing', label: '会計', icon: Receipt, roles: ['owner', 'staff'] },
  { to: '/salary', label: '給与', icon: Wallet, roles: ['owner', 'cast'] },
  { to: '/profit', label: '利益', icon: TrendingUp, roles: ['owner'] },
  { to: '/register', label: 'レジ', icon: Archive, roles: ['owner'] },
  { to: '/admin', label: '管理', icon: Settings, roles: ['owner'] },
]

export default function Layout() {
  const { user, logout } = useAuth()

  const tabs = allTabs.filter((tab) => user && tab.roles.includes(user.role))
  const colsClass = tabs.length <= 2 ? 'grid-cols-2' : tabs.length === 3 ? 'grid-cols-3' : tabs.length === 4 ? 'grid-cols-4' : tabs.length === 5 ? 'grid-cols-5' : tabs.length === 6 ? 'grid-cols-6' : 'grid-cols-7'

  return (
    <div className="flex flex-col h-dvh">
      <header className="bg-[#16213e] px-4 py-3 flex items-center justify-between border-b border-white/10">
        <h1 className="text-xl font-semibold tracking-widest text-[#d4af37]" style={{ fontFamily: "var(--font-display)" }}>
          CLUB GALAXY
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400 tracking-wide">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
          {user && (
            <button onClick={logout} className="text-xs text-gray-400 hover:text-white transition-colors">
              {user.displayName} <span className="text-gray-600 mx-1">|</span> ログアウト
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#1a1a2e]">
        <Outlet />
      </main>

      <nav className={`bg-[#16213e] border-t border-white/10 grid ${colsClass} safe-bottom`}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center py-2.5 text-[10px] tracking-wide transition-colors relative ${
                  isActive ? 'text-[#d4af37]' : 'text-gray-500 hover:text-gray-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#d4af37] rounded-full" />
                  )}
                  <Icon size={18} strokeWidth={1.5} className="mb-1" />
                  {tab.label}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
