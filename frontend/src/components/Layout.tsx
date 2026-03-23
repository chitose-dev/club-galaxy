import { Outlet, NavLink } from 'react-router-dom'

const tabs = [
  { to: '/floor', label: 'フロア', icon: '🏠' },
  { to: '/order', label: '注文', icon: '🍸' },
  { to: '/billing', label: '会計', icon: '💰' },
  { to: '/admin', label: '管理', icon: '⚙️' },
]

export default function Layout() {
  return (
    <div className="flex flex-col h-dvh">
      <header className="bg-[#16213e] px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wider text-[#d4af37]">
          CLUB GALAXY
        </h1>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#1a1a2e]">
        <Outlet />
      </main>

      <nav className="bg-[#16213e] border-t border-gray-700 grid grid-cols-4 safe-bottom">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 text-xs transition-colors ${
                isActive ? 'text-[#d4af37]' : 'text-gray-400'
              }`
            }
          >
            <span className="text-xl mb-0.5">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
