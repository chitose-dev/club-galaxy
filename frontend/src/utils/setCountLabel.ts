/**
 * セット数表記（spec.md §2.2.4 + 先方PDF指示 2026-05 準拠）
 *
 * - 入店直後（延長 0 回） → "1Set目"
 * - 1 回目の延長確定 → "EX(1)" / 30 分なら "EX(1)半"
 * - 2 回目の延長確定 → "EX(2)" / 30 分なら "EX(2)半"
 * - …
 *
 * 延長の minutes が 30 のときに「半」を付ける。
 */

import { SET_DURATION_MINUTES } from '../data/mock'

export interface SetLabelInput {
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60 }>
}

export function getSetLabel(t: SetLabelInput): string {
  const history = t.extensionHistory ?? []
  const exCount = history.length
  if (exCount === 0) return '1Set目'
  const last = history[exCount - 1]
  return last.minutes === 30 ? `EX(${exCount})半` : `EX(${exCount})`
}

/** 任意の EX 番号 + 分数からラベル文字列を生成 (履歴 map 用) */
export function getExLabel(index1Based: number, minutes: 30 | 60): string {
  return minutes === 30 ? `EX(${index1Based})半` : `EX(${index1Based})`
}

/** "HH:MM" → 分 */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 分 → "H:MM" (24 時超は H+24 表記ではなく 0 始まりに正規化) */
export function minutesToHHmm(total: number): string {
  const h = Math.floor((total / 60) % 24)
  const m = ((total % 60) + 60) % 60
  return `${String((h + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" + 分 → "HH:MM" */
export function addMinutesToHHmm(hhmm: string, mins: number): string {
  return minutesToHHmm(hhmmToMinutes(hhmm) + mins)
}

/**
 * 現在のセット（= 1Set目 or 最新 EX）の開始 / 終了 HH:MM を返す。
 * - 延長履歴あり → 直近 EX の timestamp を開始とし、その minutes 分後を終了。
 * - 延長履歴なし → 入店時刻 (startTime) を開始とし、+60 分を終了。
 */
export function getCurrentSetRange(t: {
  startTime: string | null
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60; timestamp: string }>
}): { start: string; end: string } | null {
  if (!t.startTime) return null
  const history = t.extensionHistory ?? []
  if (history.length > 0) {
    const last = history[history.length - 1]
    const d = new Date(last.timestamp)
    const start = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { start, end: addMinutesToHHmm(start, last.minutes) }
  }
  return { start: t.startTime, end: addMinutesToHHmm(t.startTime, SET_DURATION_MINUTES) }
}

/** "12:00～13:00まで" 形式。end が 0:00〜3:59 のとき "1:00まで" のように先頭ゼロを落とす。 */
export function formatTimeRange(start: string, end: string): string {
  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return `${h}:${String(m).padStart(2, '0')}`
  }
  return `${fmt(start)}～${fmt(end)}まで`
}
