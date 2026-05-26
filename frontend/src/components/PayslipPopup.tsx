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
import { openPrintWindow, escapeHtml } from '../utils/print'

export interface PayslipPopupProps {
  open: boolean
  cast: Cast | null
  /** 'first' = 1〜15 日 / 'second' = 16〜末日。
   *  指定なしは現在日付から自動判定。 */
  period?: 'first' | 'second'
  /** 対象年 (4 桁)。指定なしは現在年。 */
  year?: number
  /** 対象月 (1-12)。指定なしは現在月。 */
  month?: number
  onClose: () => void
}

function getCurrentPeriod(): 'first' | 'second' {
  return new Date().getDate() <= 15 ? 'first' : 'second'
}

/** 対象月の `YYYY-MM` プレフィックス。`date` フィールドが `YYYY-MM-DD` or
 *  `M/D` (旧データ) いずれの形式でも判定できるように、両形式を許容する関数を
 *  生成して返す。 */
function makeMonthMatcher(year: number, month: number): (date: string) => boolean {
  const ymPrefix = `${year}-${String(month).padStart(2, '0')}`
  return (date: string) => {
    if (date.includes('-')) return date.startsWith(ymPrefix)
    const parts = date.split('/')
    if (parts.length < 2) return false
    return parseInt(parts[0], 10) === month
  }
}

/** 日 (1-31) を取得。`YYYY-MM-DD` / `M/D` 双方を許容。 */
function getDayOfMonth(date: string): number {
  if (date.includes('-')) return parseInt(date.split('-')[2], 10)
  const parts = date.split('/')
  return parts.length >= 2 ? parseInt(parts[1], 10) : NaN
}

