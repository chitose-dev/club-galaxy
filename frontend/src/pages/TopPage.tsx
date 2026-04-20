import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Sparkles, LayoutGrid, Users, Archive, TrendingUp } from 'lucide-react'

/** ログイン後のホーム。TRUST の「会計管理をはじめる」画面相当。 */
export default function TopPage() {
  const navigate = useNavigate()
  const { flMetrics, tables, storeSettings } = useStore()
  const { user } = useAuth()

  const occupied = tables.filter((t) => t.status !== 'empty').length
  const totalTables = tables.length

  return (
    <div className="min-h-full flex flex-col">
      {/* 本日売上赤帯 */}
      <div className="bg-gradient-to-r from-[#c9303f] via-[#e94560] to-[#c9303f] text-white px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm tracking-wider">本日の売上</span>
        <span className="text-2xl font-bold tabular-nums">¥{flMetrics.todaySales.toLocaleString()}</span>
      </div>

      {/* 中央ボタン */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12">
        <div className="text-center">
          <h2
            className="text-3xl sm:text-4xl font-semibold tracking-[0.3em] text-[#d4af37] mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {storeSettings.storeName}
          </h2>
          <p className="text-xs text-gray-400 tracking-widest">
            iPad Sales Manager {user && `/ ${user.displayName}`}
          </p>
        </div>

        <button
          onClick={() => navigate('/floor')}
          className="btn-gold text-xl px-10 py-5 flex items-center gap-3"
        >
          <Sparkles size={22} />
          会計管理をはじめる
        </button>

        <p className="text-sm text-gray-400 tracking-wider">お客様がいらっしゃいました♪</p>

        {/* クイックアクション */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl mt-6">
          <QuickAction icon={LayoutGrid} label="ホール" hint={`${occupied} / ${totalTables} 卓`} onClick={() => navigate('/floor')} />
          <QuickAction icon={Users} label="待機キャスト" onClick={() => navigate('/waiting')} />
          {user?.role === 'owner' && (
            <>
              <QuickAction icon={TrendingUp} label="利益" hint={`本日 ¥${flMetrics.todayProfit.toLocaleString()}`} onClick={() => navigate('/profit')} />
              <QuickAction icon={Archive} label="レジ締め" onClick={() => navigate('/register')} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, hint, onClick }: { icon: typeof LayoutGrid; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="panel p-4 flex flex-col items-center gap-1.5 hover:bg-white/10 transition-colors">
      <Icon size={22} className="text-[#d4af37]" strokeWidth={1.5} />
      <span className="text-sm text-white">{label}</span>
      {hint && <span className="text-[10px] text-gray-400 tabular-nums">{hint}</span>}
    </button>
  )
}
