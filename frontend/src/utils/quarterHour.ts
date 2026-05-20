/**
 * 15 分単位リアルタイム表示ユーティリティ (PDF E)
 *
 * 仕様: 現在時刻を 15 分刻みで丸めた勤務区間を表示する。
 *   - 20:07 → "20:00〜20:15"
 *   - 20:15 → "20:15〜20:30"
 *   - 20:14 → "20:00〜20:15"
 *
 * 勤怠画面 / 待機画面で「いま何分単位の枠にいるか」を即時に出す目的。
 * 給与計算用の「勤務時間」とは独立した表示専用。
 */

const QUARTER = 15

/** "HH:MM" 文字列を { h, m } に分解（不正値は null）。 */
export function parseHHMM(hhmm: string): { h: number; m: number } | null {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}

/** { h, m } を "HH:MM" 文字列に整形。 */
export function formatHHMM(h: number, m: number): string {
  const h2 = ((h % 24) + 24) % 24
  const m2 = ((m % 60) + 60) % 60
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`
}

/** 引数の時刻を 15 分単位で **切り下げ** て返す。
 *  20:07 → 20:00、20:15 → 20:15、20:14 → 20:00。 */
export function floorToQuarter(date: Date): Date {
  const d = new Date(date)
  const m = d.getMinutes()
  d.setMinutes(m - (m % QUARTER), 0, 0)
  return d
}

/** 引数の時刻を 15 分単位で **切り上げ** て返す。
 *  20:07 → 20:15、20:15 → 20:15、20:16 → 20:30。 */
export function ceilToQuarter(date: Date): Date {
  const d = new Date(date)
  const m = d.getMinutes()
  const rem = m % QUARTER
  if (rem === 0) {
    d.setSeconds(0, 0)
    return d
  }
  d.setMinutes(m + (QUARTER - rem), 0, 0)
  return d
}

/** 現在時刻の 15 分枠範囲 (HH:MM 文字列) を返す。
 *  20:07 なら { startHHMM: "20:00", endHHMM: "20:15" }。
 *  20:15 ちょうどは { startHHMM: "20:15", endHHMM: "20:30" } を返す。 */
export function getCurrentQuarterRange(now: Date = new Date()): { startHHMM: string; endHHMM: string } {
  const start = floorToQuarter(now)
  const end = new Date(start.getTime() + QUARTER * 60_000)
  return {
    startHHMM: formatHHMM(start.getHours(), start.getMinutes()),
    endHHMM: formatHHMM(end.getHours(), end.getMinutes()),
  }
}

/** clockIn (HH:MM) と現在時刻から、勤怠リアルタイム表示用の
 *  「出勤時刻 〜 現在の 15 分枠終端」文字列を返す。
 *
 *  終端は現在時刻が含まれる枠の END (= floor(now) + 15 分)。
 *  ちょうど境界 (now=20:15) の場合は新枠の END (= 20:30) を返す
 *  ので、表示は「20:15 入った瞬間に枠が進む」感覚と一致する。
 *
 *  例: clockIn="20:00"、now=20:07  → "20:00〜20:15"
 *      clockIn="20:00"、now=20:15  → "20:00〜20:30"
 *      clockIn="20:00"、now=20:30  → "20:00〜20:45"
 *      clockIn="20:30"、now=20:35  → "20:30〜20:45"
 *
 *  clockIn が不正 / now が clockIn より前 のときはフォールバックで clockIn を返す。 */
export function formatRealtimeWorkRange(clockIn: string | null | undefined, now: Date = new Date()): string {
  if (!clockIn) return ''
  const start = parseHHMM(clockIn)
  if (!start) return ''
  // 現枠の END = floor(now) + 15 分。ceilQ だとぴったり境界で次枠に
  // 進まないため、floor 後に +15min する方を正本ロジックにする
  // (getCurrentQuarterRange と同じ方式)。
  const floor = floorToQuarter(now)
  const end = new Date(floor.getTime() + QUARTER * 60_000)
  if (end.getHours() < start.h || (end.getHours() === start.h && end.getMinutes() < start.m)) {
    return clockIn
  }
  return `${formatHHMM(start.h, start.m)}〜${formatHHMM(end.getHours(), end.getMinutes())}`
}
