import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { sampleDailyWork, type BackType, type DailyWork } from '../data/mock'

type Period = 'first' | 'second'

export default function SalaryPage() {
  const { casts, dailyPayRequests, addDailyPayRequest } = useStore()
  const activeCasts = casts.filter((c) => c.active)

  const [selectedCastId, setSelectedCastId] = useState<number>(activeCasts[0]?.id ?? 0)
  const [period, setPeriod] = useState<Period>('first')
  const [showDailyPay, setShowDailyPay] = useState(false)
  const [dailyPayAmount, setDailyPayAmount] = useState('')

  const cast = casts.find((c) => c.id === selectedCastId)
  const dailyWork: DailyWork[] = sampleDailyWork[selectedCastId] ?? []

  // 期間フィルタ
  const filteredWork = useMemo(() => {
    return dailyWork.filter((w) => {
      const day = parseInt(w.date.split('/')[1], 10)
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [dailyWork, period])

  // 集計
  const totalHours = filteredWork.reduce((s, w) => s + w.hours, 0)
  const totalSales = filteredWork.reduce((s, w) => s + w.sales, 0)

  // バック合計金額
  const totalBackAmount = useMemo(() => {
    if (!cast) return 0
    let total = 0
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        total += (cast.backRates[type] ?? 0) * count
      }
    }
    return total
  }, [filteredWork, cast])

  // バック件数集計
  const backTotals = useMemo(() => {
    const totals: Partial<Record<BackType, number>> = {}
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        totals[type] = (totals[type] ?? 0) + count
      }
    }
    return totals
  }, [filteredWork])

  // 日払い合計
  const dailyPayTotal = useMemo(() => {
    return dailyPayRequests
      .filter((r) => r.castId === selectedCastId)
      .reduce((s, r) => s + r.amount, 0)
  }, [dailyPayRequests, selectedCastId])

  // 給与計算
  const hourlyBase = cast ? cast.hourlyRate * totalHours + totalBackAmount : 0
  const guaranteeBase = cast ? Math.floor(totalSales * cast.guaranteeRate) : 0
  const grossSalary = Math.max(hourlyBase, guaranteeBase)
  const deductions = 0 // 天引きはダミーで0
  const netSalary = grossSalary - dailyPayTotal - deductions

  // 日払い申請
  const handleDailyPay = () => {
    const amount = Number(dailyPayAmount)
    if (!amount || amount <= 0 || !cast) return
    addDailyPayRequest({
      id: Date.now(),
      castId: cast.id,
      castName: cast.name,
      amount,
      date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
    })
    setDailyPayAmount('')
    setShowDailyPay(false)
  }

  const dailyPayNet = Number(dailyPayAmount) > 0 ? Math.floor(Number(dailyPayAmount) * 0.9) : 0

  return (
    <div className="flex flex-col h-full">
      {/* キャスト選択 */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-sm text-gray-400">キャスト:</span>
        <select
          value={selectedCastId}
          onChange={(e) => setSelectedCastId(Number(e.target.value))}
          className="bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm"
        >
          {activeCasts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* 期間選択 */}
      <div className="px-4 pb-2 flex gap-2">
        <button onClick={() => setPeriod('first')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${period === 'first' ? 'bg-[#d4af37] text-black' : 'bg-white/10 text-gray-300'}`}>
          前半 (1日〜15日)
        </button>
        <button onClick={() => setPeriod('second')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${period === 'second' ? 'bg-[#d4af37] text-black' : 'bg-white/10 text-gray-300'}`}>
          後半 (16日〜末日)
        </button>
      </div>

      {/* 給与サマリー（固定表示） */}
      {cast && (
        <div className="px-4 py-3 bg-[#16213e] border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold">{cast.name}</span>
            <span className="text-xs text-gray-400">時給¥{cast.hourlyRate.toLocaleString()} / 保証{(cast.guaranteeRate * 100).toFixed(0)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/5 rounded-lg py-2 px-1">
              <div className="text-[10px] text-gray-400">時給ベース</div>
              <div className={`text-sm font-bold ${hourlyBase >= guaranteeBase ? 'text-[#d4af37]' : 'text-gray-300'}`}>¥{hourlyBase.toLocaleString()}</div>
            </div>
            <div className="bg-white/5 rounded-lg py-2 px-1">
              <div className="text-[10px] text-gray-400">保証ベース</div>
              <div className={`text-sm font-bold ${guaranteeBase > hourlyBase ? 'text-[#d4af37]' : 'text-gray-300'}`}>¥{guaranteeBase.toLocaleString()}</div>
            </div>
            <div className="bg-[#d4af37]/20 rounded-lg py-2 px-1">
              <div className="text-[10px] text-[#d4af37]">差引支給額</div>
              <div className="text-sm font-bold text-[#d4af37]">¥{netSalary.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">

        {/* 勤務実績一覧 */}
        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-300">勤務実績</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="py-1 text-left">日付</th>
                  <th className="py-1 text-right">時間</th>
                  <th className="py-1 text-right">バック</th>
                  <th className="py-1 text-right">売上</th>
                </tr>
              </thead>
              <tbody>
                {filteredWork.map((w) => (
                  <tr key={w.date} className={`border-b border-gray-800 ${w.hours === 0 ? 'text-gray-600' : ''}`}>
                    <td className="py-1.5">{w.date}</td>
                    <td className="py-1.5 text-right">{w.hours > 0 ? `${w.hours}h` : '休'}</td>
                    <td className="py-1.5 text-right">
                      {Object.entries(w.backs).length > 0
                        ? Object.entries(w.backs).map(([t, c]) => `${t}:${c}`).join(' ')
                        : '-'}
                    </td>
                    <td className="py-1.5 text-right">{w.sales > 0 ? `¥${w.sales.toLocaleString()}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-gray-600">
                  <td className="py-2">合計</td>
                  <td className="py-2 text-right">{totalHours}h</td>
                  <td className="py-2 text-right"></td>
                  <td className="py-2 text-right">¥{totalSales.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* バック集計 */}
        {Object.keys(backTotals).length > 0 && (
          <div className="bg-purple-900/30 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-purple-300">バック集計</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {(Object.entries(backTotals) as [BackType, number][]).map(([type, count]) => (
                <span key={type} className="bg-purple-800/50 text-purple-200 text-xs px-2 py-0.5 rounded">
                  {type}: {count}件 (¥{((cast?.backRates[type] ?? 0) * count).toLocaleString()})
                </span>
              ))}
            </div>
            <div className="text-sm font-bold text-purple-200">バック合計: ¥{totalBackAmount.toLocaleString()}</div>
          </div>
        )}

        {/* 給与計算結果 */}
        <div className="bg-[#16213e] rounded-xl p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-300">給与計算</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">時給ベース</span>
            <span className={hourlyBase >= guaranteeBase ? 'text-[#d4af37] font-bold' : ''}>
              ¥{hourlyBase.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-500 ml-2">
            ¥{cast?.hourlyRate.toLocaleString()} x {totalHours}h + バック ¥{totalBackAmount.toLocaleString()}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">売上保証ベース</span>
            <span className={guaranteeBase > hourlyBase ? 'text-[#d4af37] font-bold' : ''}>
              ¥{guaranteeBase.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-500 ml-2">
            ¥{totalSales.toLocaleString()} x {((cast?.guaranteeRate ?? 0) * 100).toFixed(0)}%
          </div>
          <div className="border-t border-gray-600 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">総支給額</span>
              <span className="font-bold">¥{grossSalary.toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-500 ml-2">= MAX(時給ベース, 売上保証ベース)</div>
          </div>
          {dailyPayTotal > 0 && (
            <div className="flex justify-between text-sm text-red-400">
              <span>日払い済</span>
              <span>-¥{dailyPayTotal.toLocaleString()}</span>
            </div>
          )}
          {deductions > 0 && (
            <div className="flex justify-between text-sm text-red-400">
              <span>天引き</span>
              <span>-¥{deductions.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-gray-600 pt-2 flex justify-between">
            <span className="font-bold text-lg">差引支給額</span>
            <span className="font-bold text-2xl text-[#d4af37]">¥{netSalary.toLocaleString()}</span>
          </div>
        </div>

        {/* 日払い申請 */}
        <button onClick={() => setShowDailyPay(true)} className="w-full bg-blue-600 py-3 rounded-xl font-bold mb-4">日払い申請</button>

        {/* 日払い履歴 */}
        {dailyPayRequests.filter((r) => r.castId === selectedCastId).length > 0 && (
          <div className="bg-white/5 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-2 text-gray-300">日払い履歴</h3>
            <div className="space-y-1">
              {dailyPayRequests.filter((r) => r.castId === selectedCastId).map((r) => (
                <div key={r.id} className="flex justify-between text-sm">
                  <span className="text-gray-400">{r.date}</span>
                  <span>¥{r.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 日払い申請モーダル */}
      {showDailyPay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDailyPay(false)}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">日払い申請</h2>
            <div className="mb-4">
              <label className="text-xs text-gray-400 block mb-1">申請額</label>
              <input
                type="number"
                value={dailyPayAmount}
                onChange={(e) => setDailyPayAmount(e.target.value)}
                placeholder="金額を入力"
                className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {Number(dailyPayAmount) > 0 && (
              <div className="bg-white/5 rounded-lg p-3 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">申請額</span>
                  <span>¥{Number(dailyPayAmount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">控除 (10%)</span>
                  <span className="text-red-400">-¥{(Number(dailyPayAmount) - dailyPayNet).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-gray-600 pt-1">
                  <span>手渡し額</span>
                  <span className="text-[#d4af37]">¥{dailyPayNet.toLocaleString()}</span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowDailyPay(false)} className="flex-1 bg-white/10 py-3 rounded-lg font-bold text-gray-400">キャンセル</button>
              <button onClick={handleDailyPay} disabled={!dailyPayAmount || Number(dailyPayAmount) <= 0} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold disabled:opacity-50">申請確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
