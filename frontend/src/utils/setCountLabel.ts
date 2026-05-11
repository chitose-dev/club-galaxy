/**
 * セット数表記（spec.md §2.2.4 / FloorPage ビデオレビュー C9-C11 準拠）
 *
 * - 入店直後（延長 0 回） → "1セット目"
 * - 直近の延長が 30 分 → "EX{n}半"（半セット）
 * - 直近の延長が 60 分 → "EX{n}"（フルセット）
 *
 * 例: 60 → 30 → 60 と延長 → 表記は "EX1" → "EX2半" → "EX3"。
 * 直近セットの長短で「半」を付与するため n の値で 60/30 を判定しない（履歴の末尾を参照する）。
 */

export interface SetLabelInput {
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60 }>
}

export function getSetLabel(t: SetLabelInput): string {
  const history = t.extensionHistory ?? []
  const exCount = history.length
  if (exCount === 0) return '1セット目'
  const last = history[exCount - 1]
  return last.minutes === 30 ? `EX${exCount}半` : `EX${exCount}`
}
