/**
 * 追補03 R25: キャスト時給計算
 *
 * 仕様:
 *   - 勤務開始後、最初の 15 分はルーズタイム (給与対象外)
 *   - 16 分目以降は 15 分単位で切り上げ加算 (切り捨てではない点に注意)
 *   - 時給 2000 円の例:
 *       15 分以下 → ¥0
 *       16〜30 分 → ¥500  (1/4 hour)
 *       31〜45 分 → ¥1000 (2/4 hour)
 *       46〜60 分 → ¥1500 (3/4 hour)
 *       61〜75 分 → ¥2000 (4/4 hour = 1 hour)
 *       以降 15 分毎に +¥500
 *
 * 先方の記載:
 *   「16 分で 500 円、31 分で 1000 円、46 分で 1500 円、01 分 (61 分) で 2000 円」
 *   → 15 分を 1 ブロックとして、ルーズタイム後の各ブロック境界に達したら
 *     そのブロックぶんが発生する
 */

export const LOOSE_TIME_MINUTES = 15
export const PAY_UNIT_MINUTES = 15

/**
 * 実勤務分数 → 給与対象分数
 *
 * @param workMinutes 勤務分数 (0 以上)
 * @param looseMinutes ルーズタイム (既定 15)
 * @param unitMinutes 給与単位 (既定 15)
 * @returns 給与対象分数 (15 の倍数)
 */
export function calcPaidMinutes(
  workMinutes: number,
  looseMinutes = LOOSE_TIME_MINUTES,
  unitMinutes = PAY_UNIT_MINUTES,
): number {
  if (workMinutes <= looseMinutes) return 0
  // ルーズタイム超過後、unit の倍数に切り上げ (先方例「16分で500円 = 15分ぶん」に合わせる)
  const afterLoose = workMinutes - looseMinutes
  // 16 分 → 1、30 分 → 15、31 分 → 16、45 分 → 30 … を 15 の倍数に切り上げ
  const units = Math.ceil(afterLoose / unitMinutes)
  return units * unitMinutes
}

/**
 * 時給 × 実勤務時間 (hours, 小数可) から給与額を算出
 * ルーズタイム・15 分単位を適用
 */
export function calcHourlyPay(hourlyRate: number, workHours: number): number {
  const workMinutes = Math.round(workHours * 60)
  const paidMinutes = calcPaidMinutes(workMinutes)
  return Math.floor((hourlyRate * paidMinutes) / 60)
}

/**
 * 給与対象時間 (小数時間)
 */
export function calcPaidHours(workHours: number): number {
  const workMinutes = Math.round(workHours * 60)
  return calcPaidMinutes(workMinutes) / 60
}
