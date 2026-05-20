/**
 * 給与明細ポップアップ (PDF E)
 *
 * 待機画面 / 勤怠画面など SalaryPage の外側からキャストの給与明細を
 * 即座に確認 / 印刷できるようにする共通コンポーネント。
 *
 * 計算ロジックは SalaryPage と齟齬しないよう、共通 utility を再利用する:
 *  - utils/dailyWork.ts → computeDailyWork
 *  - utils/payroll.ts   → calcHourlyPay
 *  - utils/saleGuarantee.ts → calcMonthlyGuaranteeShortfall
 *
 * 印刷は body に `print-payslip-only` クラスを付けてから window.print() し、
 * グローバル CSS で他の画面 UI を非表示にする方針（重複描画を避けるため、
 * 印刷用 HTML は同じ DOM 上に `print-payslip` クラス付きで残す）。
 */
import { useMemo } from 'react'
import { useStore } from '../store'
import { computeDailyWork } from '../utils/dailyWork'
import { calcHourlyPay } from '../utils/payroll'
import { calcMonthlyGuaranteeShortfall } from '../utils/saleGuarantee'
import type { Cast, BackType, DailyWork } from '../data/mock'
import Modal from './Modal'
import { GhostButton, GoldButton } from './Buttons'
import { Printer } from 'lucide-react'

export interface PayslipPopupProps {
  open: boolean
  cast: Cast | null
  /** 'first' = 1〜15 日 / 'second' = 16〜末日。
   *  指定なしは現在日付から自動判定。 */
  period?: 'first' | 'second'
  onClose: () => void
}

function getCurrentPeriod(): 'first' | 'second' {
  return new Date().getDate() <= 15 ? 'first' : 'second'
}

export default function PayslipPopup({ open, cast, period: forcedPeriod, onClose }: PayslipPopupProps) {
  const { casts, attendanceRecords, billingRecords, dailyPayRequests, deductions, storeSettings } = useStore()

  const period = forcedPeriod ?? getCurrentPeriod()

  // 全キャストの「ボトルバック」率（A2 配線と同じ形で computeDailyWork に渡す）
  const bottleBackRateByCast = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of casts) {
      m[c.name] = c.backRates['ボトルバック'] ?? 0
    }
    return m
  }, [casts])

  const dailyWork: DailyWork[] = useMemo(() => {
    if (!cast) return []
    return computeDailyWork(
      cast.id, cast.name, attendanceRecords, billingRecords,
      cast.backRates['本指名'] ?? 0,
      bottleBackRateByCast,
    )
  }, [cast, attendanceRecords, billingRecords, bottleBackRateByCast])

  const filteredWork = useMemo(() => {
    return dailyWork.filter((w) => {
      const day = w.date.includes('-')
        ? parseInt(w.date.split('-')[2], 10)
        : parseInt(w.date.split('/')[1], 10)
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [dailyWork, period])

  const totalHours = filteredWork.reduce((s, w) => s + w.hours, 0)

  // SalaryPage と同じ式: 'ボトルバック' は bottleBackAmount を正本、
  // extensionBackAmount / bottleBackAmount を別行で加算。
  const totalBackAmount = useMemo(() => {
    if (!cast) return 0
    let total = 0
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        if (type === 'ボトルバック') continue
        total += (cast.backRates[type] ?? 0) * count
      }
      total += w.bottleBackAmount ?? 0
      total += w.extensionBackAmount ?? 0
    }
    return total
  }, [filteredWork, cast])

  const hourlyAndBackTotal = cast ? calcHourlyPay(cast.hourlyRate, totalHours) + totalBackAmount : 0

  // 月締めの売上保証差額（PDF F）
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
  const monthlyShortfall = useMemo(
    () => cast ? calcMonthlyGuaranteeShortfall(monthlyWork, cast) : null,
    [monthlyWork, cast],
  )
  const guaranteeShortfall = period === 'second' ? (monthlyShortfall?.shortfall ?? 0) : 0

  const taxablePre = hourlyAndBackTotal + guaranteeShortfall
  const grossSalary = Math.floor(taxablePre * 0.9)
  const hostessTax = taxablePre - grossSalary

  const dailyPayTotal = useMemo(() => {
    if (!cast) return 0
    return dailyPayRequests
      .filter((r) => r.castId === cast.id)
      .reduce((s, r) => s + r.amount, 0)
  }, [dailyPayRequests, cast])

  const castDeductions = cast ? deductions.filter((d) => d.castId === cast.id) : []
  const deductionTotal = castDeductions.reduce((s, d) => s + d.amount, 0)
  const netSalary = grossSalary - dailyPayTotal - deductionTotal

  const printPayslip = () => {
    document.body.classList.add('print-payslip-only')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('print-payslip-only')
    }, 50)
  }

  if (!cast) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`給与明細 - ${cast.name}（${period === 'first' ? '1〜15日' : '16〜末日'} ）`}
      footer={
        <>
          <GhostButton onClick={onClose} className="flex-1">閉じる</GhostButton>
          <GoldButton onClick={printPayslip} className="flex-1 flex items-center justify-center gap-1.5">
            <Printer size={14} /> 印刷
          </GoldButton>
        </>
      }
    >
      <div className="print-payslip">
        <div className="text-center text-xs text-gray-400 mb-2 no-print-block">
          {storeSettings.storeName}
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-white/5">
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal">対象期間</th>
              <td className="text-right tabular-nums">{period === 'first' ? '1〜15日' : '16〜末日'}</td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal">勤務時間 (合計)</th>
              <td className="text-right tabular-nums">{totalHours.toFixed(1)} h</td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal">時給+バック</th>
              <td className="text-right tabular-nums">¥{hourlyAndBackTotal.toLocaleString()}</td>
            </tr>
            {guaranteeShortfall > 0 && (
              <tr className="text-emerald-400">
                <th className="text-left py-1.5 font-normal">その他: 売上保証差額</th>
                <td className="text-right tabular-nums">+¥{guaranteeShortfall.toLocaleString()}</td>
              </tr>
            )}
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal">税引前 (合計)</th>
              <td className="text-right font-bold tabular-nums">¥{taxablePre.toLocaleString()}</td>
            </tr>
            <tr className="text-red-400">
              <th className="text-left py-1.5 font-normal">ホステス税 (-10%)</th>
              <td className="text-right tabular-nums">-¥{hostessTax.toLocaleString()}</td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal">支給額</th>
              <td className="text-right font-bold tabular-nums">¥{grossSalary.toLocaleString()}</td>
            </tr>
            {dailyPayTotal > 0 && (
              <tr className="text-red-400">
                <th className="text-left py-1.5 font-normal">日払い済</th>
                <td className="text-right tabular-nums">-¥{dailyPayTotal.toLocaleString()}</td>
              </tr>
            )}
            {deductionTotal > 0 && (
              <tr className="text-red-400">
                <th className="text-left py-1.5 font-normal">天引き合計</th>
                <td className="text-right tabular-nums">-¥{deductionTotal.toLocaleString()}</td>
              </tr>
            )}
            <tr>
              <th className="text-left text-gold py-2 text-base">最終振込額</th>
              <td className="text-right font-bold text-2xl text-gold tabular-nums">¥{netSalary.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        {monthlyShortfall && monthlyShortfall.shortfall > 0 && period === 'first' && (
          <div className="text-[10px] text-gray-500 mt-2 border-t border-white/10 pt-2">
            ⓘ 当月の売上保証差額 ¥{monthlyShortfall.shortfall.toLocaleString()} は翌月15日支払い（後半期間）に上乗せされます
          </div>
        )}
      </div>
    </Modal>
  )
}
