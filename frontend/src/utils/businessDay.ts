/**
 * 追補02 R11-3 準拠: 営業日の定義
 *
 * 20:00 開始 → 翌 3:00 (あるいは朝境界時刻まで) に終了する営業を
 * 「開始日の営業日」として集計するためのユーティリティ。
 *
 * 境界時刻は `StoreSettings.businessDayBoundaryHour` (未実装時はデフォルト 6) を参照可能。
 *
 * 例:
 *   2026-04-10 20:00 出勤 → 2026-04-11 03:00 退勤 → 営業日 2026-04-10
 *   2026-04-10 20:00 出勤 → 2026-04-11 06:01 退勤 → 営業日 2026-04-11 (境界超え)
 */

export function getBusinessDay(
  timestamp: Date | string,
  boundaryHour = 6,
): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const hour = d.getHours()
  if (hour < boundaryHour) {
    // 境界時刻以前なら前営業日扱い
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    return toIsoDate(prev)
  }
  return toIsoDate(d)
}

/**
 * 今日の営業日を返す (= 現在時刻 vs 境界時刻で判定)
 */
export function getTodayBusinessDay(boundaryHour = 6): string {
  return getBusinessDay(new Date(), boundaryHour)
}

/**
 * 営業日名の表示用フォーマット (例: "2026-04-10 (金)")
 */
export function formatBusinessDay(businessDay: string): string {
  const d = new Date(businessDay)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${businessDay} (${dow})`
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
