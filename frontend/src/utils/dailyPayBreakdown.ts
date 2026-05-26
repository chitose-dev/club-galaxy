import type {
  AttendanceRecord,
  BillingRecord,
  Cast,
  DailyPayRequest,
} from '../data/mock'
import { calcHourlyPay } from './payroll'
import { computeDailyWork } from './dailyWork'

/**
 * DailyPayDialog の「本日の稼働実績 / 本日全額入力」用ヘルパ。
 *
 * 1 日分の稼働内訳を集計し、当日既支払いの日払い額もまとめて返す。
 *   - workHours : AttendanceRecord の workHours 合計 (15 分丸めは attendance 側責務)
 *   - hourlyPay : calcHourlyPay(cast.hourlyRate, workHours)
 *   - backTotal : Σ (backs[type] × backRates[type], type≠'ボトルバック')
 *                 + extensionBackAmount + bottleBackAmount
 *   - gross     : hourlyPay + backTotal
 *   - deduction : Math.floor(gross * 0.1)     // 既存 10% 控除と一致
 *   - net       : gross - deduction
 *   - paidToday : 同営業日に既に登録済の DailyPayRequest 合計
 *
 * 設計メモ:
 *   - 既存 castLedger.ts の「日次行 P 合計 → tax → total」算出と同じ式に揃え
 *     ている。日払いダイアログ上の「本日支給目安」が、後日まとめて見る給与
 *     明細と一致しないと運用者が混乱するため。
 *   - bottleBackRateByCast を渡さない経路 (省略時 {}) では bottleBackAmount は
 *     0 として計上される。当面の DailyPayDialog 表示ではボトルバックを概算扱い
 *     にして許容する (= 厳密値は給与明細で確認)。
 */
export interface DailyPayBreakdownResult {
  workHours: number
  hourlyPay: number
  backTotal: number
  gross: number
  deduction: number
  net: number
  paidToday: number
}

export function computeDailyPayBreakdown(
  cast: Cast,
  date: string,
  attendanceRecords: readonly AttendanceRecord[],
  billingRecords: readonly BillingRecord[],
  dailyPayRequests: readonly DailyPayRequest[],
  bottleBackRateByCast: Record<string, number> = {},
): DailyPayBreakdownResult {
  const shimeiBackRate = cast.backRates?.['本指名'] ?? 0
  const dwAll = computeDailyWork(
    cast.id,
    cast.name,
    attendanceRecords as AttendanceRecord[],
    billingRecords as BillingRecord[],
    shimeiBackRate,
    bottleBackRateByCast,
  )
  const dw = dwAll.find((w) => w.date === date)

  const workHours = dw?.hours ?? 0
  const hourlyPay = calcHourlyPay(cast.hourlyRate, workHours)

  const backsFromCount = dw
    ? (Object.keys(dw.backs) as Array<keyof typeof dw.backs>).reduce((sum, k) => {
        if (k === 'ボトルバック') return sum
        return sum + (dw.backs[k] ?? 0) * (cast.backRates?.[k] ?? 0)
      }, 0)
    : 0
  const extensionBack = dw?.extensionBackAmount ?? 0
  const bottleBack = dw?.bottleBackAmount ?? 0
  const backTotal = backsFromCount + extensionBack + bottleBack

  const gross = hourlyPay + backTotal
  const deduction = Math.floor(gross * 0.1)
  const net = gross - deduction

  const paidToday = dailyPayRequests
    .filter((r) => r.castId === cast.id && r.date === date)
    .reduce((s, r) => s + r.amount, 0)

  return { workHours, hourlyPay, backTotal, gross, deduction, net, paidToday }
}
