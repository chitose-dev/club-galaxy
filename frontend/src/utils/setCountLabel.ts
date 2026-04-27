/**
 * 追補03 ビデオレビュー C9-C11: セット数表記
 *
 * 先方の業界標準表記:
 * - 1 セット目 (初回 60 分セット) → "1セット目"
 * - 60 分延長 → "EX1" (= 2 セット目)
 * - 30 分延長 → "EX1半" (= 1.5 セット目)
 * - もう 60 分延長 → "EX2" (= 3 セット目)
 * - もう 30 分延長 → "EX2半"
 *
 * 計算: setCount は基本セット数 (1)。延長は extensionHistory[].minutes (30 or 60) の合計分。
 *   合計延長分数を 30 単位に丸めて、半端 (.5) 表記する。
 */

export interface SetLabelInput {
  setCount: number
  extensionHistory?: Array<{ minutes: 30 | 60 }>
}

export function getSetLabel(t: SetLabelInput): string {
  const baseCount = t.setCount
  const extMinutes = (t.extensionHistory ?? []).reduce((s, e) => s + e.minutes, 0)
  if (extMinutes === 0) {
    return `${baseCount}セット目`
  }
  // 延長があれば EX 表記。30 分単位の半端を「半」で表す
  const exHalf = extMinutes / 30  // 1, 2, 3, 4, ...
  const exFull = Math.floor(exHalf / 2)
  const hasHalf = exHalf % 2 === 1
  if (exFull === 0 && hasHalf) return 'EX1半'  // 30分のみ → 1セット目+EX0半 → EX1半 として扱う
  if (hasHalf) return `EX${exFull}半`
  return `EX${exFull}`
}

/**
 * 表記の意味:
 *   "1セット目" = 初回 60 分
 *   "EX1半" = 30 分延長 (合計 90 分)
 *   "EX1" = 60 分延長 (合計 120 分)
 *   "EX2半" = 60+30 分延長 (合計 150 分)
 *   "EX2" = 60+60 分延長 (合計 180 分)
 */
