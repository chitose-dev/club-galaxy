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

/**
 * 出勤時刻 HH:MM を 15 分単位で「切り上げ」て返す（PDF E）。
 * 店側保守的（従業員不利方向）に丸める。例: "20:07" → "20:15"。
 * ぴったり境界はそのまま（"20:00" → "20:00"）。
 */
export function roundClockInHHMM(hhmm: string): string {
  const t = parseHHMM(hhmm)
  if (!t) return hhmm
  const totalMin = t.h * 60 + t.m
  const rem = totalMin % QUARTER
  if (rem === 0) return formatHHMM(t.h, t.m)
  const ceiled = totalMin + (QUARTER - rem)
  return formatHHMM(Math.floor(ceiled / 60), ceiled % 60)
}

/**
 * 退勤時刻 HH:MM を 15 分単位で「切り捨て」て返す（PDF E）。
 * 店側保守的（勤務時間短く計上）に丸める。例: "23:38" → "23:30"。
 */
export function roundClockOutHHMM(hhmm: string): string {
  const t = parseHHMM(hhmm)
  if (!t) return hhmm
  const totalMin = t.h * 60 + t.m
  const floored = totalMin - (totalMin % QUARTER)
  return formatHHMM(Math.floor(floored / 60), floored % 60)
}

/**
 * 出勤 (HH:MM) と退勤 (HH:MM) と休憩分から workHours (0.1 h 単位) を算出。
 * 双方が 15 分単位に丸められた値である前提。深夜跨ぎは +24h で吸収。
 */
export function calcWorkHours(clockIn: string, clockOut: string, breakMinutes: number): number {
  const start = parseHHMM(clockIn)
  const end = parseHHMM(clockOut)
  if (!start || !end) return 0
  let totalMin = (end.h * 60 + end.m) - (start.h * 60 + start.m)
  if (totalMin < 0) totalMin += 24 * 60
  const net = Math.max(0, totalMin - (breakMinutes || 0))
  return Math.round(net / 60 * 10) / 10
}

/** clockIn (HH:MM) と現在時刻から、勤怠リアルタイム表示用の
 *  「出勤時刻 〜 現在の 15 分枠終端」文字列を返す。
 *
 *  終端は現在時刻が含まれる枠の END (= floor(now) + 15 分)。
 *  ちょうど境界 (now=20:15) の場合は新枠の END (= 20:30) を返す。
 *
 *  深夜跨ぎ対応 (CLUB 系は常態): clockIn と now の日付が異なるケースは
 *  「now が clockIn より HH:MM 上で小さい」場合に発生するので、
 *  end < start のときは end に 24h 足して跨ぎとして表示する。
 *
 *  例: clockIn="20:00"、now=20:07   → "20:00〜20:15"
 *      clockIn="20:00"、now=20:15   → "20:00〜20:30"
 *      clockIn="20:00"、now=20:30   → "20:00〜20:45"
 *      clockIn="23:45"、now=00:05   → "23:45〜00:15"  ← 深夜跨ぎ
 *      clockIn="22:00"、now=02:30   → "22:00〜02:45"  ← 深夜跨ぎ
 *
 *  clockIn が不正のときは空文字。 */
export function formatRealtimeWorkRange(clockIn: string | null | undefined, now: Date = new Date()): string {
  if (!clockIn) return ''
  const start = parseHHMM(clockIn)
  if (!start) return ''
  const floor = floorToQuarter(now)
  const end = new Date(floor.getTime() + QUARTER * 60_000)
  const endH = end.getHours()
  const endM = end.getMinutes()
  // 深夜跨ぎ判定: end < start (HH:MM 比較で end が前) なら、now は翌日扱い。
  // 単純に formatHHMM(endH, endM) を表示するだけで「23:45〜00:15」のように
  // 自然に出る（HH:MM 文字列上は単純連結で OK）。
  const startMin = start.h * 60 + start.m
  const endMin = endH * 60 + endM
  if (endMin < startMin) {
    // 深夜跨ぎ。end をそのまま 00:15 等で表示。
    return `${formatHHMM(start.h, start.m)}〜${formatHHMM(endH, endM)}`
  }
  return `${formatHHMM(start.h, start.m)}〜${formatHHMM(endH, endM)}`
}
