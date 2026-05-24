import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { type BackType, type DailyWork, type UserAccount, type AttendanceRecord } from '../data/mock'
import { computeDailyWork } from '../utils/dailyWork'
import { calcHourlyPay } from '../utils/payroll'
import { calcMonthlyGuaranteeShortfall } from '../utils/saleGuarantee'
import { Plus, Trash2, FileText, FileDown } from 'lucide-react'
import { buildMonthlyCastSalaryCsv, downloadCsv } from '../utils/taxCsv'
import PayslipPopup from '../components/PayslipPopup'
import DailyPayDialog from '../components/DailyPayDialog'
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
  const { casts, dailyPayRequests, addDailyPayRequest, deductions, setDeductions, userAccounts, attendanceRecords, billingRecords, storeSettings } = useStore()
  const { user } = useAuth()
  const activeCasts = casts.filter((c) => c.active)

  const availableCasts = user?.role === 'cast'
    ? activeCasts.filter((c) => c.id === user.castId)
    : activeCasts

  // 全 useState/useMemo は早期 return より前に宣言する (React Rules of Hooks)
  //   ボーイ↔キャスト 切替時に hook 順序が変わるとアンマウントされ画面真っ黒になるバグを回避
  const [staffType, setStaffType] = useState<StaffType>('cast')
  const [selectedCastId, setSelectedCastId] = useState<number>(availableCasts[0]?.id ?? 0)
  const [period, setPeriod] = useState<Period>('first')

  const [showDailyPayRecord, setShowDailyPayRecord] = useState(false)
  // PDF E: SalaryPage からも給与明細ポップアップを開ける
  const [showPayslip, setShowPayslip] = useState(false)

  const [showAddDeduction, setShowAddDeduction] = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionReason, setDeductionReason] = useState('')
  const [deductionSource, setDeductionSource] = useState<'register' | 'transfer'>('register')

  // ボーイ(staff)モード判定 (実際のコンポーネント切替は最後の return で実行)
  //   ※早期 return すると Rules of Hooks 違反で画面真っ黒になるので注意
  const isBoyMode = staffType === 'boy' && user?.role !== 'cast'

  const cast = casts.find((c) => c.id === selectedCastId)
  // 実データ集計: computeDailyWork で attendanceRecords + billingRecords から日次 DailyWork を生成
  const selectedCastName = casts.find((c) => c.id === selectedCastId)?.name ?? ''
  // 延長指名バック按分の単価は本指名 backRate を流用する仕様（mock.ts コメント参照）
  const selectedCastShimeiRate = cast?.backRates['本指名'] ?? 0
  // A2: 本指名ボトルバック按分は全キャストの「ボトルバック」率（%単位）を参照する。
  // 同じレシートに別の本指名キャストが居る場合の split 計算で他キャストの率も必要なため、
  // 一覧で渡す。
  const bottleBackRateByCast = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of casts) {
      m[c.name] = c.backRates['ボトルバック'] ?? 0
    }
    return m
  }, [casts])
  const dailyWork: DailyWork[] = computeDailyWork(
    selectedCastId, selectedCastName, attendanceRecords, billingRecords,
    selectedCastShimeiRate, bottleBackRateByCast,
  )

  const filteredWork = useMemo(() => {
    // API データの date は ISO 形式 (YYYY-MM-DD)、mock は M/D 形式が混在し得るため両対応。
    return dailyWork.filter((w) => {
      const day = w.date.includes('-')
        ? parseInt(w.date.split('-')[2], 10)
        : parseInt(w.date.split('/')[1], 10)
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [dailyWork, period])

  const totalHours = filteredWork.reduce((s, w) => s + w.hours, 0)
  // 売上は給与計算からは独立した参考値（PDF F で月単位保証に切替えたため、
  // 半月の売上合計は給与に直接効かない）。表示用途のために残す可能性に備えるが、
  // 現状の SalaryPage には使用箇所なし。
  // const totalSales = filteredWork.reduce((s, w) => s + w.sales, 0)

  const totalBackAmount = useMemo(() => {
    if (!cast) return 0
    let total = 0
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        // A2: 'ボトルバック' の金額は bottleBackAmount を正本として扱うため、
        // ここでの旧 `count × %値` 計算からは除外する（二重計上防止）。
        if (type === 'ボトルバック') continue
        total += (cast.backRates[type] ?? 0) * count
      }
      // A2: 本指名ボトルバック（小計÷本指名人数×個別率）と延長指名バックを加算。
      total += w.bottleBackAmount ?? 0
      total += w.extensionBackAmount ?? 0
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
  const hourlyAndBackTotal = cast ? calcHourlyPay(cast.hourlyRate, totalHours) + totalBackAmount : 0

  // PDF/Word 確定仕様: 売上保証は **月単位** で計算し、不足差額は
  //   翌月15日支払い（= 'second' = 16〜月末期間の支払い）に上乗せする。
  //   旧 N5 の「半月単位 MAX」は廃止（半月単位だと月の前後で発動条件が異なり
  //   先方仕様と齟齬する）。
  //
  //   実装:
  //     - 当月の DailyWork 全件で月通常給与 + 月売上 × 保証率 を比較
  //     - period='second' のとき差額（>0）を「売上保証差額」として加算
  //     - period='first' は通常給与のみ（差額は持ち越し）
  const monthlyWork = useMemo(() => {
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1
    return dailyWork.filter((w) => {
      if (w.date.includes('-')) {
        return w.date.startsWith(`${curYear}-${String(curMonth).padStart(2, '0')}`)
      }
      const [m] = w.date.split('/')
      return parseInt(m, 10) === curMonth
    })
  }, [dailyWork])
  const monthlyShortfallBreakdown = useMemo(
    () => cast ? calcMonthlyGuaranteeShortfall(monthlyWork, cast) : null,
    [monthlyWork, cast],
  )
  const guaranteeShortfall =
    period === 'second' ? (monthlyShortfallBreakdown?.shortfall ?? 0) : 0
  const taxablePre = hourlyAndBackTotal + guaranteeShortfall
  const grossSalary = Math.floor(taxablePre * 0.9)                                // 支給額 (10% ホステス税控除後)
  const hostessTax = taxablePre - grossSalary                                     // ホステス税
  const guaranteeApplied = guaranteeShortfall > 0                                 // 売上保証差額が上乗せされたか
  const netSalary = grossSalary - dailyPayTotal - deductionTotal                  // 最終振込

  const getDayBackAmount = (w: DailyWork): number => {
    if (!cast) return 0
    let total = 0
    for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
      // A2: 'ボトルバック' は bottleBackAmount を正本にするため除外。
      if (type === 'ボトルバック') continue
      total += (cast.backRates[type] ?? 0) * count
    }
    total += w.bottleBackAmount ?? 0
    total += w.extensionBackAmount ?? 0
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

  // SalaryPage の「日払い記録」は口頭申請を受けた手入力ベース。
  // 自動計算額は持たず、DailyPayDialog 経由で operator / paidAt / メモを保存する。
  // adjustReason は calculatedAmount=0 のとき不要扱い (自動計算ベースなしのため)。
  const submitDailyPayFromDialog = (req: import('../data/mock').DailyPayRequest) => {
    addDailyPayRequest(req)
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

  // ボーイモード時はここで委譲 (全 hook 宣言済みなので Rules of Hooks 違反にはならない)
  if (isBoyMode) {
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 tabular-nums">時給¥{cast.hourlyRate.toLocaleString()} / 保証{(cast.guaranteeRate * 100).toFixed(0)}%</span>
                {/* PDF E: 「明細」ボタン — PayslipPopup を SalaryPage の選択期間
                    (period) と同じで開く。WaitingCastPage / AdminPage と同じ表示。 */}
                <button
                  onClick={() => setShowPayslip(true)}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-200 text-xs flex items-center gap-1"
                  title="給与明細ポップアップ"
                >
                  <FileText size={11} /> 明細
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="panel py-2 px-1">
                {/* PDF F: 値には「時給+バック」だけでなく「その他: 売上保証差額」も
                    含まれるため、ラベルは「税引前(合計)」に統一。
                    内訳は給与計算カード側の補足行で確認できる。 */}
                <div className="text-xs text-gray-500">税引前(合計)</div>
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
            {/* PDF F: 売上保証は月単位で計算し、翌月15日支払い (= 'second') に
                上乗せする。'first' 期間（1-15日／当月末払い）には反映しない。 */}
            {guaranteeApplied && monthlyShortfallBreakdown && (
              <div className="text-[11px] text-emerald-400 mt-1 text-center bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">
                ✓ 売上保証差額 ¥{monthlyShortfallBreakdown.shortfall.toLocaleString()} を「その他」項目として加算
                （月通常給与 ¥{monthlyShortfallBreakdown.monthlyRegularSalary.toLocaleString()} {'<'} 保証 ¥{monthlyShortfallBreakdown.guaranteeBase.toLocaleString()} = 月売上×{cast ? (cast.guaranteeRate * 100).toFixed(0) : 0}%）
              </div>
            )}
            {period === 'first' && monthlyShortfallBreakdown && monthlyShortfallBreakdown.shortfall > 0 && (
              <div className="text-[11px] text-gray-400 mt-1 text-center bg-white/5 border border-white/10 rounded px-2 py-1">
                ⓘ 当月の売上保証差額 ¥{monthlyShortfallBreakdown.shortfall.toLocaleString()} は <span className="font-bold text-gray-200">翌月15日支払い</span>（後半期間）に上乗せされます
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
                      {backTypeOrder.map((bt) => {
                        // A2: 'ボトルバック' は件数ではなく金額（bottleBackAmount）を表示。
                        // 件数集計から外しているため、ここで '-' のままだと当日ボトル
                        // バックが発生していてもセルが空になる。
                        if (bt === 'ボトルバック') {
                          const amt = w.bottleBackAmount ?? 0
                          return (
                            <td key={bt} className="py-1.5 px-1 text-right tabular-nums">
                              {amt > 0 ? `¥${amt.toLocaleString()}` : '-'}
                            </td>
                          )
                        }
                        return (
                          <td key={bt} className="py-1.5 px-1 text-right tabular-nums">
                            {w.backs[bt] ?? '-'}
                          </td>
                        )
                      })}
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
                  {backTypeOrder.map((bt) => {
                    if (bt === 'ボトルバック') {
                      const monthAmt = filteredWork.reduce((s, w) => s + (w.bottleBackAmount ?? 0), 0)
                      return (
                        <td key={bt} className="py-2 px-1 text-right tabular-nums">
                          {monthAmt > 0 ? `¥${monthAmt.toLocaleString()}` : '-'}
                        </td>
                      )
                    }
                    return (
                      <td key={bt} className="py-2 px-1 text-right tabular-nums">
                        {backTotals[bt] ?? '-'}
                      </td>
                    )
                  })}
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
        {(Object.keys(backTotals).length > 0 || filteredWork.some((w) => (w.bottleBackAmount ?? 0) > 0)) && (
          <div className="panel-gold p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gold">バック集計</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {(Object.entries(backTotals) as [BackType, number][]).map(([type, count]) => {
                // A2: 'ボトルバック' は backs から除外したのでここには出ない。
                // 旧 `count × %値` 表示は誤算出のため使わず、専用チップで別表示。
                const amount = (cast?.backRates[type] ?? 0) * count
                return (
                  <span key={type} className="bg-gold/10 border border-gold/30 text-gray-200 text-xs px-2 py-0.5 rounded tabular-nums">
                    {type}: {count}件 (¥{amount.toLocaleString()})
                  </span>
                )
              })}
              {/* A2: 本指名ボトルバックは backs に含めないため別チップで表示。
                  小計÷本指名人数×個別率で算出された金額のみ。 */}
              {(() => {
                const bottleTotal = filteredWork.reduce((s, w) => s + (w.bottleBackAmount ?? 0), 0)
                if (bottleTotal === 0) return null
                return (
                  <span className="bg-gold/10 border border-gold/30 text-gray-200 text-xs px-2 py-0.5 rounded tabular-nums">
                    ボトルバック: ¥{bottleTotal.toLocaleString()}
                  </span>
                )
              })()}
            </div>
            <div className="text-sm font-bold text-gold tabular-nums">バック合計: ¥{totalBackAmount.toLocaleString()}</div>
          </div>
        )}

        {/* Salary calculation (指示書§4.1 + PDF F 売上保証差額) */}
        <div className="panel p-4 mb-4 space-y-2">
          <h3 className="text-sm font-bold mb-2 text-gray-400">給与計算</h3>
          <div className="flex justify-between text-sm">
            {/* PDF F: 保証差額を含むためラベルを「税引前(合計)」に統一。
                内訳は直下の補足行で明示。 */}
            <span className="text-gray-500">税引前 (合計)</span>
            <span className="font-bold tabular-nums">¥{taxablePre.toLocaleString()}</span>
          </div>
          <div className="text-xs text-gray-600 ml-2 tabular-nums">
            ¥{cast?.hourlyRate.toLocaleString()} x {totalHours}h + バック ¥{totalBackAmount.toLocaleString()}
            {guaranteeShortfall > 0 && (
              <> + その他（売上保証差額）¥{guaranteeShortfall.toLocaleString()}</>
            )}
          </div>
          {/* PDF F: 売上保証差額は給与明細上「その他」項目として独立行で見える形にする。 */}
          {guaranteeShortfall > 0 && (
            <div className="flex justify-between text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
              <span>その他: 売上保証差額</span>
              <span className="tabular-nums">+¥{guaranteeShortfall.toLocaleString()}</span>
            </div>
          )}
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
          {/* PDF F: 月単位の売上保証集計を参考表示。'first' 期間でも判定可能。 */}
          {cast && monthlyShortfallBreakdown && monthlyShortfallBreakdown.shortfall > 0 && (
            <div className="text-[10px] text-amber-400/70 mt-1 border-t border-amber-500/20 pt-2">
              ※当月集計（参考）: 月通常給与 ¥{monthlyShortfallBreakdown.monthlyRegularSalary.toLocaleString()} {'<'} 保証額 ¥{monthlyShortfallBreakdown.guaranteeBase.toLocaleString()}（月売上 ¥{monthlyShortfallBreakdown.monthlyTotalSales.toLocaleString()} × {(cast.guaranteeRate * 100).toFixed(0)}%）→ 差額 ¥{monthlyShortfallBreakdown.shortfall.toLocaleString()} は翌月15日支払いに上乗せ
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
                <tr><th>時給+バック</th><td>¥${hourlyAndBackTotal.toLocaleString()}</td></tr>
                ${guaranteeShortfall > 0 ? `<tr><th>その他: 売上保証差額</th><td>+¥${guaranteeShortfall.toLocaleString()}</td></tr>` : ''}
                <tr><th>税引前 (合計)</th><td>¥${taxablePre.toLocaleString()}</td></tr>
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
              // A2: 日経表 PDF にもボトルバックを反映するため、bottleBackRateByCast を渡す。
              const work = computeDailyWork(
                cast.id, cast.name, attendanceRecords, billingRecords,
                cast.backRates['本指名'] ?? 0, bottleBackRateByCast,
              )
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

        {/* 税理士向け: 月次キャスト給与 CSV (キャスト1人ぶんでも、対象月の全キャスト分でも出せる) */}
        {user?.role !== 'cast' && (
          <button
            onClick={() => {
              const now = new Date()
              // 「月」セレクタを別途設けずに、今のところは「現在月」固定で出す。
              // 必要になれば後続 PR で月指定 UI を追加する想定。
              const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
              const csv = buildMonthlyCastSalaryCsv(
                casts, billingRecords, attendanceRecords, monthPrefix,
              )
              downloadCsv(`cast-salary-${monthPrefix}.csv`, csv)
            }}
            className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold mb-4 text-sm text-gray-400 flex items-center justify-center gap-2"
          >
            <FileDown size={14} /> 月次キャスト給与 CSV (税理士提出用)
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

      {/* DailyPayDialog: 口頭申請の手入力でも operator / paidAt / メモ / 理由を保存する */}
      <DailyPayDialog
        open={showDailyPayRecord && !!cast}
        cast={cast ? { id: cast.id, name: cast.name } : null}
        calculatedAmount={0}
        targetDate={new Date().toISOString().slice(0, 10)}
        operator={user?.displayName ?? user?.username}
        staffType="cast"
        onSubmit={submitDailyPayFromDialog}
        onClose={() => setShowDailyPayRecord(false)}
      />

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

      {/* PDF E: 給与明細ポップアップ — SalaryPage の選択期間 (period) と
          同期して開く。WaitingCastPage / AdminPage と同じ計算ロジック。 */}
      <PayslipPopup
        open={showPayslip}
        cast={cast ?? null}
        period={period}
        onClose={() => setShowPayslip(false)}
      />
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
