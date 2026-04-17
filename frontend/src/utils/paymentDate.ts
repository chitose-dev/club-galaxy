/**
 * 給与支払日の算出ユーティリティ。
 * 前半(1-15日)は当月末日払い、後半(16-月末)は翌月15日払い。
 * 土日祝日と重なる場合は直前の平日に前倒し。
 *
 * 祝日判定は軽量のため 2025-2027 の固定テーブルで実装。
 * 必要に応じて `japanese-holidays` パッケージに差し替え可能。
 */

// YYYY-MM-DD 形式の日本の祝日(2025-2027, 振替休日含む)
const HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23', '2025-02-24',
  '2025-03-20', '2025-04-29', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-06', '2025-07-21', '2025-08-11', '2025-09-15', '2025-09-23',
  '2025-10-13', '2025-11-03', '2025-11-23', '2025-11-24',
  // 2026
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23',
  '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22',
  '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23',
  // 2027
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23',
  '2027-03-21', '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04',
  '2027-05-05', '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23',
  '2027-10-11', '2027-11-03', '2027-11-23',
])

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isHoliday(d: Date): boolean {
  return HOLIDAYS.has(ymd(d))
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

export function isBusinessDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d)
}

/**
 * 指定日が非営業日(土日祝)の場合、直前の平日を返す。
 */
export function shiftToPreviousBusinessDay(d: Date): Date {
  const result = new Date(d)
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() - 1)
  }
  return result
}

/**
 * 給与支払日の算出。
 * @param period 'first' = 1-15日分(当月末日払い) / 'second' = 16-月末分(翌月15日払い)
 * @param year 対象期間が属する年
 * @param month 対象期間が属する月 (1-12)
 * @returns 前倒し適用済みの支払日
 */
export function getPaymentDate(period: 'first' | 'second', year: number, month: number): Date {
  if (period === 'first') {
    // 1-15日分 → 当月末日払い
    // new Date(year, month, 0) = month月の最終日 (monthは1始まり、Date内部は0始まりなので、month月0日 = month-1月の末日 = 当月末)
    // ただし当関数の引数monthは1-12、JSのDateのmonthは0-11なので、
    // 当月末 = new Date(year, month, 0)
    return shiftToPreviousBusinessDay(new Date(year, month, 0))
  } else {
    // 16-月末分 → 翌月15日払い
    return shiftToPreviousBusinessDay(new Date(year, month, 15))
  }
}

export function formatPaymentDate(d: Date): string {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
}
