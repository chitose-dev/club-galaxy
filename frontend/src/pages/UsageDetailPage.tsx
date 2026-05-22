import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import {
  displayOrderName,
  getSetPriceForTime,
  SET_DURATION_MINUTES,
} from '../data/mock'
import {
  addMinutesToHHmm,
  formatTimeRange,
  getCurrentSetRange,
  getSetLabel,
} from '../utils/setCountLabel'
import ExtensionInheritanceModal from '../components/ExtensionInheritanceModal'
import { FileText, CreditCard, Trash2, ArrowLeft, Clock as ClockIcon } from 'lucide-react'

/**
 * TRUST の「利用明細」画面相当。
 * 卓 ID から現在のオーダー・セット料金・指名料などを一覧表示し、
 * 会計へ進む / 注文追加 / 明細行の削除ができる。
 *
 * ISSUE-010 反映: 「戻る」を遷移元に戻るよう、`?from=` クエリで上書き可能に。
 *   無指定時は BackButton 既定の `navigate(-1)`（履歴ベース）。
 */
export default function UsageDetailPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from') || undefined
  const { tables, removeOrderFromTable, storeSettings } = useStore()
  // spec.md §5.2: 延長押下 → キャスト継承選択モーダル → 確定で /table/:id/extend へ
  const [showExtModal, setShowExtModal] = useState(false)

  const table = useMemo(() => tables.find((t) => String(t.id) === params.id), [tables, params.id])

  if (!table) {
    return (
      <div className="p-8 text-center text-gray-400">
        卓が見つかりません。
        <div className="mt-4">
          <GhostButton onClick={() => navigate('/floor')}>ホールへ戻る</GhostButton>
        </div>
      </div>
    )
  }

  // 旧スキーマの卓ドキュメントだと配列フィールドが undefined で返ることがあり、
  // .length / .map / .reduce が即クラッシュ → ページ全体が真っ白になる。
  // render に使う配列フィールドは ?? [] で防御する。
  const assignedCasts = table.assignedCasts ?? []
  const mainNominations = table.mainNominationCastNames ?? []
  const orders = table.orders ?? []
  const extensionHistory = table.extensionHistory ?? []
  // 数値フィールドが null/undefined で来た場合の防御(NaN 計算 / NaN 表示の回避)
  const guestCount = table.guestCount ?? 0
  const setCount = table.setCount ?? 0

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const discountPerSet = table.setDiscountPerSet ?? 0
  const adjustedSetPrice = Math.max(0, setPrice - discountPerSet)
  const setSubtotal = adjustedSetPrice * guestCount * setCount
  const orderSubtotal = orders.reduce((s, o) => s + (o.menuItem?.price ?? 0) * o.quantity, 0)
  const subtotal = setSubtotal + orderSubtotal
  const tax = Math.round(subtotal * storeSettings.taxRate)
  const total = subtotal + tax

  // spec.md §4.1.1: 表頭の時間帯（HH:MM 〜 HH:MM）。
  //   開始 = startTime、終了 = startTime + 通常セット * 60 + 延長累計分。
  const sessionEnd = (() => {
    if (!table.startTime) return '-'
    const exMin = extensionHistory.reduce((s, e) => s + e.minutes, 0)
    const total = setCount * SET_DURATION_MINUTES + exMin
    const [h, m] = table.startTime.split(':').map(Number)
    const t = h * 60 + m + total
    const eh = Math.floor((t / 60) % 24)
    const em = t % 60
    return `${String((eh + 24) % 24).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  })()

  const handleExtensionConfirm = (config: import('../components/ExtensionInheritanceModal').ExtensionInheritanceConfig) => {
    setShowExtModal(false)
    navigate(`/table/${table.id}/extend`, { state: { config } })
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        accent="floor"
        title={`${table.number}卓 の利用明細`}
        // ISSUE-010: from クエリ優先、無ければ BackButton が navigate(-1) 既定動作
        backTo={from}
        // PDF指示: 時間帯表示は見出し側から外し、入店時刻欄に終了時刻まで含める。
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
          <div className="panel p-4 space-y-2">
            {/* PDF指示: 「指名状況」見出しは廃止、必要項目（対応中/担当/人数/入店時刻）のみ。 */}
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">対応中</span>
              <span className="text-sm">{assignedCasts.join(', ') || 'フリー'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">担当</span>
              <span className={`text-sm ${mainNominations.length > 0 ? 'text-gold' : ''}`}>
                {mainNominations.length > 0 ? mainNominations.join(', ') : 'フリー'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">人数</span>
              <span className="text-sm">{guestCount} 名</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">入店時刻</span>
              <span className="text-sm tabular-nums">
                {table.startTime
                  ? `${table.startTime} 〜 ${sessionEnd}`
                  : '-'}
              </span>
            </div>
            {(() => {
              const range = getCurrentSetRange(table)
              if (!range) return null
              return (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">現在のセット</span>
                  <span className="text-sm tabular-nums">
                    {getSetLabel(table)} {formatTimeRange(range.start, range.end)}
                  </span>
                </div>
              )
            })()}
          </div>

          <div className="panel p-4 space-y-2">
            {/* PDF指示: 「時間帯」行は廃止。セット料金 (Set種別 + 単価 × 人数 × セット数) と
                必要なら値引・小計のみを表示。 */}
            <h3 className="text-xs text-gray-400 tracking-wider mb-1">セット料金（{getSetLabel(table)}）</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">セット料金</span>
              <span className="tabular-nums">
                ¥{adjustedSetPrice.toLocaleString()} × {guestCount}名 × {setCount}セット
              </span>
            </div>
            {discountPerSet > 0 && (
              <div className="flex justify-between text-sm text-amber-300">
                <span>値引 / セット</span>
                <span className="tabular-nums">−¥{discountPerSet.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-white/10">
              <span className="text-sm text-gray-400">セット料金 小計</span>
              <span className="tabular-nums font-bold">¥{setSubtotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-4 panel p-4">
          <h3 className="text-xs text-gray-400 tracking-wider mb-3">注文明細 ({orders.length} 品)</h3>
          {orders.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">注文なし</div>
          ) : (
            <div className="divide-y divide-white/5">
              {orders.map((o, idx) => {
                // menuItem 自体が undefined のケースもガードする(displayOrderName は
                // 内部で o.menuItem.name を参照するため、ここでフォールバック表示する)。
                const price = o.menuItem?.price ?? 0
                const itemId = o.menuItem?.id
                const label = o.menuItem ? displayOrderName(o) : '(商品情報なし)'
                return (
                  <div key={`${itemId ?? `idx-${idx}`}-${o.castName ?? ''}-${idx}`} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{label}</div>
                      {o.castName && <div className="text-[10px] text-gold tracking-wider">→ {o.castName}</div>}
                    </div>
                    <div className="text-sm text-gray-400 tabular-nums shrink-0 w-24 text-right">
                      ¥{price.toLocaleString()} × {o.quantity}
                    </div>
                    <div className="text-sm tabular-nums shrink-0 w-24 text-right font-bold">
                      ¥{(price * o.quantity).toLocaleString()}
                    </div>
                    <button
                      onClick={() => itemId !== undefined && removeOrderFromTable(table.id, itemId, o.castName)}
                      disabled={itemId === undefined}
                      className="shrink-0 p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="数量を1減らす"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {/* ② 金額ペイン常時展開: トグル削除、小計 → TAX → 合計(税込) の縦並びを常に表示。 */}
          <div className="mt-4 pt-3 border-t border-white/10 space-y-1">
            <div className="flex justify-between text-sm text-gray-400">
              <span>小計</span>
              <span className="tabular-nums">¥{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>TAX ({Math.round(storeSettings.taxRate * 100)}%)</span>
              <span className="tabular-nums">¥{tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
              <span className="text-base text-gold font-bold">合計 (税込)</span>
              <span className="text-4xl tabular-nums font-bold text-gold">¥{total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* PDF指示: 延長履歴は EX(n) / EX(n)半 ラベル + 時間レンジで表示する。 */}
        {extensionHistory.length > 0 && table.startTime && (() => {
          let cursor = addMinutesToHHmm(table.startTime, SET_DURATION_MINUTES)
          return (
            <div className="max-w-4xl mx-auto mt-4 panel p-4">
              <h3 className="text-xs text-gray-400 tracking-wider mb-3">延長履歴</h3>
              <div className="space-y-1 text-sm">
                {extensionHistory.map((ex, i) => {
                  const start = cursor
                  const end = addMinutesToHHmm(start, ex.minutes)
                  cursor = end
                  const label = ex.minutes === 30 ? `EX(${i + 1})半` : `EX(${i + 1})`
                  return (
                    <div key={ex.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
                      <span className="tabular-nums text-gray-200">{formatTimeRange(start, end)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      {/* spec.md §4.2: 画面下に [戻る][延長][注文を追加][会計] の4ボタン。
          [延長] は ExtensionInheritanceModal（§5.2）→ /table/:id/extend（§5.3）に進む。 */}
      <BottomActionBar
        center={
          <div className="flex gap-2 flex-wrap justify-center">
            <GhostButton
              onClick={() => (from ? navigate(from) : navigate(-1))}
              className="text-sm flex items-center gap-1"
            >
              <ArrowLeft size={15} /> 戻る
            </GhostButton>
            <DarkButton
              onClick={() => setShowExtModal(true)}
              className="text-sm flex items-center gap-1"
            >
              <ClockIcon size={15} /> 延長
            </DarkButton>
            <DarkButton
              onClick={() => navigate(
                `/order?table=${table.id}&from=${encodeURIComponent(`/table/${table.id}`)}`,
              )}
              className="text-sm flex items-center gap-1"
            >
              <FileText size={15} /> 注文を追加
            </DarkButton>
            <DangerButton
              onClick={() => navigate(`/billing?table=${table.id}`)}
              className="text-sm flex items-center gap-1"
            >
              <CreditCard size={15} /> 会計
            </DangerButton>
          </div>
        }
      />

      <ExtensionInheritanceModal
        open={showExtModal}
        table={table}
        onClose={() => setShowExtModal(false)}
        onConfirm={handleExtensionConfirm}
      />
    </div>
  )
}
