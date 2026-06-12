/**
 * 売上保証差額の月締め計算 (PDF/Word 確定仕様)
 *
 * 仕様:
 * - 売上保証は **月単位** で計算する (半月単位ではない)
 * - 月の通常給与（時給+バック合計）が「月小型売上 × 保証率」を下回るときに
 *   差額を発生させ、**翌月15日支払い (= 翌月の 16〜月末期間の振込)** に
 *   「売上保証差額」として上乗せする
 * - 給与明細上は「その他項目」として独立表示する
 *
 * PDF 例 (りさ、保証率40%):
 *   - 月小型売上 10万、月通常給与 30万 → 保証額 4万 < 給与 30万 → 差額 0 (発動なし)
 *   - 月小型売上 10万、月通常給与 2万 → 保証額 4万 > 給与 2万 → 差額 2万 を翌月15日に上乗せ
 */

import type { Cast, DailyWork, BackType } from '../data/mock'
import { calcHourlyPay } from './payroll'
import { getBackRate } from './backRate'

export interface MonthlyGuaranteeBreakdown {
  /** 月通常給与 = sum(時給×時間 + 各種バック + 延長指名バック + 本指名ボトルバック) */
  monthlyRegularSalary: number
  /** 月小型売上 (小計合計) */
  monthlyTotalSales: number
  /** 月保証額 = 月小型売上 × 保証率 (整数、端数切り捨て) */
  guaranteeBase: number
  /** 差額 = max(0, guaranteeBase − monthlyRegularSalary) */
  shortfall: number
}

/**
 * 月単位の売上保証差額を計算する。
 *
 * 引数 `monthlyWork` は対象月の DailyWork 全件 (1日〜月末)。
 * SalaryPage / 日経表側で月フィルタした結果を渡す前提。
 *
 * 計算:
 *   monthlyRegularSalary = Σ (calcHourlyPay(hourlyRate, w.hours)
 *                          + Σ (backs[type] × backRates[type], type≠'ボトルバック')
 *                          + extensionBackAmount
 *                          + bottleBackAmount)
 *   guaranteeBase = floor(Σ sales × guaranteeRate)
 *   shortfall = max(0, guaranteeBase − monthlyRegularSalary)
 *
 * 'ボトルバック' は backs[type] の集計から除外する (A2 で bottleBackAmount を
 * 正本にしたため二重計上を避ける)。
 */
export function calcMonthlyGuaranteeShortfall(
  monthlyWork: ReadonlyArray<DailyWork>,
  cast: Cast,
): MonthlyGuaranteeBreakdown {
  let monthlyRegularSalary = 0
  let monthlyTotalSales = 0
  for (const w of monthlyWork) {
    monthlyRegularSalary += calcHourlyPay(cast.hourlyRate, w.hours)
    for (const [type, count] of Object.entries(w.backs) as [BackType, number][]) {
      if (type === 'ボトルバック') continue
      monthlyRegularSalary += getBackRate(cast.backRates, type) * count
    }
    monthlyRegularSalary += w.extensionBackAmount ?? 0
    monthlyRegularSalary += w.bottleBackAmount ?? 0
    monthlyTotalSales += w.sales
  }
  const guaranteeBase = Math.floor(monthlyTotalSales * cast.guaranteeRate)
  const shortfall = Math.max(0, guaranteeBase - monthlyRegularSalary)
  return { monthlyRegularSalary, monthlyTotalSales, guaranteeBase, shortfall }
}
