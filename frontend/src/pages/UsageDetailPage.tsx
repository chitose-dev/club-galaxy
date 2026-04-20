import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import { displayOrderName, getSetPriceForTime, getSetPriceLabel, nominationLabels } from '../data/mock'
import { FileText, CreditCard, Trash2 } from 'lucide-react'

/**
 * TRUST の「利用明細」画面相当。
 * 卓 ID から現在のオーダー・セット料金・指名料などを一覧表示し、
 * 会計へ進む / 注文追加 / 明細行の削除ができる。
 */
export default function UsageDetailPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const { tables, removeOrderFromTable, storeSettings } = useStore()

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
        title={`卓 ${table.number} の利用明細`}
        backTo="/floor"
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
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">担当</span>
              <span className="text-sm">{table.castNames.join(', ') || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">指名タイプ</span>
              <span className="text-sm">{table.nomination ? nominationLabels[table.nomination] : '-'}</span>
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
                    {o.castName && <div className="text-[10px] text-[#d4af37] tracking-wider">→ {o.castName}</div>}
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
          <div className="mt-4 pt-3 border-t border-white/10 space-y-1">
            <div className="flex justify-between text-sm text-gray-400">
              <span>ドリンク・フード小計</span>
              <span className="tabular-nums">¥{orderSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>TAX {Math.round(storeSettings.taxRate * 100)}%</span>
              <span className="tabular-nums">¥{tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/10 text-lg">
              <span className="text-[#d4af37] font-bold">合計</span>
              <span className="tabular-nums font-bold text-[#d4af37]">¥{total.toLocaleString()}</span>
            </div>
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
          <DarkButton
            onClick={() => navigate(`/order?table=${table.id}`)}
            className="text-sm flex items-center gap-1"
          >
            <FileText size={15} /> 注文追加
          </DarkButton>
        }
      />
    </div>
  )
}
