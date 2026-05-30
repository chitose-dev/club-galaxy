import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import { getSetPriceForTime } from '../data/mock'
import {
  buildSetTimeRanges,
  formatTimeRange,
  getSetLabel,
} from '../utils/setCountLabel'
import ExtensionInheritanceModal from '../components/ExtensionInheritanceModal'
import {
  calcVisitBreakdown,
  buildVisitBreakdownInput,
  allocatePerSetTax,
} from '../utils/calcVisitBreakdown'
import { FileText, CreditCard, Trash2, ArrowLeft, Clock as ClockIcon } from 'lucide-react'

/**
 * TRUST の「利用明細」画面相当。
 * 卓 ID から現在の利用内訳をセット単位（1Set目 / EX(1) / EX(2)…）で表示し、
 * 会計へ進む / 注文追加 / 明細行の削除ができる。
 *
 * セット別表示: 各セットで「セット料金・指名料・注文・小計・TAX・合計」を分けて出す。
 * 注文は所属セット（setSequence）内に表示する（全体一括の「注文(N品)」表示はしない）。
 * 金額は会計 BillingPage と同じ calcVisitBreakdown を経由し、TAX はセット小計按分で
 * セットごとに割り当てる（Σ＝visit の TAX）。
 *
 * 時刻は buildSetTimeRanges を唯一のソースにし、各セットの時刻と「現在のセット」表示の
 * ズレを無くす（旧実装は現セットを延長 timestamp、履歴を入店からの累積で出していて不一致だった）。
 *
 * ISSUE-010 反映: 「戻る」を遷移元に戻るよう、`?from=` クエリで上書き可能に。
 */
