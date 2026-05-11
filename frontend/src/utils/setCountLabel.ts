/**
 * セット数表記（spec.md §2.2.4 準拠）
 *
 * - 入店直後（延長 0 回） → "1セット目"
 * - 1 回目の延長確定 → "EX1"
 * - 2 回目の延長確定 → "EX2"
 * - …
 *
 * 計算: extensionHistory.length のみで判定。延長分数の長短（30/60）は表示分けしない。
 */

export interface SetLabelInput {
  setCount: number
  extensionHistory?: ReadonlyArray<{ minutes: 30 | 60 }>
}

export function getSetLabel(t: SetLabelInput): string {
  const exCount = (t.extensionHistory ?? []).length
  if (exCount === 0) return '1セット目'
  return `EX${exCount}`
}
