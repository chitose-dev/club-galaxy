/**
 * セット/延長の表記と時刻範囲ユーティリティ
 *
 * PDF修正要望 / Word Q&A 確定仕様:
 * - 入店直後（延長 0 回）→ "1Set目"（「1セット目」ではない）
 * - 30 分延長は "EX(n)半"（n は発生順）
 * - 60 分延長は "EX(n)"
 * - 30/60 混在しても発生順に通し番号: "EX(1)半 → EX(2) → EX(3)半"
 * - 時刻表示は開始だけでなく終了まで:
 *   "1Set目 12:00〜1:00まで（残り20分）"
 *   "EX(2)半 12:00〜12:30まで"
 *
 * 計算: extensionHistory の長さで番号付与、minutes で「半」判定。
 */

import { SET_DURATION_MINUTES } from '../data/mock'

export interface SetLabelInput {
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60; timestamp?: string }>
}

/** 現在のセット（= 1Set目 or 最新 EX）の表示ラベル。 */
export function getSetLabel(t: SetLabelInput): string {
  const ex = t.extensionHistory ?? []
  if (ex.length === 0) return '1Set目'
  const last = ex[ex.length - 1]
  const n = ex.length
  return last.minutes === 30 ? `EX(${n})半` : `EX(${n})`
}

/** 特定の延長エントリ（index は 0 始まり）のラベル。
 *  履歴を順に走査して印字/履歴一覧用に表示する際に使う。 */
export function getExtensionLabel(index: number, minutes: 30 | 60): string {
  const n = index + 1
  return minutes === 30 ? `EX(${n})半` : `EX(${n})`
}

/** "HH:MM" 形式の時刻文字列に minutes 分加算した "HH:MM" を返す。
 *  時/分は 24h 表記、日跨ぎは時間部だけ mod 24 する（営業時間想定）。 */
export function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const total = h * 60 + m + minutes
  const h2 = Math.floor((((total / 60) % 24) + 24) % 24)
  const m2 = ((total % 60) + 60) % 60
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`
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
 * 現在のセット（1Set目 or 最新 EX）の開始〜終了レンジを返す。
 *
 * - 1Set目: startTime から SET_DURATION_MINUTES 分
 * - EX: 最新 entry の timestamp から minutes 分（timestamp が無ければ
 *   startTime + 過去全 EX の累積から推定）
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
    // 1Set目
    return {
      label,
      startHHMM: t.startTime,
      endHHMM: addMinutesToHHMM(t.startTime, SET_DURATION_MINUTES),
      durationMinutes: SET_DURATION_MINUTES,
    }
  }

  // 最新 EX のレンジ
  const last = ex[ex.length - 1]
  let startHHMM: string
  if (last.timestamp) {
    const d = new Date(last.timestamp)
    startHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } else {
    // フォールバック: startTime + (1Set 分 + 過去 EX 累積)
    const accumulated =
      SET_DURATION_MINUTES + ex.slice(0, -1).reduce((s, e) => s + e.minutes, 0)
    startHHMM = addMinutesToHHMM(t.startTime, accumulated)
  }
  return {
    label,
    startHHMM,
    endHHMM: addMinutesToHHMM(startHHMM, last.minutes),
    durationMinutes: last.minutes,
  }
}

/** "1Set目 12:00〜1:00まで（残り20分）" 形式の表示文字列を組み立てる。
 *  remainingMinutes が null/0 以下のときは「（残り…分）」を省略。 */
export function formatSetWithRange(
  range: SetTimeRange,
  remainingMinutes?: number | null,
): string {
  const head = range.startHHMM && range.endHHMM
    ? `${range.label} ${range.startHHMM}〜${range.endHHMM}まで`
    : range.label
  if (remainingMinutes != null && remainingMinutes > 0) {
    return `${head}（残り${remainingMinutes}分）`
  }
  return head
}
