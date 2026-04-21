import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import { useStore } from '../store'
import { LayoutGrid, ClipboardList, Users, Settings, Home } from 'lucide-react'

/** 右上固定 5 アイコン (TRUST 準拠: ホール状況 / 注文 / 待機キャスト / 設定 / トップ) */
export default function GlobalNavBar() {
  const { user } = useAuth()
  const { tables, casts } = useStore()

  // バッジ: アラート卓数(残5分以下 or 超過)、待機キャスト(出勤中で未アサイン)
  const alertTables = tables.filter((t) => t.status === 'ending' || t.status === 'alert').length
  const assignedNames = new Set(tables.flatMap((t) => t.castNames))
  const waitingCasts = casts.filter((c) => c.active && !assignedNames.has(c.name)).length

  if (!user) return null

  const items: Array<{ to: string; label: string; Icon: typeof LayoutGrid; badge?: number; roles: string[] }> = [
    { to: '/floor', label: 'ホール', Icon: LayoutGrid, badge: alertTables, roles: ['owner', 'staff'] },
    { to: '/order', label: '注文', Icon: ClipboardList, roles: ['owner', 'staff'] },
    { to: '/waiting', label: '待機', Icon: Users, badge: waitingCasts, roles: ['owner', 'staff'] },
    { to: '/admin', label: '設定', Icon: Settings, roles: ['owner'] },
    { to: '/top', label: 'トップ', Icon: Home, roles: ['owner', 'staff'] },
  ]

  const visible = items.filter((i) => i.roles.includes(user.role))

  return (
    <nav className="flex items-center gap-2">
      {visible.map(({ to, label, Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-colors ${
              isActive
                ? 'bg-gold/20 text-gold'
                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          <Icon size={20} strokeWidth={1.75} />
          <span className="text-[10px] mt-0.5 tracking-wider">{label}</span>
          {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
