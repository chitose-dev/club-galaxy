/**
 * セット数表記（ISSUE-004 反映）
 *
 * 先方の業界標準表記:
 * - 入店直後（延長 0 回） → "1セット目"
 * - 1 回目の延長確定 → "リセット目"
 * - 2 回目以降の延長 → "EX1", "EX2", ...
 *
 * 計算: extensionHistory.length のみで判定。延長分数の長短（30/60）は表示分けしない。
 *
 * TODO: ふうや確認待ち（やまけんいち様の希望次第）
 *   - 「リセット目」 vs 「EX1」 vs 他の表記、業界の標準呼称を確認
 *   - 旧 "EX1半" 表記（30 分延長と 60 分延長を区別）の復活希望があるか
 */

export interface SetLabelInput {
  setCount: number
  extensionHistory?: Array<{ minutes: 30 | 60 }>
}

export function getSetLabel(t: SetLabelInput): string {
  const exCount = (t.extensionHistory ?? []).length
  if (exCount === 0) return '1セット目'
  if (exCount === 1) return 'リセット目'
  return `EX${exCount - 1}`
}
