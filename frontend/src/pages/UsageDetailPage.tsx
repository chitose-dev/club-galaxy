import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import { displayOrderName, getSetPriceForTime, getSetPriceLabel } from '../data/mock'
import { FileText, CreditCard, Trash2 } from 'lucide-react'

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
  // ISSUE-005: 内訳の折りたたみ（デフォルト非表示で合計を強調）
  const [showBreakdown, setShowBreakdown] = useState(false)

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

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const discountPerSet = table.setDiscountPerSet ?? 0
  const adjustedSetPrice = Math.max(0, setPrice - discountPerSet)
  const setSubtotal = adjustedSetPrice * table.guestCount * table.setCount
  const orderSubtotal = table.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
  const subtotal = setSubtotal + orderSubtotal
  const tax = Math.round(subtotal * storeSettings.taxRate)
  const total = subtotal + tax

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        accent="floor"
        title={`卓 ${table.number} の利用明細`}
        // ISSUE-010: from クエリ優先、無ければ BackButton が navigate(-1) 既定動作
        backTo={from}
        right={
          <DarkButton
            onClick={() => navigate(`/order?table=${table.id}`)}
            className="text-sm flex items-center gap-1"
          >
            <FileText size={15} /> 注文追加
          </DarkButton>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
          <div className="panel p-4 space-y-2">
            <h3 className="text-xs text-gray-400 tracking-wider mb-1">指名状況</h3>
            {/* 追補02 R1-7: 「対応中」(現在接客中) と「本指名」を区別 */}
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">対応中</span>
              <span className="text-sm">{table.assignedCasts.join(', ') || '担当なし'}</span>
            </div>
            {/* spec.md §3.2.2: 「指名タイプ」ラベル → 「担当」。本指名がいればキャスト名を
                カンマ区切りで動的表示し、いなければ「フリー」と表示する。 */}
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">担当</span>
              <span className={`text-sm ${table.mainNominationCastNames.length > 0 ? 'text-gold' : ''}`}>
                {table.mainNominationCastNames.length > 0
                  ? table.mainNominationCastNames.join(', ')
                  : 'フリー'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">人数</span>
              <span className="text-sm">{table.guestCount} 名</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">入店時刻</span>
              <span className="text-sm tabular-nums">{table.startTime ?? '-'}</span>
            </div>
          </div>

          <div className="panel p-4 space-y-2">
            <h3 className="text-xs text-gray-400 tracking-wider mb-1">セット料金</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">料金</span>
              <span className="tabular-nums">
                ¥{adjustedSetPrice.toLocaleString()} × {table.guestCount}名 × {table.setCount}セット
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">時間帯</span>
              <span>{table.startTime ? getSetPriceLabel(table.startTime) : '-'}</span>
            </div>
            {discountPerSet > 0 && (
              <div className="flex justify-between text-sm text-amber-300">
                <span>値引 / セット</span>
                <span className="tabular-nums">−¥{discountPerSet.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-white/10">
              <span className="text-sm text-gray-400">セット小計</span>
              <span className="tabular-nums font-bold">¥{setSubtotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-4 panel p-4">
          <h3 className="text-xs text-gray-400 tracking-wider mb-3">注文明細 ({table.orders.length} 品)</h3>
          {table.orders.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">注文なし</div>
          ) : (
            <div className="divide-y divide-white/5">
              {table.orders.map((o, idx) => (
                <div key={`${o.menuItem.id}-${o.castName ?? ''}-${idx}`} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{displayOrderName(o)}</div>
                    {o.castName && <div className="text-[10px] text-gold tracking-wider">→ {o.castName}</div>}
                  </div>
                  <div className="text-sm text-gray-400 tabular-nums shrink-0 w-24 text-right">
                    ¥{o.menuItem.price.toLocaleString()} × {o.quantity}
                  </div>
                  <div className="text-sm tabular-nums shrink-0 w-24 text-right font-bold">
                    ¥{(o.menuItem.price * o.quantity).toLocaleString()}
                  </div>
                  <button
                    onClick={() => removeOrderFromTable(table.id, o.menuItem.id, o.castName)}
                    className="shrink-0 p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-red-400"
                    aria-label="数量を1減らす"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* ISSUE-005: 合計を最大フォントで強調、内訳は折りたたみ（デフォルト非表示） */}
          <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-base text-gold font-bold">合計 (税込)</span>
              <span className="text-4xl tabular-nums font-bold text-gold">¥{total.toLocaleString()}</span>
            </div>
            {showBreakdown && (
              <div className="space-y-1 pt-2 border-t border-white/10">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>ドリンク・フード小計</span>
                  <span className="tabular-nums">¥{orderSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>TAX {Math.round(storeSettings.taxRate * 100)}%</span>
                  <span className="tabular-nums">¥{tax.toLocaleString()}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full text-xs text-gray-400 hover:text-gold py-1 transition-colors"
            >
              {showBreakdown ? '▲ 内訳を隠す' : '▼ 内訳を表示（小計・TAX）'}
            </button>
          </div>
        </div>
      </div>

      <BottomActionBar
        leftLabel="合計"
        leftValue={`¥${total.toLocaleString()}`}
        center={
          <DangerButton
            onClick={() => navigate(`/billing?table=${table.id}`)}
            className="text-base px-6 flex items-center gap-2"
          >
            <CreditCard size={18} /> 会計へ
          </DangerButton>
        }
        right={
          // ビデオレビュー N15: 利用明細から延長交渉ボタンへの導線追加
          <div className="flex gap-1.5">
            <DarkButton
              // ISSUE-010: 延長交渉モーダル経由でも /table/:id に戻れるよう from を付与
              onClick={() => navigate(`/floor?action=extend&table=${table.id}&from=${encodeURIComponent(`/table/${table.id}`)}`)}
              className="text-sm flex items-center gap-1"
              title="ご延長交渉印字を表示 (ホール画面で卓を開いて印字)"
            >
              <FileText size={15} /> 延長交渉
            </DarkButton>
            <DarkButton
              onClick={() => navigate(`/order?table=${table.id}`)}
              className="text-sm flex items-center gap-1"
            >
              <FileText size={15} /> 注文追加
            </DarkButton>
          </div>
        }
      />
    </div>
  )
}
