/**
 * セット/延長の表記と時刻範囲ユーティリティ
 *
 * 表記仕様 (spec.md §2.2.4 + 先方PDF指示 2026-05 準拠):
 * - 入店直後（延長 0 回） → "1Set目"（「1セット目」ではない）
 * - 30 分延長は "EX(n)半"（n は発生順、30/60 混在しても通し番号）
 * - 60 分延長は "EX(n)"
 *
 * 時刻表示 (PDF page 1 ホール画面):
 * - "1Set目 12:00〜1:00まで（残り20分）"
 * - "EX(2)半 12:00〜12:30まで"
 *
 * シンプル版 (HH:MM レンジだけ欲しい呼び元向け):
 *   getCurrentSetRange + formatTimeRange
 * 構造化版 (ラベル・残り時間・長さも欲しい呼び元向け):
 *   getCurrentSetTimeRange + formatSetWithRange
 *
 * 同じ加算ロジックでも呼び元が import している名前が違うため (addMinutesToHHmm
 * / addMinutesToHHMM)、両方 export して互換を保つ。
 */

import { SET_DURATION_MINUTES } from '../data/mock'

export interface SetLabelInput {
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60; timestamp?: string }>
}

/** 現在のセット（= 1Set目 or 最新 EX）の表示ラベル。 */
export function getSetLabel(t: SetLabelInput): string {
  const history = t.extensionHistory ?? []
  const exCount = history.length
  if (exCount === 0) return '1Set目'
  const last = history[exCount - 1]
  return last.minutes === 30 ? `EX(${exCount})半` : `EX(${exCount})`
}

/** 任意の EX 番号 + 分数からラベル文字列を生成 (履歴 map 用、1 始まりの番号)。 */
export function getExLabel(index1Based: number, minutes: 30 | 60): string {
  return minutes === 30 ? `EX(${index1Based})半` : `EX(${index1Based})`
}

/** index は 0 始まり (Array.map の i をそのまま渡す呼び元向け)。 */
export function getExtensionLabel(index: number, minutes: 30 | 60): string {
  return getExLabel(index + 1, minutes)
}

/** "HH:MM" → 分。 */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 分 → "HH:MM" (24 時超は 0 始まりに正規化、日跨ぎ営業時間想定)。 */
export function minutesToHHmm(total: number): string {
  const h = Math.floor((total / 60) % 24)
  const m = ((total % 60) + 60) % 60
  return `${String((h + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" + 分 → "HH:MM"。 */
export function addMinutesToHHmm(hhmm: string, mins: number): string {
  return minutesToHHmm(hhmmToMinutes(hhmm) + mins)
}

/** 大文字版エイリアス。呼び元のスタイルに合わせて両方公開する。 */
export const addMinutesToHHMM = addMinutesToHHmm

/**
 * 現在のセット（= 1Set目 or 最新 EX）の開始 / 終了 HH:MM を返す簡易版。
 * - 延長履歴あり → 直近 EX の timestamp を開始とし、その minutes 分後を終了
 * - 延長履歴なし → 入店時刻 (startTime) を開始とし、+60 分を終了
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

/** "12:00〜13:00まで" 形式。end が 0:00〜3:59 のとき先頭ゼロを落として "1:00まで"。 */
export function formatTimeRange(start: string, end: string): string {
  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return `${h}:${String(m).padStart(2, '0')}`
  }
  return `${fmt(start)}〜${fmt(end)}まで`
}

export interface SetTimeRange {
  /** 現セットのラベル: "1Set目" / "EX(n)" / "EX(n)半" */
  label: string
  /** 現セット開始時刻 "HH:MM"。startTime 不明時は null。 */
  startHHMM: string | null
  /** 現セット終了予定時刻 "HH:MM"。startTime 不明時は null。 */
  endHHMM: string | null
  /** 現セットの長さ（分）。1Set目=60、EX は 30 or 60。 */
  durationMinutes: number
}

/**
 * ラベル + 開始 + 終了 + 長さをまとめて返す構造化版。
 * 残り時間表示や、ラベルと時刻を併記するセル向け。
 * 延長 entry に timestamp が無い場合は startTime + (1Set 分 + 過去 EX 累積) で推定。
 */
export function getCurrentSetTimeRange(t: {
  startTime: string | null
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60; timestamp?: string }>
}): SetTimeRange {
  const ex = t.extensionHistory ?? []
  const label = getSetLabel(t)

  if (!t.startTime) {
    return { label, startHHMM: null, endHHMM: null, durationMinutes: SET_DURATION_MINUTES }
  }

  if (ex.length === 0) {
    return {
      label,
      startHHMM: t.startTime,
      endHHMM: addMinutesToHHmm(t.startTime, SET_DURATION_MINUTES),
      durationMinutes: SET_DURATION_MINUTES,
    }
  }

  const last = ex[ex.length - 1]
  let startHHMM: string
  if (last.timestamp) {
    const d = new Date(last.timestamp)
    startHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } else {
    const accumulated =
      SET_DURATION_MINUTES + ex.slice(0, -1).reduce((s, e) => s + e.minutes, 0)
    startHHMM = addMinutesToHHmm(t.startTime, accumulated)
  }
  return {
    label,
    startHHMM,
    endHHMM: addMinutesToHHmm(startHHMM, last.minutes),
    durationMinutes: last.minutes,
  }
}

/** "1Set目 12:00〜1:00まで（残り20分）" 形式。
 *  remainingMinutes が null/0 以下のときは「（残り…分）」を省略。 */
export function formatSetWithRange(
  range: SetTimeRange,
  remainingMinutes?: number | null,
): string {
  const head = range.startHHMM && range.endHHMM
    ? `${range.label} ${formatTimeRange(range.startHHMM, range.endHHMM)}`
    : range.label
  if (remainingMinutes != null && remainingMinutes > 0) {
    return `${head}（残り${remainingMinutes}分）`
  }
  return head
}
