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

  // バック内訳 (本指名 / 場内指名 / 同伴 / ドリンク系 / ボトル / 延長指名) を
  // 件数+金額で表示する。ドリンク系 (FD/本D/Fカク/本カク/本カクW/Fショ/本ショ/
  // FP/本P/FB/本B) はメニュー数が多いのでまとめて「ドリンク」1 行に集約する。
  const breakdown = useMemo(() => {
    const init = {
      shimei: { count: 0, amount: 0 },
      banai: { count: 0, amount: 0 },
      douhan: { count: 0, amount: 0 },
      drinks: { count: 0, amount: 0 },
      bottleAmount: 0,
      extensionAmount: 0,
    }
    if (!cast) return init
    for (const w of filteredWork) {
      for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
        const rate = cast.backRates[type] ?? 0
        switch (type) {
          case '本指名':   init.shimei.count += count; init.shimei.amount += count * rate; break
          case '場内指名': init.banai.count += count;  init.banai.amount  += count * rate; break
          case '同伴':     init.douhan.count += count; init.douhan.amount += count * rate; break
          case 'ボトルバック': break  // bottleBackAmount を正本
          default:
            // ドリンク系全種 + ヘルプ / その他 はまとめる
            init.drinks.count += count
            init.drinks.amount += count * rate
        }
      }
      init.bottleAmount += w.bottleBackAmount ?? 0
      init.extensionAmount += w.extensionBackAmount ?? 0
    }
    return init
  }, [filteredWork, cast])

  // 日払いの自動計算と実支給の差分 (= プラス/マイナス調整)。理由付き。
  // 第3弾 DailyPayDialog 経由のレコードのみ calculatedAmount が入る。
  const adjustments = useMemo(() => {
    if (!cast) return []
    return dailyPayRequests
      .filter((r) => r.castId === cast.id
        && r.calculatedAmount != null
        && r.amount !== r.calculatedAmount)
      .map((r) => ({
        diff: r.amount - (r.calculatedAmount ?? 0),
        reason: r.adjustReason ?? '',
        date: r.date,
      }))
  }, [dailyPayRequests, cast])
  const adjustTotal = adjustments.reduce((s, a) => s + a.diff, 0)
  const hourlyPay = cast ? calcHourlyPay(cast.hourlyRate, totalHours) : 0

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
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">時給分</th>
              <td className="text-right tabular-nums">¥{hourlyPay.toLocaleString()}</td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">本指名</th>
              <td className="text-right tabular-nums">
                {breakdown.shimei.count}件 / ¥{breakdown.shimei.amount.toLocaleString()}
              </td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">場内指名</th>
              <td className="text-right tabular-nums">
                {breakdown.banai.count}件 / ¥{breakdown.banai.amount.toLocaleString()}
              </td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">同伴</th>
              <td className="text-right tabular-nums">
                {breakdown.douhan.count}件 / ¥{breakdown.douhan.amount.toLocaleString()}
              </td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">ドリンク (バック)</th>
              <td className="text-right tabular-nums">
                {breakdown.drinks.count}件 / ¥{breakdown.drinks.amount.toLocaleString()}
              </td>
            </tr>
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal pl-3">ボトルバック</th>
              <td className="text-right tabular-nums">¥{breakdown.bottleAmount.toLocaleString()}</td>
            </tr>
            {breakdown.extensionAmount > 0 && (
              <tr>
                <th className="text-left text-gray-400 py-1.5 font-normal pl-3">延長指名バック</th>
                <td className="text-right tabular-nums">¥{breakdown.extensionAmount.toLocaleString()}</td>
              </tr>
            )}
            <tr>
              <th className="text-left text-gray-400 py-1.5 font-normal border-t border-white/10">時給+バック 小計</th>
              <td className="text-right tabular-nums border-t border-white/10">¥{hourlyAndBackTotal.toLocaleString()}</td>
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
            {/* 日払い時に手動調整 (calculatedAmount との差) が入った場合、内訳を表示。
                プラス: 自動計算より多く支給 (ボーナス等)、マイナス: 控除 (研修費等)。
                合計だけ「日払い済」行に含まれるので、ここは内訳のみ参考表示。 */}
            {adjustments.length > 0 && (
              <>
                <tr className={adjustTotal >= 0 ? 'text-emerald-400/80' : 'text-amber-400/80'}>
                  <th className="text-left py-1.5 font-normal text-xs">
                    プラス/マイナス調整 (日払い、参考)
                  </th>
                  <td className="text-right tabular-nums text-xs">
                    {adjustTotal >= 0 ? '+' : ''}¥{adjustTotal.toLocaleString()}
                  </td>
                </tr>
                {adjustments.map((a, i) => (
                  <tr key={`adj-${i}`} className="text-xs">
                    <th className="text-left text-gray-500 py-0.5 font-normal pl-3">
                      {a.date} {a.reason || '(理由未記入)'}
                    </th>
                    <td className={`text-right tabular-nums ${a.diff >= 0 ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>
                      {a.diff >= 0 ? '+' : ''}¥{a.diff.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </>
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
