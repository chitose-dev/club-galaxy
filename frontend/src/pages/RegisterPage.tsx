import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { Pencil, X } from 'lucide-react'

export default function RegisterPage() {
  const { billingRecords, dailyPayRequests, storeSettings } = useStore()

  const [initialCash, setInitialCash] = useState(storeSettings.initialCash)
  const [actualCash, setActualCash] = useState('')
  const [showEditInitial, setShowEditInitial] = useState(false)
  const [tempInitial, setTempInitial] = useState('')

  const salesSummary = useMemo(() => {
    const cashSales = billingRecords
      .filter((r) => r.paymentMethod === 'cash')
      .reduce((s, r) => s + r.total, 0)
    const cardSales = billingRecords
      .filter((r) => r.paymentMethod === 'card')
      .reduce((s, r) => s + r.total, 0)
    const mixedCash = billingRecords
      .filter((r) => r.paymentMethod === 'mixed')
      .reduce((s, r) => s + (r.cashAmount ?? 0), 0)
    const mixedCard = billingRecords
      .filter((r) => r.paymentMethod === 'mixed')
      .reduce((s, r) => s + (r.cardAmount ?? 0), 0)
    const totalCardFees = billingRecords.reduce((s, r) => s + (r.cardFee ?? 0), 0)
    return {
      cashSales: cashSales + mixedCash,
      cardSales: cardSales + mixedCard,
      total: cashSales + cardSales + mixedCash + mixedCard,
      totalCardFees,
    }
  }, [billingRecords])

  const dailyPayTotal = useMemo(() => {
    return dailyPayRequests.reduce((s, r) => s + r.amount, 0)
  }, [dailyPayRequests])

  const theoreticalCash = initialCash + salesSummary.cashSales - dailyPayTotal
  const actualCashNum = Number(actualCash) || 0
  const difference = actualCashNum - theoreticalCash
  const hasActualInput = actualCash !== ''

  const paymentMethodLabel = (m: string) => m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 pb-6">
        <h2 className="text-lg font-bold mb-4 text-[#d4af37]" style={{ fontFamily: "var(--font-display)" }}>レジ締め</h2>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500 mb-1">レジ初期値</div>
              <div className="text-lg font-bold tabular-nums">¥{initialCash.toLocaleString()}</div>
            </div>
            <button onClick={() => { setShowEditInitial(true); setTempInitial(String(initialCash)) }} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-sm text-gray-400 flex items-center gap-1.5 hover:border-[#d4af37]/30 transition-colors">
              <Pencil size={12} /> 変更
            </button>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-400">本日の売上</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">現金売上</span>
              <span className="tabular-nums">¥{salesSummary.cashSales.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">カード売上</span>
              <span className="tabular-nums">¥{salesSummary.cardSales.toLocaleString()}</span>
            </div>
            {salesSummary.totalCardFees > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">カード手数料合計</span>
                <span className="text-blue-400 tabular-nums">¥{salesSummary.totalCardFees.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
              <span>売上合計</span>
              <span className="text-[#d4af37] tabular-nums">¥{salesSummary.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {billingRecords.length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-400">会計明細</h3>
            <div className="divide-y divide-white/5">
              {billingRecords.map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1.5">
                  <span className="text-gray-500">卓{r.tableNumber} ({r.timestamp})</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      r.paymentMethod === 'cash' ? 'bg-emerald-500/10 text-emerald-400' :
                      r.paymentMethod === 'card' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-purple-500/10 text-purple-400'
                    }`}>
                      {paymentMethodLabel(r.paymentMethod)}
                    </span>
                    <span className="tabular-nums">¥{r.total.toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-400">日払い支払</h3>
          {dailyPayRequests.length === 0 ? (
            <p className="text-sm text-gray-600">日払いなし</p>
          ) : (
            <div className="divide-y divide-white/5 mb-2">
              {dailyPayRequests.map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1.5">
                  <span className="text-gray-500">{r.castName} ({r.date})</span>
                  <span className="tabular-nums">¥{r.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
            <span>日払い合計</span>
            <span className="text-red-400 tabular-nums">-¥{dailyPayTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-[#16213e] border border-white/10 rounded-xl p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-400">レジ計算</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">レジ初期値</span>
            <span className="tabular-nums">¥{initialCash.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">+ 現金売上</span>
            <span className="tabular-nums">¥{salesSummary.cashSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">- 日払い支払</span>
            <span className="text-red-400 tabular-nums">-¥{dailyPayTotal.toLocaleString()}</span>
          </div>
          <div className="border-t border-white/10 pt-2 flex justify-between">
            <span className="font-bold">理論有高</span>
            <span className="font-bold text-xl text-[#d4af37] tabular-nums">¥{theoreticalCash.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <label className="text-xs text-gray-500 block mb-1.5">実有高（実際のレジ内金額）</label>
          <input
            type="number"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            placeholder="金額を入力"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-lg font-bold"
          />
        </div>

        {hasActualInput && (
          <div className={`rounded-xl p-4 mb-4 ${difference >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
            <div className="flex justify-between items-center">
              <span className="font-bold">過不足</span>
              <span className={`font-bold text-2xl tabular-nums ${difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {difference >= 0 ? '+' : ''}¥{difference.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1 tabular-nums">
              実有高 ¥{actualCashNum.toLocaleString()} - 理論有高 ¥{theoreticalCash.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {showEditInitial && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowEditInitial(false)}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">レジ初期値変更</h2>
              <button onClick={() => setShowEditInitial(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <input
              type="number"
              value={tempInitial}
              onChange={(e) => setTempInitial(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowEditInitial(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
              <button onClick={() => { setInitialCash(Number(tempInitial) || 100000); setShowEditInitial(false) }} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold">変更</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
