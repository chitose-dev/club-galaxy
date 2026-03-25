import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../auth'

const allTabs = [
  { to: '/floor', label: 'フロア', icon: '🏠', roles: ['owner', 'staff'] },
  { to: '/order', label: '注文', icon: '🍸', roles: ['owner', 'staff'] },
  { to: '/billing', label: '会計', icon: '💰', roles: ['owner', 'staff'] },
  { to: '/salary', label: '給与', icon: '💵', roles: ['owner', 'cast'] },
  { to: '/register', label: 'レジ', icon: '🧾', roles: ['owner'] },
  { to: '/admin', label: '管理', icon: '⚙️', roles: ['owner'] },
]

export default function Layout() {
  const { user, logout } = useAuth()

  const tabs = allTabs.filter((tab) => user && tab.roles.includes(user.role))
  const colsClass = tabs.length <= 2 ? 'grid-cols-2' : tabs.length === 3 ? 'grid-cols-3' : tabs.length === 4 ? 'grid-cols-4' : tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-6'

  return (
    <div className="flex flex-col h-dvh">
      <header className="bg-[#16213e] px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wider text-[#d4af37]">
          CLUB GALAXY
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
          {user && (
            <button onClick={logout} className="bg-white/10 text-gray-300 text-xs px-2 py-1 rounded hover:bg-white/20 transition-colors">
              {user.displayName} | ログアウト
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#1a1a2e]">
        <Outlet />
      </main>

      <nav className={`bg-[#16213e] border-t border-gray-700 grid ${colsClass} safe-bottom`}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 text-[10px] transition-colors ${
                isActive ? 'text-[#d4af37]' : 'text-gray-400'
              }`
            }
          >
            <span className="text-lg mb-0.5">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
