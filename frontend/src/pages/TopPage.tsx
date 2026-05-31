import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { LayoutGrid, Users, Archive, TrendingUp, Wallet } from 'lucide-react'

/** ログイン後のホーム。TRUST の「会計管理をはじめる」画面相当。 */
export default function TopPage() {
  const navigate = useNavigate()
  const { flMetrics, tables, casts, storeSettings } = useStore()
  const { user } = useAuth()

  const occupied = tables.filter((t) => t.status !== 'empty').length
  const totalTables = tables.length
  const activeCasts = casts.filter((c) => c.active).length
  const isCast = user?.role === 'cast'

  const roleLabel =
    user?.role === 'owner' ? 'Owner' : user?.role === 'cast' ? 'Cast' : 'Staff'

  return (
    <div className="min-h-full flex flex-col">
      {/* 本日売上赤帯 — オーナー/黒服のみ表示 (キャストは店舗売上非公開) */}
      {!isCast && (
        <div className="bg-gradient-to-r from-[#c9303f] via-accent to-[#c9303f] text-white px-4 h-[56px] flex items-center justify-between shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
          <span className="text-sm tracking-wider">本日の売上</span>
          <span className="text-2xl font-bold tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            ¥{flMetrics.todaySales.toLocaleString()}
          </span>
        </div>
      )}

      {/* 中央 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-10">
        <div className="text-center">
          <h2
            className="text-3xl sm:text-4xl font-semibold tracking-[0.3em] text-gold mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {storeSettings.storeName}
          </h2>
          <div className="h-px bg-gold/60 w-24 mx-auto mb-2" />
          <p className="text-[11px] text-gray-400 tracking-[0.25em] uppercase">
            {roleLabel} {user && `/ ${user.displayName}`}
          </p>
        </div>

        {isCast ? (
          <button
            onClick={() => navigate('/salary')}
            className="btn-gold text-lg px-10 py-4 tracking-wider"
          >
            給与を確認する
          </button>
        ) : (
          <button
            onClick={() => navigate('/floor')}
            className="btn-gold text-lg px-10 py-4 tracking-wider"
          >
            会計管理をはじめる
          </button>
        )}

        {/* クイックアクション — role 別 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-3xl mt-4">
          {isCast ? (
            <QuickAction
              icon={Wallet}
              label="給与明細"
              hint="自分の勤怠・給与"
              onClick={() => navigate('/salary')}
            />
          ) : (
            <>
              <QuickAction
                icon={LayoutGrid}
                label="ホール"
                hint={`${occupied} / ${totalTables} 卓`}
                onClick={() => navigate('/floor')}
              />
              <QuickAction
                icon={Users}
                label="待機キャスト"
                hint={`出勤 ${activeCasts} 名`}
                onClick={() => navigate('/waiting')}
              />
              {user?.role === 'owner' && (
                <>
                  <QuickAction
                    icon={TrendingUp}
                    label="利益"
                    hint={`本日 ¥${flMetrics.todayProfit.toLocaleString()}`}
                    onClick={() => navigate('/profit')}
                  />
                  <QuickAction
                    icon={Wallet}
                    label="給与"
                    hint="給与明細・日払い"
                    onClick={() => navigate('/salary')}
                  />
                  <QuickAction icon={Archive} label="レジ締め" onClick={() => navigate('/register')} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof LayoutGrid
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="panel p-4 flex flex-col items-center gap-1.5 transition-all duration-150 hover:border-gold/40 hover:bg-gold/5 active:translate-y-px"
    >
      <Icon size={22} className="text-gold" strokeWidth={1.5} />
      <span className="text-sm text-white font-medium">{label}</span>
      {hint && <span className="text-[10px] text-gray-400 tabular-nums">{hint}</span>}
    </button>
  )
}
