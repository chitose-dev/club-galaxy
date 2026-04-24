import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { sampleDailyWork, type BackType, type DailyWork, type UserAccount, type AttendanceRecord } from '../data/mock'
import { calcHourlyPay } from '../utils/payroll'
import { Plus, Trash2 } from 'lucide-react'
import { openPrintWindow } from '../utils/print'
import { getPaymentDate, formatPaymentDate } from '../utils/paymentDate'
import { printCastLedger } from '../utils/castLedger'
import ContextualHeader from '../components/ContextualHeader'
import Tabs from '../components/Tabs'
import Modal from '../components/Modal'
import { Input, Select, Field } from '../components/Input'
import { GoldButton, GhostButton } from '../components/Buttons'

type Period = 'first' | 'second'
type StaffType = 'cast' | 'boy'

const backTypeOrder: BackType[] = ['FD', '本D', 'Fカク', '本カク', '本カクW', '同伴', '本指名', '場内指名', 'ボトルバック', 'ヘルプ', 'その他']

export default function SalaryPage() {
  const { casts, dailyPayRequests, addDailyPayRequest, deductions, setDeductions, userAccounts, attendanceRecords, storeSettings } = useStore()
  const { user } = useAuth()
  const activeCasts = casts.filter((c) => c.active)

  const availableCasts = user?.role === 'cast'
    ? activeCasts.filter((c) => c.id === user.castId)
    : activeCasts

  const [staffType, setStaffType] = useState<StaffType>('cast')
  const [selectedCastId, setSelectedCastId] = useState<number>(availableCasts[0]?.id ?? 0)
  const [period, setPeriod] = useState<Period>('first')

  // ボーイ(staff)モード: キャストロールでは使用不可
  if (staffType === 'boy' && user?.role !== 'cast') {
    return (
      <BoySalaryView
        period={period}
        setPeriod={setPeriod}
        staffType={staffType}
        setStaffType={setStaffType}
        userAccounts={userAccounts}
        attendanceRecords={attendanceRecords}
        deductions={deductions}
        setDeductions={setDeductions}
        dailyPayRequests={dailyPayRequests}
      />
    )
  }

  const [showDailyPayRecord, setShowDailyPayRecord] = useState(false)
  const [dailyPayAmount, setDailyPayAmount] = useState('')

  const [showAddDeduction, setShowAddDeduction] = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionReason, setDeductionReason] = useState('')
  const [deductionSource, setDeductionSource] = useState<'register' | 'transfer'>('register')

  const cast = casts.find((c) => c.id === selectedCastId)
  // TODO(backend): バックエンド実装後、billingRecords + attendanceRecords から日次集計を生成する関数に差し替える
  // 現状はデモ用 sampleDailyWork(静的データ)を参照。実運用では以下で置換:
  //   const dailyWork = aggregateCastDailyWork(selectedCastId, billingRecords, attendanceRecords, period)
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

  // 指示書§4.1: 給与 = (時給×時間 + 各種バック) × 0.9 (ホステス税10%控除)
  // 最終振込 = 給与 − 日払い − 天引き
  // 追補03 R25: 時給計算は 15 分単位 + ルーズタイム 15 分を適用
  const taxablePre = cast ? calcHourlyPay(cast.hourlyRate, totalHours) + totalBackAmount : 0   // 税引前
  const grossSalary = Math.floor(taxablePre * 0.9)                                // 支給額(指示書)
  const hostessTax = taxablePre - grossSalary                                     // ホステス税(−10%)
  // 参考: 要件定義書 MAX 式での保証額(UI表示のみ、計算には使わない)
  const guaranteeBase = cast ? Math.floor(totalSales * cast.guaranteeRate) : 0
  const netSalary = grossSalary - dailyPayTotal - deductionTotal                  // 最終振込

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
    return calcHourlyPay(cast.hourlyRate, w.hours) + getDayBackAmount(w)
  }

  // 経理連動: 源泉税差額の自動計算
  // 法定源泉税: 日給5,000円超過分の10.21%
  const legalWithholding = useMemo(() => {
    let total = 0
    for (const w of filteredWork) {
      if (w.hours === 0) continue
      const dailyPay = (cast?.hourlyRate ?? 0) * w.hours + getDayBackAmount(w)
      if (dailyPay > 5000) {
        total += Math.floor((dailyPay - 5000) * 0.1021)
      }
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredWork, cast])

  const storeMiscIncome = hostessTax - legalWithholding // 独自10%と法定源泉税の差額 = 店舗の雑収入

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
      source: deductionSource,
    }])
    setDeductionAmount('')
    setDeductionReason('')
    setShowAddDeduction(false)
  }

  const handleRemoveDeduction = (id: number) => {
    setDeductions((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader accent="salary" title="給与計算" backTo="/top" showBack={user?.role !== 'cast'} />
      {/* Staff type toggle (owner/staff only) */}
      {user?.role !== 'cast' && (
        <div className="px-4 pt-3 pb-1">
          <Tabs<StaffType>
            variant="pills"
            value={staffType}
            onChange={setStaffType}
            items={[
              { key: 'cast', label: 'キャスト' },
              { key: 'boy', label: 'ボーイ（黒服）' },
            ]}
            className="w-full [&>button]:flex-1"
          />
        </div>
      )}

      {/* Cast selector */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-xs text-gray-500">キャスト:</span>
        <Select
          size="sm"
          value={selectedCastId}
          onChange={(e) => setSelectedCastId(Number(e.target.value))}
          className="w-auto"
        >
          {availableCasts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {/* Period selector */}
      <div className="px-4 pb-2">
        <Tabs<Period>
          variant="pills"
          value={period}
          onChange={setPeriod}
          items={[
            { key: 'first', label: '前半 (1日〜15日)' },
            { key: 'second', label: '後半 (16日〜末日)' },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>

      {/* Payment date */}
      <div className="px-4 pb-2 text-xs text-gray-500">
        支払日: <span className="text-gray-300">{formatPaymentDate(getPaymentDate(period, new Date().getFullYear(), new Date().getMonth() + 1))}</span>
        <span className="text-gray-600 ml-1">※土日祝は前倒し</span>
      </div>

      {/* Salary summary */}
      {cast && (
        <div className="px-4 py-3">
          <div className="panel-gold p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gold">{cast.name}</span>
              <span className="text-xs text-gray-400 tabular-nums">時給¥{cast.hourlyRate.toLocaleString()} / 保証{(cast.guaranteeRate * 100).toFixed(0)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="panel py-2 px-1">
                <div className="text-xs text-gray-500">税引前(時給+バック)</div>
                <div className="text-sm font-bold tabular-nums">¥{taxablePre.toLocaleString()}</div>
              </div>
              <div className="panel py-2 px-1">
                <div className="text-xs text-red-400/70">ホステス税(-10%)</div>
                <div className="text-sm font-bold text-red-400 tabular-nums">-¥{hostessTax.toLocaleString()}</div>
              </div>
              <div className="panel py-2 px-1">
                <div className="text-xs text-gray-500">支給額</div>
                <div className="text-sm font-bold tabular-nums">¥{grossSalary.toLocaleString()}</div>
              </div>
              <div className="panel py-2 px-1 border-gold/40">
                <div className="text-xs text-gray-500">最終振込額</div>
                <div className="text-sm font-bold text-gold tabular-nums">¥{netSalary.toLocaleString()}</div>
              </div>
            </div>
            {guaranteeBase > taxablePre && (
              <div className="text-[10px] text-amber-400/70 mt-1 text-center">
                ※参考: 保証金額(売上×{(cast.guaranteeRate * 100).toFixed(0)}%) ¥{guaranteeBase.toLocaleString()} (要件定義書MAX式は衝突記録参照)
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        {/* Work record table */}
        <div className="panel-dense p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 text-gray-400">勤務実績</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 border-b border-white/10">
                  <th className="py-1 text-left px-1">日付</th>
                  <th className="py-1 text-right px-1">時間</th>
                  <th className="py-1 text-right px-1">日給</th>
                  {backTypeOrder.map((bt) => (
                    <th key={bt} className="py-1 text-right px-1">{bt}</th>
                  ))}
                  <th className="py-1 text-right px-1 text-blue-300">P合計</th>
                  <th className="py-1 text-right px-1">日経合計</th>
                </tr>
              </thead>
              <tbody>
                {filteredWork.map((w) => {
                  const dailyPay = cast ? calcHourlyPay(cast.hourlyRate, w.hours) : 0
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
                      <td className="py-1.5 px-1 text-right font-bold tabular-nums">{nikkei > 0 ? `¥${nikkei.toLocaleString()}` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-white/10">
                  <td className="py-2 px-1">合計</td>
                  <td className="py-2 px-1 text-right tabular-nums">{totalHours}h</td>
                  <td className="py-2 px-1 text-right tabular-nums">¥{(cast ? calcHourlyPay(cast.hourlyRate, totalHours) : 0).toLocaleString()}</td>
                  {backTypeOrder.map((bt) => (
                    <td key={bt} className="py-2 px-1 text-right tabular-nums">{backTotals[bt] ?? '-'}</td>
                  ))}
                  <td className="py-2 px-1 text-right text-blue-300 tabular-nums">
                    {Object.values(backTotals).reduce((s, c) => s + c, 0)}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">
                    ¥{(cast ? calcHourlyPay(cast.hourlyRate, totalHours) + totalBackAmount : 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Back summary */}
        {Object.keys(backTotals).length > 0 && (
          <div className="panel-gold p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gold">バック集計</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {(Object.entries(backTotals) as [BackType, number][]).map(([type, count]) => (
                <span key={type} className="bg-gold/10 border border-gold/30 text-gray-200 text-xs px-2 py-0.5 rounded tabular-nums">
                  {type}: {count}件 (¥{((cast?.backRates[type] ?? 0) * count).toLocaleString()})
                </span>
              ))}
            </div>
            <div className="text-sm font-bold text-gold tabular-nums">バック合計: ¥{totalBackAmount.toLocaleString()}</div>
          </div>
        )}

        {/* Salary calculation (指示書§4.1 準拠) */}
        <div className="panel p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-400">給与計算</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">税引前 (時給+バック)</span>
            <span className="font-bold tabular-nums">¥{taxablePre.toLocaleString()}</span>
          </div>
          <div className="text-xs text-gray-600 ml-2 tabular-nums">
            ¥{cast?.hourlyRate.toLocaleString()} x {totalHours}h + バック ¥{totalBackAmount.toLocaleString()}
          </div>
          <div className="flex justify-between text-sm text-red-400">
            <span>ホステス税 (-10%)</span>
            <span className="tabular-nums">-¥{hostessTax.toLocaleString()}</span>
          </div>
          <div className="border-t border-white/10 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">支給額</span>
              <span className="font-bold tabular-nums">¥{grossSalary.toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-600 ml-2">= 税引前 × 0.9 (指示書§4.1)</div>
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
            <span className="font-bold text-lg">最終振込額</span>
            <span className="font-bold text-2xl text-gold tabular-nums">¥{netSalary.toLocaleString()}</span>
          </div>
          <div className="text-xs text-gray-600">= 支給額 - 日払い - 天引き</div>
          {guaranteeBase > taxablePre && cast && (
            <div className="text-[10px] text-amber-400/70 mt-1 border-t border-amber-500/20 pt-2">
              ※参考(要件定義書MAX式): 売上¥{totalSales.toLocaleString()} × 保証{(cast.guaranteeRate * 100).toFixed(0)}% = ¥{guaranteeBase.toLocaleString()} (今の式では未使用)
            </div>
          )}
        </div>

        {/* 経理連動: 源泉税差額 */}
        {user?.role === 'owner' && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-blue-400">経理連動（税務情報）</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">独自控除（10%）</span>
                <span className="tabular-nums">¥{hostessTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">法定源泉税（日給5,000超×10.21%）</span>
                <span className="tabular-nums">¥{legalWithholding.toLocaleString()}</span>
              </div>
              <div className="border-t border-blue-500/20 pt-1.5 flex justify-between font-bold">
                <span className="text-blue-400">店舗の雑収入（差額）</span>
                <span className={`tabular-nums ${storeMiscIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>¥{storeMiscIncome.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* 給与明細印刷ボタン */}
        {user?.role !== 'cast' && cast && (
          <button onClick={() => {
            const body = `
              <h2>給与明細書</h2>
              <p>キャスト名: ${cast.name}</p>
              <p>対象期間: ${period === 'first' ? '1日〜15日' : '16日〜末日'}</p>
              <table>
                <tr><th>税引前 (時給+バック)</th><td>¥${taxablePre.toLocaleString()}</td></tr>
                <tr><th>ホステス税(-10%)</th><td>-¥${hostessTax.toLocaleString()}</td></tr>
                <tr><th>支給額</th><td>¥${grossSalary.toLocaleString()}</td></tr>
                <tr><th>日払い済</th><td>-¥${dailyPayTotal.toLocaleString()}</td></tr>
                <tr><th>天引き合計</th><td>-¥${deductionTotal.toLocaleString()}</td></tr>
                <tr><th class="bold">最終振込額</th><td class="bold">¥${netSalary.toLocaleString()}</td></tr>
              </table>
              <div class="sign">受領サイン</div>
            `
            openPrintWindow(body, '給与明細', { width: 400, height: 600 })
          }} className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold mb-2 text-sm text-gray-400 flex items-center justify-center gap-2">
            給与明細印刷
          </button>
        )}

        {/* 日経表PDF出力ボタン */}
        {user?.role !== 'cast' && cast && (
          <button
            onClick={() => {
              const now = new Date()
              const work = sampleDailyWork[cast.id] ?? []
              // 先月売上の計算
              const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
              const prevMonthSales = work
                .filter((w) => {
                  if (w.date.includes('-')) {
                    const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
                    return w.date.startsWith(`${py}-${String(prevMonth).padStart(2, '0')}`)
                  }
                  const [m] = w.date.split('/')
                  return parseInt(m, 10) === prevMonth
                })
                .reduce((s, w) => s + w.sales, 0)
              printCastLedger({
                cast,
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                dailyWork: work,
                storeSettings,
                previousMonthSales: prevMonthSales,
                realName: cast.realName,
                address: cast.address,
              })
            }}
            className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold mb-4 text-sm text-gray-400 flex items-center justify-center gap-2"
          >
            月次日経表 PDF出力（ブラウザ印刷→PDFに保存）
          </button>
        )}

        {/* Deductions */}
        <div className="bg-white/5 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-400">天引き</h3>
            {user?.role !== 'cast' && (
              <button onClick={() => setShowAddDeduction(true)} className="text-xs bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-gray-400 flex items-center gap-1 transition-colors">
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
          <button onClick={() => setShowDailyPayRecord(true)} className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold mb-4 text-sm transition-colors">日払い記録（口頭申請受付後に入力）</button>
        )}

        {/* 日払い受領明細印刷 */}
        {user?.role !== 'cast' && dailyPayRequests.filter((r) => r.castId === selectedCastId).length > 0 && (
          <button onClick={() => {
            const castReqs = dailyPayRequests.filter((r) => r.castId === selectedCastId)
            const rows = castReqs.map((r) => `<tr><td>${r.date}</td><td>¥${r.amount.toLocaleString()}</td></tr>`).join('')
            const body = `
              <h2>日払い受領明細</h2>
              <p>キャスト名: ${cast?.name ?? ''}</p>
              <table>
                <tr><th>日付</th><th>金額</th></tr>
                ${rows}
                <tr><th>合計</th><td class="bold">¥${dailyPayTotal.toLocaleString()}</td></tr>
              </table>
              <div class="sign">受領サイン</div>
            `
            openPrintWindow(body, '日払い受領明細', { width: 400, height: 500 })
          }} className="w-full btn-ghost py-2 text-xs text-gray-500 mb-4">
            日払い受領明細印刷（サイン欄付き）
          </button>
        )}

        {/* Daily pay history */}
        {dailyPayRequests.filter((r) => r.castId === selectedCastId).length > 0 && (
          <div className="panel p-4">
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
      <Modal
        open={showDailyPayRecord}
        onClose={() => setShowDailyPayRecord(false)}
        size="sm"
        title="日払い記録"
        footer={
          <>
            <GhostButton onClick={() => setShowDailyPayRecord(false)} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleDailyPayRecord} disabled={!dailyPayAmount || Number(dailyPayAmount) <= 0} className="flex-1">記録</GoldButton>
          </>
        }
      >
        <p className="text-xs text-gray-500 mb-3">口頭申請を受けた日払い金額を記録します</p>
        <Field label="支給額">
          <Input
            type="number"
            value={dailyPayAmount}
            onChange={(e) => setDailyPayAmount(e.target.value)}
            placeholder="金額を入力"
          />
        </Field>
      </Modal>

      {/* Deduction modal */}
      <Modal
        open={showAddDeduction}
        onClose={() => setShowAddDeduction(false)}
        size="sm"
        title="天引き追加"
        footer={
          <>
            <GhostButton onClick={() => setShowAddDeduction(false)} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleAddDeduction} disabled={!deductionAmount || Number(deductionAmount) <= 0 || !deductionReason} className="flex-1">追加</GoldButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="金額">
            <Input
              type="number"
              value={deductionAmount}
              onChange={(e) => setDeductionAmount(e.target.value)}
              placeholder="天引き金額"
            />
          </Field>
          <Field label="理由">
            <Input
              type="text"
              value={deductionReason}
              onChange={(e) => setDeductionReason(e.target.value)}
              placeholder="例: 衣装代、前借り返済"
            />
          </Field>
          <Field label="出金元">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeductionSource('register')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${deductionSource === 'register' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'border-white/10 text-gray-500'}`}
              >
                レジ現金
              </button>
              <button
                type="button"
                onClick={() => setDeductionSource('transfer')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${deductionSource === 'transfer' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'border-white/10 text-gray-500'}`}
              >
                振込・立替
              </button>
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

// ─── ボーイ給与画面 ───

interface BoySalaryViewProps {
  period: Period
  setPeriod: (p: Period) => void
  staffType: StaffType
  setStaffType: (t: StaffType) => void
  userAccounts: UserAccount[]
  attendanceRecords: AttendanceRecord[]
  deductions: ReturnType<typeof useStore>['deductions']
  setDeductions: ReturnType<typeof useStore>['setDeductions']
  dailyPayRequests: ReturnType<typeof useStore>['dailyPayRequests']
}

// ボーイごとに擬似的な負数IDを割り当てて、既存のdeductions/dailyPayRequestsストアを再利用する。
// username から簡易ハッシュで安定した負数IDを生成。
function boyStaffId(username: string): number {
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0
  return -Math.abs(hash || 1)
}

function BoySalaryView({ period, setPeriod, staffType, setStaffType, userAccounts, attendanceRecords, deductions, setDeductions, dailyPayRequests }: BoySalaryViewProps) {
  const staffAccounts = userAccounts.filter((u) => u.role === 'staff')
  const [selectedUsername, setSelectedUsername] = useState<string>(staffAccounts[0]?.username ?? '')

  const selected = staffAccounts.find((u) => u.username === selectedUsername)
  const staffId = selected ? boyStaffId(selected.username) : 0

  // 対象期間の勤務を集計 (date は YYYY-MM-DD 前提)
  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter((r) => {
      if (r.staffType !== 'boy') return false
      if (!selected) return false
      // staffName で突き合わせ (既存モックが staffName ベース)
      if (r.staffName !== selected.displayName) return false
      const parts = r.date.split('-')
      const day = parseInt(parts[2] ?? '0', 10)
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [attendanceRecords, selected, period])

  const totalHours = filteredAttendance.reduce((s, r) => s + r.workHours, 0)
  const hourlyRate = selected?.hourlyRate ?? 0
  const grossSalary = Math.floor(hourlyRate * totalHours)

  const boyDailyPay = dailyPayRequests.filter((r) => r.staffType === 'boy' && r.castId === staffId)
  const dailyPayTotal = boyDailyPay.reduce((s, r) => s + r.amount, 0)

  const boyDeductions = deductions.filter((d) => d.staffType === 'boy' && d.castId === staffId)
  const deductionTotal = boyDeductions.reduce((s, d) => s + d.amount, 0)

  const hostessTax = Math.floor(grossSalary * 0.1)
  const netSalary = grossSalary - hostessTax - dailyPayTotal - deductionTotal

  const legalWithholding = useMemo(() => {
    let total = 0
    for (const r of filteredAttendance) {
      const dailyPay = hourlyRate * r.workHours
      if (dailyPay > 5000) total += Math.floor((dailyPay - 5000) * 0.1021)
    }
    return total
  }, [filteredAttendance, hourlyRate])
  const storeMiscIncome = hostessTax - legalWithholding

  const [showAddDeduction, setShowAddDeduction] = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionReason, setDeductionReason] = useState('')
  const [deductionSource, setDeductionSource] = useState<'register' | 'transfer'>('register')

  const handleAddDeduction = () => {
    const amount = Number(deductionAmount)
    if (!amount || amount <= 0 || !deductionReason || !selected) return
    setDeductions((prev) => [...prev, {
      id: Date.now(),
      castId: staffId,
      amount,
      reason: deductionReason,
      source: deductionSource,
      staffType: 'boy',
    }])
    setDeductionAmount('')
    setDeductionReason('')
    setShowAddDeduction(false)
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader accent="salary" title="給与計算 (ボーイ)" backTo="/top" />
      <div className="px-4 pt-3 pb-1">
        <Tabs<StaffType>
          variant="pills"
          value={staffType}
          onChange={setStaffType}
          items={[
            { key: 'cast', label: 'キャスト' },
            { key: 'boy', label: 'ボーイ（黒服）' },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>
      {/* Boy selector */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-xs text-gray-500">ボーイ:</span>
        <Select
          size="sm"
          value={selectedUsername}
          onChange={(e) => setSelectedUsername(e.target.value)}
          className="w-auto"
        >
          {staffAccounts.map((u) => (
            <option key={u.username} value={u.username}>{u.displayName}</option>
          ))}
        </Select>
      </div>

      {/* Period selector */}
      <div className="px-4 pb-2">
        <Tabs<Period>
          variant="pills"
          value={period}
          onChange={setPeriod}
          items={[
            { key: 'first', label: '前半 (1日〜15日)' },
            { key: 'second', label: '後半 (16日〜末日)' },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div className="px-4 pb-2 text-xs text-gray-500">
        支払日: <span className="text-gray-300">{formatPaymentDate(getPaymentDate(period, new Date().getFullYear(), new Date().getMonth() + 1))}</span>
        <span className="text-gray-600 ml-1">※土日祝は前倒し</span>
      </div>

      {selected ? (
        <div className="px-4 space-y-4 pb-4">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold">{selected.displayName}</span>
              <span className="text-xs text-gray-500 tabular-nums">時給¥{hourlyRate.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">勤務時間</div>
                <div className="tabular-nums">{totalHours.toFixed(1)}h</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">総支給額</div>
                <div className="tabular-nums font-bold">¥{grossSalary.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">日払い合計</div>
                <div className="tabular-nums text-red-400">-¥{dailyPayTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">天引き合計</div>
                <div className="tabular-nums text-red-400">-¥{deductionTotal.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex justify-between pt-3 mt-3 border-t border-white/10">
              <span className="text-sm font-bold">差引支給額</span>
              <span className={`text-lg font-bold tabular-nums ${netSalary >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>¥{netSalary.toLocaleString()}</span>
            </div>
          </div>

          {/* 勤務実績 */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-2">勤務実績</h3>
            {filteredAttendance.length === 0 ? (
              <p className="text-xs text-gray-600">この期間の勤務記録はありません</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/10">
                    <th className="text-left py-1.5">日付</th>
                    <th className="text-right">時間</th>
                    <th className="text-right">日給</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((r) => (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="py-1.5 text-gray-400">{r.date}</td>
                      <td className="text-right tabular-nums">{r.workHours.toFixed(1)}h</td>
                      <td className="text-right tabular-nums">¥{Math.floor(hourlyRate * r.workHours).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 経理連動 */}
          <div className="bg-white/5 rounded-lg p-4 space-y-1.5 text-xs">
            <h3 className="text-sm font-bold text-gray-400 mb-1">経理連動</h3>
            <div className="flex justify-between"><span className="text-gray-500">独自10%控除</span><span className="tabular-nums">¥{hostessTax.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">法定源泉税 (10.21%, 5,000超過分)</span><span className="tabular-nums">¥{legalWithholding.toLocaleString()}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-1.5"><span className="text-gray-400 font-bold">店舗雑収入差額</span><span className={`tabular-nums ${storeMiscIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>¥{storeMiscIncome.toLocaleString()}</span></div>
          </div>

          {/* 給与明細印刷 */}
          <button onClick={() => {
            const body = `
              <h2>給与明細書</h2>
              <p>氏名: ${selected.displayName}（ボーイ）</p>
              <p>対象期間: ${period === 'first' ? '1日〜15日' : '16日〜末日'}</p>
              <table>
                <tr><th>勤務時間</th><td>${totalHours.toFixed(1)}h</td></tr>
                <tr><th>時給</th><td>¥${hourlyRate.toLocaleString()}</td></tr>
                <tr><th>総支給額</th><td>¥${grossSalary.toLocaleString()}</td></tr>
                <tr><th>独自10%控除</th><td>-¥${hostessTax.toLocaleString()}</td></tr>
                <tr><th>日払い済</th><td>-¥${dailyPayTotal.toLocaleString()}</td></tr>
                <tr><th>天引き合計</th><td>-¥${deductionTotal.toLocaleString()}</td></tr>
                <tr><th class="bold">差引支給額</th><td class="bold">¥${netSalary.toLocaleString()}</td></tr>
              </table>
              <div class="sign">受領サイン</div>
            `
            openPrintWindow(body, '給与明細', { width: 400, height: 600 })
          }} className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-sm text-gray-400">
            給与明細印刷
          </button>

          {/* 天引き */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-400">天引き</h3>
              <button onClick={() => setShowAddDeduction(true)} className="text-xs bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-gray-400 flex items-center gap-1">
                <Plus size={12} /> 追加
              </button>
            </div>
            {boyDeductions.length === 0 ? (
              <p className="text-sm text-gray-600">天引きなし</p>
            ) : (
              <div className="space-y-2">
                {boyDeductions.map((d) => (
                  <div key={d.id} className="flex justify-between items-center text-sm py-2 border-b border-white/5">
                    <span className="text-gray-300">{d.reason}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 tabular-nums">-¥{d.amount.toLocaleString()}</span>
                      <button onClick={() => setDeductions((prev) => prev.filter((x) => x.id !== d.id))} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Modal
            open={showAddDeduction}
            onClose={() => setShowAddDeduction(false)}
            size="sm"
            title="天引き追加"
            footer={
              <>
                <GhostButton onClick={() => setShowAddDeduction(false)} className="flex-1">キャンセル</GhostButton>
                <GoldButton onClick={handleAddDeduction} disabled={!deductionAmount || !deductionReason} className="flex-1">追加</GoldButton>
              </>
            }
          >
            <div className="space-y-3">
              <Input type="number" value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} placeholder="金額" />
              <Input type="text" value={deductionReason} onChange={(e) => setDeductionReason(e.target.value)} placeholder="理由" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeductionSource('register')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${deductionSource === 'register' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'border-white/10 text-gray-500'}`}
                >
                  レジ現金
                </button>
                <button
                  type="button"
                  onClick={() => setDeductionSource('transfer')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${deductionSource === 'transfer' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'border-white/10 text-gray-500'}`}
                >
                  振込・立替
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-gray-500">ボーイのアカウントが登録されていません</div>
      )}
    </div>
  )
}
