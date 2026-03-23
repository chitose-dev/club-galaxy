import { useState } from 'react'
import { useStore } from '../store'
import { getSetPriceForTime, getSetPriceLabel, chargeItems, nominationLabels } from '../data/mock'

type PaymentMethod = 'cash' | 'card'

export default function BillingPage() {
  const { tables, resetTable } = useStore()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const [selectedTableId, setSelectedTableId] = useState<number>(occupiedTables[0]?.id ?? 0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cardAmount, setCardAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const table = tables.find((t) => t.id === selectedTableId)

  if (!table || table.status === 'empty') {
    return (
      <div className="p-4 text-center text-gray-400 mt-20">
        <p className="text-lg mb-2">会計対象の卓がありません</p>
        <p className="text-sm">フロアから卓を選択してください</p>
      </div>
    )
  }

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const setPriceTotal = setPrice * table.guestCount * table.setCount

  const nominationCharge = (() => {
    if (!table.nomination) return 0
    const found = chargeItems.find((c) => c.id === table.nomination)
    return found?.price ?? 0
  })()

  const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)
  const subtotal = setPriceTotal + nominationCharge + drinkTotal
  const tax = Math.floor(subtotal * 0.2)
  const consumptionTax = Math.floor((subtotal + tax) * 0.1)
  const total = subtotal + tax + consumptionTax - discount

  const handleComplete = () => {
    resetTable(table.id)
    setShowConfirm(false)
    setSelectedTableId(occupiedTables.find((t) => t.id !== table.id)?.id ?? 0)
  }

  return (
    <div className="p-4 pb-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-400">卓:</span>
        <select value={selectedTableId} onChange={(e) => setSelectedTableId(Number(e.target.value))} className="bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm">
          {occupiedTables.map((t) => (
            <option key={t.id} value={t.id}>{t.number} ({t.castNames.join(',')})</option>
          ))}
        </select>
      </div>

      <div className="bg-white/5 rounded-xl p-4 mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">担当: {table.castNames.join(', ')}</span>
          <span className="text-gray-400">{table.guestCount}名</span>
        </div>
        <div className="text-xs text-gray-500">
          {table.startTime}〜 / {table.nomination ? nominationLabels[table.nomination] : 'フリー'}
          {table.setCount > 1 && ` / ${table.setCount}セット`}
        </div>
      </div>

      <div className="bg-white/5 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-bold mb-3 text-gray-300">明細</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>セット料金 ({table.startTime ? getSetPriceLabel(table.startTime) : '-'})<span className="text-gray-400"> x{table.guestCount}名 x{table.setCount}セット</span></span>
            <span>¥{setPriceTotal.toLocaleString()}</span>
          </div>
          {nominationCharge > 0 && (
            <div className="flex justify-between text-sm">
              <span>{table.nomination ? nominationLabels[table.nomination] : ''}</span>
              <span>¥{nominationCharge.toLocaleString()}</span>
            </div>
          )}
          {table.orders.map((o) => (
            <div key={o.menuItem.id} className="flex justify-between text-sm">
              <span>{o.menuItem.name}{o.quantity > 1 && <span className="text-gray-400"> x{o.quantity}</span>}</span>
              <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setPaymentMethod('cash')} className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-colors ${paymentMethod === 'cash' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-gray-600 text-gray-400'}`}>現金</button>
        <button onClick={() => setPaymentMethod('card')} className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-colors ${paymentMethod === 'card' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-gray-600 text-gray-400'}`}>カード (S1EP)</button>
      </div>

      {paymentMethod === 'card' && (
        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <label className="text-xs text-gray-400 block mb-1">カード決済金額（端末に手入力）</label>
          <input type="number" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} placeholder={`¥${total.toLocaleString()}`} className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">※外部端末(S1EP)に上記金額を手入力してください</p>
        </div>
      )}

      <div className="bg-white/5 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-bold mb-2 text-gray-300">特別値引き</h3>
        <input type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="金額" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
        {discount > 0 && (
          <div className="mt-2">
            <input type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="値引き理由（必須）" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
            {!discountReason && <p className="text-xs text-red-400 mt-1">理由を入力してください</p>}
          </div>
        )}
      </div>

      <div className="bg-[#16213e] rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm"><span className="text-gray-400">小計</span><span>¥{subtotal.toLocaleString()}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-400">TAX (20%)</span><span>¥{tax.toLocaleString()}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-400">消費税 (10%)</span><span>¥{consumptionTax.toLocaleString()}</span></div>
        {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span>-¥{discount.toLocaleString()}</span></div>}
        <div className="border-t border-gray-600 pt-2 flex justify-between">
          <span className="font-bold text-lg">合計</span>
          <span className="font-bold text-2xl text-[#d4af37]">¥{total.toLocaleString()}</span>
        </div>
      </div>

      <button onClick={() => setShowConfirm(true)} disabled={discount > 0 && !discountReason} className="w-full mt-4 bg-[#e94560] py-4 rounded-xl text-lg font-bold active:bg-[#c73550] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">会計確定</button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-3">会計確定</h2>
            <p className="text-sm text-gray-300 mb-2">卓 {table.number} の会計を確定しますか？</p>
            <p className="text-2xl font-bold text-[#d4af37] mb-4">¥{total.toLocaleString()}</p>
            <p className="text-sm text-gray-400 mb-4">支払方法: {paymentMethod === 'cash' ? '現金' : 'カード'}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-white/10 py-3 rounded-lg font-bold text-gray-400">戻る</button>
              <button onClick={handleComplete} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
