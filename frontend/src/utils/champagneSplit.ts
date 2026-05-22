/**
 * 本指名ボトルバックの配分計算。
 *
 * Word Q&A 確定回答（PDF修正要望 §ボトルバック）:
 *   - 本指名キャストのみが対象。同卓のフリー / 場内指名 / ヘルプには付与しない。
 *   - 各キャストの基準額 = 小計 ÷ 本指名人数（円、整数、端数切り捨て）
 *   - 各キャストへのバック金額 = 基準額 × そのキャストの個別ボトルバック率
 *   - 端数は店舗側に残す（バック合計が小計に届かないのが正常）
 *
 * 例: 小計 10,000 円、本指名 2 名
 *   - A 25% のキャスト: 10,000 ÷ 2 = 5,000 → 5,000 × 25% = 1,250 円
 *   - B 30% のキャスト: 10,000 ÷ 2 = 5,000 → 5,000 × 30% = 1,500 円
 *   - 店舗残: 10,000 − 1,250 − 1,500 = 7,250 円
 *
 * 旧実装は「個別率の平均を取り、バック合計を均等折半」する方式だったが、
 * Word 回答ではキャスト個別率を適用する方式が正となったため差し替えた。
 *
 * 単位ルール（既存 `Cast.backRates['ボトルバック']` と一致）:
 *   バック率は **0〜100 の % 数値で受け取る**（25% なら 25、10% なら 10）。
 *   `mock.ts` の `backRates['ボトルバック']` / `AdminPage.tsx` の入力 UI
 *   （max=100, unit="%"）と単位を揃えるため、内部で `/ 100` して係数化する。
 */

export interface BottleBackInput {
  /** ボトル小計（円、税抜き）。calcChampagneSplit は単一ボトル想定だが、
   *  同種ボトルの複数本売上でも同じ計算式が使えるため、呼出側で合算しておく。 */
  subtotal: number
  /** 本指名キャスト名のリスト。フリー卓（空配列）の場合はバック付与なし。 */
  nominationCastNames: string[]
  /** キャスト名 → 個別ボトルバック率（**%単位**: 25% なら 25 を渡す）。
   *  既存 `Cast.backRates['ボトルバック']` の保存形式と同じ。
   *  存在しないキャスト名や undefined のレートは 0 として扱う。 */
  castBackRateMap: Record<string, number>
}

export interface BottleBackOutput {
  /** 各キャストの基準額（= 小計 ÷ 本指名人数、整数）。本指名 0 名なら 0。 */
  perCastBase: number
  /** キャスト名 → そのキャストへのバック金額（円、整数、端数切り捨て）。
   *  本指名 0 名の場合は空オブジェクト。 */
  perCastBackAmount: Record<string, number>
  /** バック総額（円）。各キャスト分の合計。 */
  totalBackAmount: number
  /** 店舗側に残る金額（円）= 小計 − バック総額。
   *  キャスト個別率の合計が 100% 未満なら正値、超えれば負値（理論上は警告対象）。 */
  storeRemainder: number
}

export function calcChampagneSplit(input: BottleBackInput): BottleBackOutput {
  const { subtotal, nominationCastNames, castBackRateMap } = input
  const n = nominationCastNames.length

  if (n === 0 || subtotal <= 0) {
    return {
      perCastBase: 0,
      perCastBackAmount: {},
      totalBackAmount: 0,
      storeRemainder: Math.max(0, subtotal),
    }
  }

  // 各キャストの基準額（端数は店側）。
  const perCastBase = Math.floor(subtotal / n)

  // 個別率を引いてバック金額を確定。rate は %単位（25=25%）で渡されるため
  // ここで /100 して係数化する。負値や 100 超は入力 UI 側で拒否されている
  // 前提だが、防御的に係数のみ計算しガードはしない。
  const perCastBackAmount: Record<string, number> = {}
  let totalBackAmount = 0
  for (const name of nominationCastNames) {
    const ratePercent = castBackRateMap[name] ?? 0
    const back = Math.floor((perCastBase * ratePercent) / 100)
    perCastBackAmount[name] = back
    totalBackAmount += back
  }

  return {
    perCastBase,
    perCastBackAmount,
    totalBackAmount,
    storeRemainder: subtotal - totalBackAmount,
  }
}

/**
 * バックタイプから対応する Cast.backRates のキーを返すヘルパ。
 * シャンパン・ウイスキー・焼酎・ブランデー・ワインは全て「ボトルバック」枠で扱う。
 */
export function getBackTypeForCategory(subcategory: string): 'ボトルバック' | null {
  if (['champagne', 'whisky', 'shochu', 'brandy', 'wine'].includes(subcategory)) {
    return 'ボトルバック'
  }
  return null
}
