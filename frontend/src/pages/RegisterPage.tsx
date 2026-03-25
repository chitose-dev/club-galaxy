import { useState, useMemo } from 'react'
import { useStore } from '../store'

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
    // Mixed: add cash portion to cash, card portion to card
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
        <h2 className="text-lg font-bold mb-4">レジ締め</h2>

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-400 mb-1">レジ初期値</div>
              <div className="text-lg font-bold">¥{initialCash.toLocaleString()}</div>
            </div>
            <button onClick={() => { setShowEditInitial(true); setTempInitial(String(initialCash)) }} className="bg-white/10 px-3 py-1.5 rounded-lg text-sm text-gray-300">変更</button>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-300">本日の売上</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">現金売上</span>
              <span>¥{salesSummary.cashSales.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">カード売上</span>
              <span>¥{salesSummary.cardSales.toLocaleString()}</span>
            </div>
            {salesSummary.totalCardFees > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">カード手数料合計</span>
                <span className="text-blue-400">¥{salesSummary.totalCardFees.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-2 flex justify-between text-sm font-bold">
              <span>売上合計</span>
              <span>¥{salesSummary.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {billingRecords.length > 0 && (
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-300">会計明細</h3>
            <div className="space-y-1">
              {billingRecords.map((r) => (
                <div key={r.id} className="flex justify-between text-sm">
                  <span className="text-gray-400">卓{r.tableNumber} ({r.timestamp})</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      r.paymentMethod === 'cash' ? 'bg-green-900/50 text-green-300' :
                      r.paymentMethod === 'card' ? 'bg-blue-900/50 text-blue-300' :
                      'bg-purple-900/50 text-purple-300'
                    }`}>
                      {paymentMethodLabel(r.paymentMethod)}
                    </span>
                    ¥{r.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-300">日払い支払</h3>
          {dailyPayRequests.length === 0 ? (
            <p className="text-sm text-gray-500">日払いなし</p>
          ) : (
            <div className="space-y-1 mb-2">
              {dailyPayRequests.map((r) => (
                <div key={r.id} className="flex justify-between text-sm">
                  <span className="text-gray-400">{r.castName} ({r.date})</span>
                  <span>¥{r.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-700 pt-2 flex justify-between text-sm font-bold">
            <span>日払い合計</span>
            <span className="text-red-400">-¥{dailyPayTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-xl p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-300">レジ計算</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">レジ初期値</span>
            <span>¥{initialCash.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">+ 現金売上</span>
            <span>¥{salesSummary.cashSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">- 日払い支払</span>
            <span className="text-red-400">-¥{dailyPayTotal.toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-600 pt-2 flex justify-between">
            <span className="font-bold">理論有高</span>
            <span className="font-bold text-xl">¥{theoreticalCash.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <label className="text-xs text-gray-400 block mb-1">実有高（実際のレジ内金額）</label>
          <input
            type="number"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            placeholder="金額を入力"
            className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-3 text-lg font-bold"
          />
        </div>

        {hasActualInput && (
          <div className={`rounded-xl p-4 mb-4 ${difference >= 0 ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
            <div className="flex justify-between items-center">
              <span className="font-bold">過不足</span>
              <span className={`font-bold text-2xl ${difference >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {difference >= 0 ? '+' : ''}¥{difference.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              実有高 ¥{actualCashNum.toLocaleString()} - 理論有高 ¥{theoreticalCash.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {showEditInitial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEditInitial(false)}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">レジ初期値変更</h2>
            <input
              type="number"
              value={tempInitial}
              onChange={(e) => setTempInitial(e.target.value)}
              className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowEditInitial(false)} className="flex-1 bg-white/10 py-3 rounded-lg font-bold text-gray-400">キャンセル</button>
              <button onClick={() => { setInitialCash(Number(tempInitial) || 100000); setShowEditInitial(false) }} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold">変更</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
