/**
 * ボトル系商品（シャンパン / ウイスキー / 焼酎 / ブランデー / ワイン）の
 * 1 注文 (= 1 本 × 1 キャスト分担) に対するキャストバック金額を確定する純関数。
 *
 * 仕様（先方確定 / 2026-06-03）:
 *   優先順位
 *     1. 商品個別バック金額 (productBackPerUnit) が「設定済み」(null/undefined 以外)
 *        なら、その値（円）を採用する。0 円も「明示的にバックなし」として尊重し、
 *        フォールバックには **絶対に潰さない**。
 *     2. productBackPerUnit が null/undefined のときに限り、キャスト給与設定の
 *        ボトルバック率 (castBottleRatePercent, % 単位 25 = 25%) を 1 本あたり
 *        の基準額 (basePerUnit) に掛けて算出する。
 *     3. (1)(2) のいずれも有効値が得られなければ 0（バックなし）。
 *
 * 0 と未設定 (null/undefined) の区別はこの関数全体の中核要件。既存データは
 * `castBack: 0` で投入されていた経緯があるため、新フィールド `bottleBackPerUnit`
 * を別途持たせて 3-state (null = 未設定, 0 = 明示なし, 正数 = 個別) を表現する。
 */

export interface BottleBackPerOrderInput {
  /** 商品個別バック金額（円）。3-state:
   *  - null/undefined → フォールバック対象
   *  - 0 → 明示的バックなし（フォールバックしない）
   *  - 正数 → 個別バック金額（給与設定より優先） */
  productBackPerUnit: number | null | undefined
  /** キャストの給与設定ボトルバック率（% 単位、25 = 25%）。
   *  キャスト未割当・率未設定なら null/undefined。 */
  castBottleRatePercent: number | null | undefined
  /** ボトル 1 本あたりの基準額（円、税抜き）。率フォールバック時の係数に使う。
   *  通常は商品 price、0 円ボトルは bottleBackBasePerUnit を渡す。 */
  basePerUnit: number
  /** 数量（本数）。1 本 × N 本 のシンプル積算。負値は 0 扱い。 */
  quantity: number
}

export interface BottleBackPerOrderOutput {
  /** バック金額（円、整数、端数切り捨て）。 */
  amount: number
  /** どの経路で算出されたか（テスト・ログ用）。 */
  source: 'product' | 'rate' | 'none'
}

/**
 * 1 注文 (1 商品 × quantity) ぶんのキャストバック額を返す純関数。
 *
 * 注意:
 *   - 「商品個別バック金額」は **1 本あたり** の金額として扱う。本数 N 本なら
 *     `productBackPerUnit × N` を返す。
 *   - 率フォールバックは `basePerUnit × N × ratePercent / 100` を floor で整数化。
 *   - 計算経路を `source` で返す（呼出側でログ・テスト確認に使う）。
 */
export function calcBottleBackPerOrder(
  input: BottleBackPerOrderInput,
): BottleBackPerOrderOutput {
  const qty = Math.max(0, Math.floor(input.quantity))
  if (qty === 0) return { amount: 0, source: 'none' }

  // 優先順位 1: 商品個別バック金額（null/undefined のときだけフォールバック）
  const product = input.productBackPerUnit
  if (product !== null && product !== undefined) {
    // 0 も明示的バックなしとして尊重する。フォールバックには潰さない。
    const amount = Math.max(0, Math.floor(product * qty))
    return { amount, source: 'product' }
  }

  // 優先順位 2: キャスト給与設定のボトルバック率
  const rate = input.castBottleRatePercent
  if (rate !== null && rate !== undefined && rate > 0) {
    const subtotal = input.basePerUnit * qty
    const amount = Math.max(0, Math.floor((subtotal * rate) / 100))
    return { amount, source: 'rate' }
  }

  // 優先順位 3: バックなし
  return { amount: 0, source: 'none' }
}
