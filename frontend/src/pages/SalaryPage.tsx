import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { sampleDailyWork, type BackType, type DailyWork } from '../data/mock'
import { Plus, Trash2, X } from 'lucide-react'

type Period = 'first' | 'second'

const backTypeOrder: BackType[] = ['FD', '本D', 'Fカク', '本カク', '本カクW', '同伴', '本指名', '場内指名', 'ボトルバック', 'ヘルプ', 'その他']

export default function SalaryPage() {
  const { casts, dailyPayRequests, addDailyPayRequest, deductions, setDeductions } = useStore()
  const { user } = useAuth()
  const activeCasts = casts.filter((c) => c.active)

  const availableCasts = user?.role === 'cast'
    ? activeCasts.filter((c) => c.id === user.castId)
    : activeCasts

  const [selectedCastId, setSelectedCastId] = useState<number>(availableCasts[0]?.id ?? 0)
  const [period, setPeriod] = useState<Period>('first')

  const [showDailyPayRecord, setShowDailyPayRecord] = useState(false)
  const [dailyPayAmount, setDailyPayAmount] = useState('')

  const [showAddDeduction, setShowAddDeduction] = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionReason, setDeductionReason] = useState('')

  const cast = casts.find((c) => c.id === selectedCastId)
  const dailyWork: DailyWork[] = sampleDailyWork[selectedCastId] ?? []

  const filteredWork = useMemo(() => {
    return dailyWork.filter((w) => {
      const day = parseInt(w.date.split('/')[1], 10)
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [dailyWork, period])

  const totalHours = filteredWork.reduce((s, w) => s + w.hours, 0)
  const totalSales = filteredWork.reduce((s, w) => s + w.sales, 0)

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

  const backTotals = useMemo(() => {
    const totals: Partial<Record<BackType, number>> = {}
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        totals[type] = (totals[type] ?? 0) + count
      }
    }
    return totals
  }, [filteredWork])

  const dailyPayTotal = useMemo(() => {
    return dailyPayRequests
      .filter((r) => r.castId === selectedCastId)
      .reduce((s, r) => s + r.amount, 0)
  }, [dailyPayRequests, selectedCastId])

  const castDeductions = deductions.filter((d) => d.castId === selectedCastId)
  const deductionTotal = castDeductions.reduce((s, d) => s + d.amount, 0)

  const hourlyBase = cast ? cast.hourlyRate * totalHours + totalBackAmount : 0
  const guaranteeBase = cast ? Math.floor(totalSales * cast.guaranteeRate) : 0
  const grossSalary = Math.max(hourlyBase, guaranteeBase)
  const hostessTax = Math.floor(grossSalary * 0.1)
  const netSalary = grossSalary - hostessTax - dailyPayTotal - deductionTotal

  const getDayBackAmount = (w: DailyWork): number => {
    if (!cast) return 0
    let total = 0
    for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
      total += (cast.backRates[type] ?? 0) * count
    }
    return total
  }

  const getDayPTotal = (w: DailyWork): number => {
    return Object.values(w.backs).reduce((s, c) => s + c, 0)
  }

  const getDayNikkei = (w: DailyWork): number => {
    if (!cast) return 0
    return cast.hourlyRate * w.hours + getDayBackAmount(w)
  }

  const handleDailyPayRecord = () => {
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
    setShowDailyPayRecord(false)
  }

  const handleAddDeduction = () => {
    const amount = Number(deductionAmount)
    if (!amount || amount <= 0 || !deductionReason || !cast) return
    setDeductions((prev) => [...prev, {
      id: Date.now(),
      castId: cast.id,
      amount,
      reason: deductionReason,
    }])
    setDeductionAmount('')
    setDeductionReason('')
    setShowAddDeduction(false)
  }

  const handleRemoveDeduction = (id: number) => {
    setDeductions((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cast selector */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-xs text-gray-500">キャスト:</span>
        <select
          value={selectedCastId}
          onChange={(e) => setSelectedCastId(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
        >
          {availableCasts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Period selector */}
      <div className="px-4 pb-2 flex gap-2">
        <button onClick={() => setPeriod('first')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${period === 'first' ? 'bg-[#d4af37] text-black' : 'bg-white/5 border border-white/10 text-gray-500'}`}>
          前半 (1日〜15日)
        </button>
        <button onClick={() => setPeriod('second')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${period === 'second' ? 'bg-[#d4af37] text-black' : 'bg-white/5 border border-white/10 text-gray-500'}`}>
          後半 (16日〜末日)
        </button>
      </div>

      {/* Salary summary */}
      {cast && (
        <div className="px-4 py-3 bg-[#16213e] border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold">{cast.name}</span>
            <span className="text-xs text-gray-500 tabular-nums">時給¥{cast.hourlyRate.toLocaleString()} / 保証{(cast.guaranteeRate * 100).toFixed(0)}%</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-white/[0.03] border border-white/5 rounded-lg py-2 px-1">
              <div className="text-[10px] text-gray-500">時給ベース</div>
              <div className={`text-sm font-bold tabular-nums ${hourlyBase >= guaranteeBase ? 'text-[#d4af37]' : 'text-gray-400'}`}>¥{hourlyBase.toLocaleString()}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-lg py-2 px-1">
              <div className="text-[10px] text-gray-500">保証ベース</div>
              <div className={`text-sm font-bold tabular-nums ${guaranteeBase > hourlyBase ? 'text-[#d4af37]' : 'text-gray-400'}`}>¥{guaranteeBase.toLocaleString()}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-lg py-2 px-1">
              <div className="text-[10px] text-red-400/70">ホステス税</div>
              <div className="text-sm font-bold text-red-400 tabular-nums">-¥{hostessTax.toLocaleString()}</div>
            </div>
            <div className="bg-[#d4af37]/10 border border-[#d4af37]/20 rounded-lg py-2 px-1">
              <div className="text-[10px] text-[#d4af37]">差引支給額</div>
              <div className="text-sm font-bold text-[#d4af37] tabular-nums">¥{netSalary.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        {/* Work record table */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-400">勤務実績</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 border-b border-white/10">
                  <th className="py-1 text-left px-1">日付</th>
                  <th className="py-1 text-right px-1">時間</th>
                  <th className="py-1 text-right px-1">日給</th>
                  {backTypeOrder.map((bt) => (
                    <th key={bt} className="py-1 text-right px-1">{bt}</th>
                  ))}
                  <th className="py-1 text-right px-1 text-blue-300">P合計</th>
                  <th className="py-1 text-right px-1 text-[#d4af37]">日経合計</th>
                </tr>
              </thead>
              <tbody>
                {filteredWork.map((w) => {
                  const dailyPay = cast ? cast.hourlyRate * w.hours : 0
                  const pTotal = getDayPTotal(w)
                  const nikkei = getDayNikkei(w)
                  return (
                    <tr key={w.date} className={`border-b border-white/5 ${w.hours === 0 ? 'text-gray-700' : ''}`}>
                      <td className="py-1.5 px-1">{w.date}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">{w.hours > 0 ? `${w.hours}h` : '休'}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">{dailyPay > 0 ? `¥${dailyPay.toLocaleString()}` : '-'}</td>
                      {backTypeOrder.map((bt) => (
                        <td key={bt} className="py-1.5 px-1 text-right tabular-nums">{w.backs[bt] ?? '-'}</td>
                      ))}
                      <td className="py-1.5 px-1 text-right text-blue-300 font-bold tabular-nums">{pTotal > 0 ? pTotal : '-'}</td>
                      <td className="py-1.5 px-1 text-right text-[#d4af37] font-bold tabular-nums">{nikkei > 0 ? `¥${nikkei.toLocaleString()}` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-white/10">
                  <td className="py-2 px-1">合計</td>
                  <td className="py-2 px-1 text-right tabular-nums">{totalHours}h</td>
                  <td className="py-2 px-1 text-right tabular-nums">¥{(cast ? cast.hourlyRate * totalHours : 0).toLocaleString()}</td>
                  {backTypeOrder.map((bt) => (
                    <td key={bt} className="py-2 px-1 text-right tabular-nums">{backTotals[bt] ?? '-'}</td>
                  ))}
                  <td className="py-2 px-1 text-right text-blue-300 tabular-nums">
                    {Object.values(backTotals).reduce((s, c) => s + c, 0)}
                  </td>
                  <td className="py-2 px-1 text-right text-[#d4af37] tabular-nums">
                    ¥{(cast ? cast.hourlyRate * totalHours + totalBackAmount : 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Back summary */}
        {Object.keys(backTotals).length > 0 && (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-purple-400">バック集計</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {(Object.entries(backTotals) as [BackType, number][]).map(([type, count]) => (
                <span key={type} className="bg-purple-500/10 text-purple-300 text-xs px-2 py-0.5 rounded tabular-nums">
                  {type}: {count}件 (¥{((cast?.backRates[type] ?? 0) * count).toLocaleString()})
                </span>
              ))}
            </div>
            <div className="text-sm font-bold text-purple-300 tabular-nums">バック合計: ¥{totalBackAmount.toLocaleString()}</div>
          </div>
        )}

        {/* Salary calculation */}
        <div className="bg-[#16213e] border border-white/10 rounded-xl p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-400">給与計算</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">時給ベース</span>
            <span className={`tabular-nums ${hourlyBase >= guaranteeBase ? 'text-[#d4af37] font-bold' : ''}`}>
              ¥{hourlyBase.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-600 ml-2 tabular-nums">
            ¥{cast?.hourlyRate.toLocaleString()} x {totalHours}h + バック ¥{totalBackAmount.toLocaleString()}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">売上保証ベース</span>
            <span className={`tabular-nums ${guaranteeBase > hourlyBase ? 'text-[#d4af37] font-bold' : ''}`}>
              ¥{guaranteeBase.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-600 ml-2 tabular-nums">
            ¥{totalSales.toLocaleString()} x {((cast?.guaranteeRate ?? 0) * 100).toFixed(0)}%
          </div>
          <div className="border-t border-white/10 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">総支給額</span>
              <span className="font-bold tabular-nums">¥{grossSalary.toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-600 ml-2">= MAX(時給ベース, 売上保証ベース)</div>
          </div>
          <div className="flex justify-between text-sm text-red-400">
            <span>ホステス税 (-10%)</span>
            <span className="tabular-nums">-¥{hostessTax.toLocaleString()}</span>
          </div>
          {dailyPayTotal > 0 && (
            <div className="flex justify-between text-sm text-red-400">
              <span>日払い済</span>
              <span className="tabular-nums">-¥{dailyPayTotal.toLocaleString()}</span>
            </div>
          )}
          {deductionTotal > 0 && (
            <div className="flex justify-between text-sm text-red-400">
              <span>天引き合計</span>
              <span className="tabular-nums">-¥{deductionTotal.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-white/10 pt-2 flex justify-between">
            <span className="font-bold text-lg">差引支給額</span>
            <span className="font-bold text-2xl text-[#d4af37] tabular-nums">¥{netSalary.toLocaleString()}</span>
          </div>
          <div className="text-xs text-gray-600">= 総支給額 - ホステス税 - 日払い - 天引き</div>
        </div>

        {/* Deductions */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-400">天引き</h3>
            {user?.role !== 'cast' && (
              <button onClick={() => setShowAddDeduction(true)} className="text-xs bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-gray-400 flex items-center gap-1 hover:border-[#d4af37]/30 transition-colors">
                <Plus size={12} /> 追加
              </button>
            )}
          </div>
          {castDeductions.length === 0 ? (
            <p className="text-sm text-gray-600">天引きなし</p>
          ) : (
            <div className="space-y-2">
              {castDeductions.map((d) => (
                <div key={d.id} className="flex justify-between items-center text-sm py-2 border-b border-white/5">
                  <span className="text-gray-300">{d.reason}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 tabular-nums">-¥{d.amount.toLocaleString()}</span>
                    {user?.role !== 'cast' && (
                      <button onClick={() => handleRemoveDeduction(d.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="pt-2 flex justify-between text-sm font-bold">
                <span>天引き合計</span>
                <span className="text-red-400 tabular-nums">-¥{deductionTotal.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Daily pay record */}
        {user?.role !== 'cast' && (
          <button onClick={() => setShowDailyPayRecord(true)} className="w-full bg-white/5 border border-white/10 py-3 rounded-xl font-bold mb-4 text-sm hover:border-[#d4af37]/30 transition-colors">日払い記録（口頭申請受付後に入力）</button>
        )}

        {/* Daily pay history */}
        {dailyPayRequests.filter((r) => r.castId === selectedCastId).length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-2 text-gray-400">日払い履歴</h3>
            <div className="divide-y divide-white/5">
              {dailyPayRequests.filter((r) => r.castId === selectedCastId).map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1.5">
                  <span className="text-gray-500">{r.date}</span>
                  <span className="tabular-nums">¥{r.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Daily pay modal */}
      {showDailyPayRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDailyPayRecord(false)}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">日払い記録</h2>
              <button onClick={() => setShowDailyPayRecord(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">口頭申請を受けた日払い金額を記録します</p>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">支給額</label>
              <input
                type="number"
                value={dailyPayAmount}
                onChange={(e) => setDailyPayAmount(e.target.value)}
                placeholder="金額を入力"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDailyPayRecord(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
              <button onClick={handleDailyPayRecord} disabled={!dailyPayAmount || Number(dailyPayAmount) <= 0} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold disabled:opacity-40">記録</button>
            </div>
          </div>
        </div>
      )}

      {/* Deduction modal */}
      {showAddDeduction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddDeduction(false)}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">天引き追加</h2>
              <button onClick={() => setShowAddDeduction(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">金額</label>
                <input
                  type="number"
                  value={deductionAmount}
                  onChange={(e) => setDeductionAmount(e.target.value)}
                  placeholder="天引き金額"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">理由</label>
                <input
                  type="text"
                  value={deductionReason}
                  onChange={(e) => setDeductionReason(e.target.value)}
                  placeholder="例: 衣装代、前借り返済"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddDeduction(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
              <button onClick={handleAddDeduction} disabled={!deductionAmount || Number(deductionAmount) <= 0 || !deductionReason} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold disabled:opacity-40">追加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