export default function PayslipPopup({
  open, cast, period: forcedPeriod,
  year: forcedYear, month: forcedMonth,
  onClose,
}: PayslipPopupProps) {
  const { casts, attendanceRecords, billingRecords, dailyPayRequests, deductions, storeSettings } = useStore()

  // 対象期間の決定。default は「現在年月 + 現在 period」(従来挙動)。
  const now = useMemo(() => new Date(), [])
  const year = forcedYear ?? now.getFullYear()
  const month = forcedMonth ?? (now.getMonth() + 1)
  const period = forcedPeriod ?? getCurrentPeriod()
  const periodLabel = `${year}年${month}月 ${period === 'first' ? '前半 1〜15日' : '後半 16〜末日'}`
  const matchMonth = useMemo(() => makeMonthMatcher(year, month), [year, month])

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
      if (!matchMonth(w.date)) return false
      const day = getDayOfMonth(w.date)
      if (!Number.isFinite(day)) return false
      return period === 'first' ? day <= 15 : day >= 16
    })
  }, [dailyWork, period, matchMonth])

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
  // 対象期間で絞り、過去月の調整が他月の明細に混入しないようにする。
  const adjustments = useMemo(() => {
    if (!cast) return []
    return dailyPayRequests
      .filter((r) => {
        if (r.castId !== cast.id) return false
        if (r.calculatedAmount == null) return false
        if (r.amount === r.calculatedAmount) return false
        if (!matchMonth(r.date)) return false
        const day = getDayOfMonth(r.date)
        if (!Number.isFinite(day)) return false
        return period === 'first' ? day <= 15 : day >= 16
      })
      .map((r) => ({
        diff: r.amount - (r.calculatedAmount ?? 0),
        reason: r.adjustReason ?? '',
        date: r.date,
      }))
  }, [dailyPayRequests, cast, matchMonth, period])
  const adjustTotal = adjustments.reduce((s, a) => s + a.diff, 0)
  const hourlyPay = cast ? calcHourlyPay(cast.hourlyRate, totalHours) : 0

  const hourlyAndBackTotal = cast ? calcHourlyPay(cast.hourlyRate, totalHours) + totalBackAmount : 0

  // 月締めの売上保証差額（PDF F）。対象月で絞る (旧実装は常に「現在月」だった
  // ため過去月の明細閲覧で正しい値が出なかった)。
  const monthlyWork = useMemo(() => {
    return dailyWork.filter((w) => matchMonth(w.date))
  }, [dailyWork, matchMonth])
  const monthlyShortfall = useMemo(
    () => cast ? calcMonthlyGuaranteeShortfall(monthlyWork, cast) : null,
    [monthlyWork, cast],
  )
  const guaranteeShortfall = period === 'second' ? (monthlyShortfall?.shortfall ?? 0) : 0

  const taxablePre = hourlyAndBackTotal + guaranteeShortfall
  const grossSalary = Math.floor(taxablePre * 0.9)
  const hostessTax = taxablePre - grossSalary

  // 日払い合計は対象期間 (year/month + 前半/後半) に絞る。
  // 旧実装は cast.id だけで全期間合算していたため、過去月明細を開いたときに
  // 「最終振込額が大幅マイナス」になっていた。
  const dailyPayTotal = useMemo(() => {
    if (!cast) return 0
    return dailyPayRequests
      .filter((r) => {
        if (r.castId !== cast.id) return false
        if (!matchMonth(r.date)) return false
        const day = getDayOfMonth(r.date)
        if (!Number.isFinite(day)) return false
        return period === 'first' ? day <= 15 : day >= 16
      })
      .reduce((s, r) => s + r.amount, 0)
  }, [dailyPayRequests, cast, matchMonth, period])

  // Deduction には日付フィールドが無いため、現状は全期間扱い。
  // UI 側 (給与明細注記) で「天引きは現時点では全期間合算扱い」を表示する。
  const castDeductions = cast ? deductions.filter((d) => d.castId === cast.id) : []
  const deductionTotal = castDeductions.reduce((s, d) => s + d.amount, 0)
  const netSalary = grossSalary - dailyPayTotal - deductionTotal

  // 画面 DOM 依存の body.print-payslip-only 方式 (グローバル CSS で他 UI を隠す)
  // から脱却し、openPrintWindow に必須項目を埋めて投げる方式に統一する。
  // 印刷専用 HTML を別ウィンドウに描画 → window.print() で印刷ダイアログを開く
  // ことで、画面上のスタイル変更や他コンポーネントの再描画と干渉しない。
  const printPayslip = () => {
    if (!cast) return
    const yen = (n: number) => `¥${n.toLocaleString()}`
    const rows: Array<[string, string]> = [
      ['対象期間', periodLabel],
      ['勤務時間 (合計)', `${totalHours.toFixed(1)} h`],
      ['時給分', yen(hourlyPay)],
      ['本指名', `${breakdown.shimei.count}件 / ${yen(breakdown.shimei.amount)}`],
      ['場内指名', `${breakdown.banai.count}件 / ${yen(breakdown.banai.amount)}`],
      ['同伴', `${breakdown.douhan.count}件 / ${yen(breakdown.douhan.amount)}`],
      ['ドリンク (バック)', `${breakdown.drinks.count}件 / ${yen(breakdown.drinks.amount)}`],
      ['ボトルバック', yen(breakdown.bottleAmount)],
    ]
    if (breakdown.extensionAmount > 0) {
      rows.push(['延長指名バック', yen(breakdown.extensionAmount)])
    }
    rows.push(['時給+バック 小計', yen(hourlyAndBackTotal)])
    if (guaranteeShortfall > 0) {
      rows.push(['その他: 売上保証差額', `+${yen(guaranteeShortfall)}`])
    }
    rows.push(['税引前 (合計)', yen(taxablePre)])
    rows.push(['ホステス税 (-10%)', `-${yen(hostessTax)}`])
    rows.push(['支給額', yen(grossSalary)])
    if (dailyPayTotal > 0) rows.push(['日払い済', `-${yen(dailyPayTotal)}`])
    if (deductionTotal > 0) rows.push(['天引き合計', `-${yen(deductionTotal)}`])
    rows.push(['最終振込額', yen(netSalary)])
    // 印刷用 HTML はラベル (rows[][0]) と値 (rows[][1]) を全て escapeHtml で
    // 包む。store name / cast name は管理画面入力なので XSS 経路になりうる。
    const tbody = rows
      .map(([l, v]) => `<tr><th>${escapeHtml(l)}</th><td>${escapeHtml(v)}</td></tr>`)
      .join('')
    const body = `
      <h2>給与明細</h2>
      <p class="center">${escapeHtml(storeSettings.storeName)}</p>
      <p class="center bold">${escapeHtml(cast.name)}</p>
      <p class="center muted">${escapeHtml(periodLabel)}</p>
      <table>${tbody}</table>
    `
    const filename =
      `給与明細_${cast.name}_${year}-${String(month).padStart(2, '0')}_${period === 'first' ? '前半' : '後半'}`
    openPrintWindow(body, filename, { width: 400, height: 700 })
  }

  if (!cast) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`給与明細 - ${cast.name}（${periodLabel}）`}
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
              <td className="text-right tabular-nums">{periodLabel}</td>
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
