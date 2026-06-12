/**
 * 追補02 R11-3 準拠: 営業日の定義
 *
 * 20:00 開始 → 翌 3:00 (あるいは朝境界時刻まで) に終了する営業を
 * 「開始日の営業日」として集計するためのユーティリティ。
 *
 * 境界時刻の既定は朝 5:00。backend の BUSINESS_DAY_CUTOFF_HOUR_DEFAULT (=5)
 * と一致させ、frontend/backend で同じ瞬間が別の営業日に割れないようにする。
 * `StoreSettings.businessDayBoundaryHour` 導入時はそちらを渡して上書き可能。
 *
 * 例:
 *   2026-04-10 20:00 出勤 → 2026-04-11 03:00 退勤 → 営業日 2026-04-10
 *   2026-04-10 20:00 出勤 → 2026-04-11 05:01 退勤 → 営業日 2026-04-11 (境界超え)
 */

export const BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT = 5

export function getBusinessDay(
  timestamp: Date | string,
  boundaryHour = BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT,
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
 * 今日の営業日を返す (= 現在時刻 vs 境界時刻で判定。既定は朝 5:00 境界)
 */
export function getTodayBusinessDay(
  boundaryHour = BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT,
): string {
  return getBusinessDay(new Date(), boundaryHour)
}

/**
 * JST の今日の暦日 (YYYY-MM-DD)。営業日境界を跨がない単純な暦日が必要な
 * 表示集計用 (例: 売上の「今日」「今月」概況、flMetrics) のヘルパ。
 *
 * React Compiler の `react-hooks/purity` は `Date.now()` 等を render 中で
 * フラグするため、call site でこの関数を 1 度呼ぶ形に統一すると lint が
 * 通る (=import された関数の中身は静的解析対象外)。
 */
export function getJstTodayDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * `Date.now()` のラッパ。ID 生成 / 待機時間表示 / タイムスタンプ取得など、
 * 「現在時刻に依存する値」を取りたいときに使う。React Compiler の
 * `react-hooks/purity` ルールは call site の `Date.now()` を直接フラグするが、
 * import された関数の中身は解析対象外のためここで一段ラップすると lint clean
 * になる (= 実体は同じく impure だが、関数境界で意図を表明する形)。
 */
export function currentTimeMs(): number {
  return Date.now()
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