export default function UsageDetailPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from') || undefined
  const { tables, removeOrderFromTable, storeSettings, setPrices, chargeItems } = useStore()
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
  // .length / .map / .reduce が即クラッシュ → ページ全体が真っ白になる。防御する。
  const assignedCasts = table.assignedCasts ?? []
  const mainNominations = table.mainNominationCastNames ?? []
  const guestCount = table.guestCount ?? 0
  const discountPerSet = table.setDiscountPerSet ?? 0

  // セット単位の正準計算（会計 BillingPage と同じ calcVisitBreakdown）。
  // 延長料金・per-set 指名料込みで、利用明細の小計/合計を会計と一致させる。
  const setPrice = table.startTime ? getSetPriceForTime(table.startTime, setPrices) : 0
  const visitBreakdown = calcVisitBreakdown(buildVisitBreakdownInput(table, {
    baseSetUnit: setPrice,
    extPrice30: storeSettings.extensionPrice30Min ?? 0,
    extPrice60: storeSettings.extensionPrice60Min ?? 0,
    honShimeiUnit: chargeItems.find((c) => c.id === 'shimei')?.price ?? 0,
    banaiUnit: chargeItems.find((c) => c.id === 'banai')?.price ?? 0,
    douhanUnit: chargeItems.find((c) => c.id === 'douhan')?.price ?? 0,
    taxRate: storeSettings.taxRate,
  }))
  // TAX をセット小計按分でセットごとに割り当て（Σ = visitBreakdown.tax）。
  const perSetTax = allocatePerSetTax(visitBreakdown)
  // 各セット（1Set目 / EX(n)）の時刻レンジ。sets と 1:1 で並ぶ唯一の時刻ソース。
  const timeRanges = buildSetTimeRanges(table)
  const sessionEnd = timeRanges[timeRanges.length - 1]?.end ?? '-'
  const currentRange = timeRanges[timeRanges.length - 1] ?? null
  const taxPct = Math.round(storeSettings.taxRate * 100)

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
      />

      <div className="flex-1 overflow-y-auto p-4">
        {/* 来店情報 */}
        <div className="max-w-4xl mx-auto panel p-4 space-y-2">
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
              {table.startTime ? `${table.startTime} 〜 ${sessionEnd}` : '-'}
            </span>
          </div>
          {currentRange && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">現在のセット</span>
              <span className="text-sm tabular-nums">
                {getSetLabel(table)} {formatTimeRange(currentRange.start, currentRange.end)}
              </span>
            </div>
          )}
        </div>

        {/* セット別明細: 1Set目 / EX(1) / EX(2) … ごとに
            セット料金・指名料・注文・小計・TAX・合計 を分けて表示する。 */}
        <div className="max-w-4xl mx-auto mt-4 space-y-3">
          {visitBreakdown.sets.map((set, i) => {
            const range = timeRanges[i]
            const tax = perSetTax[i] ?? 0
            const total = set.subtotal + tax
            const isBase = set.kind === 'base'
            return (
              <div
                key={`${set.kind}-${i}`}
                className={`panel p-4 border-l-4 ${isBase ? 'border-gold/50' : 'border-accent/50'}`}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className={`text-sm font-bold ${isBase ? 'text-gold' : 'text-accent'}`}>
                    {set.label}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">
                    {range ? `${formatTimeRange(range.start, range.end)}・${set.minutes}分` : `${set.minutes}分`}
                  </span>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">セット料金</span>
                    <span className="tabular-nums">¥{set.setFee.toLocaleString()}</span>
                  </div>
                  {isBase && discountPerSet > 0 && (
                    <div className="text-xs text-amber-300">
                      （セット値引 反映済 −¥{discountPerSet.toLocaleString()} / 名）
                    </div>
                  )}
                  {set.honShimeiCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">本指名料（{set.honShimeiCount}名）</span>
                      <span className="tabular-nums">¥{set.honShimeiFee.toLocaleString()}</span>
                    </div>
                  )}
                  {set.banaiCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">場内指名料（{set.banaiCount}名）</span>
                      <span className="tabular-nums">¥{set.banaiFee.toLocaleString()}</span>
                    </div>
                  )}
                  {set.douhanCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">同伴（{set.douhanCount}名）</span>
                      <span className="tabular-nums">¥{set.douhanFee.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* このセットに属する注文（setSequence で振り分け済み）。 */}
                <div className="mt-3 pt-2 border-t border-white/10">
                  <div className="text-[11px] text-gray-500 tracking-wider mb-1">
                    注文（{set.orderLines.length}品）
                  </div>
                  {set.orderLines.length === 0 ? (
                    <div className="text-xs text-gray-600 py-1">注文なし</div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {set.orderLines.map((o, j) => (
                        <div
                          key={`${o.menuItemId ?? `idx-${j}`}-${o.castName ?? ''}-${j}`}
                          className="flex items-center justify-between py-1.5 gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">
                              {o.name}{o.quantity > 1 ? ` × ${o.quantity}` : ''}
                            </div>
                            {o.castName && <div className="text-[10px] text-gold tracking-wider">→ {o.castName}</div>}
                          </div>
                          <div className="text-sm tabular-nums shrink-0 w-24 text-right font-bold">
                            ¥{(o.price * o.quantity).toLocaleString()}
                          </div>
                          <button
                            onClick={() => o.menuItemId !== undefined && removeOrderFromTable(table.id, o.menuItemId, o.castName, o.setSequence)}
                            disabled={o.menuItemId === undefined}
                            className="shrink-0 p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="数量を1減らす"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* このセットの 小計 / TAX / 合計 */}
                <div className="mt-3 pt-2 border-t border-white/10 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>小計</span>
                    <span className="tabular-nums">¥{set.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>TAX ({taxPct}%)</span>
                    <span className="tabular-nums">¥{tax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold">合計（税込）</span>
                    <span className="text-lg tabular-nums font-bold">¥{total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 全セット合算（会計対象の総額）。 */}
        <div className="max-w-4xl mx-auto mt-4 panel p-4 space-y-1">
          <h3 className="text-xs text-gray-400 tracking-wider mb-2">合計（全セット）</h3>
          <div className="flex justify-between text-sm text-gray-400">
            <span>小計</span>
            <span className="tabular-nums">¥{visitBreakdown.subtotalBeforeTax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>TAX ({taxPct}%)</span>
            <span className="tabular-nums">¥{visitBreakdown.tax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
            <span className="text-base text-gold font-bold">合計 (税込)</span>
            <span className="text-4xl tabular-nums font-bold text-gold">¥{visitBreakdown.total.toLocaleString()}</span>
          </div>
        </div>
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
