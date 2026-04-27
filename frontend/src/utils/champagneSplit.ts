/**
 * ビデオレビュー N1-N4: シャンパン (および高額ボトル類) のセッパン計算
 *
 * 仕様:
 *   - 本指名キャストが複数いるとき、シャンパンの売上は均等にセッパン
 *   - バック率もキャスト平均で計算 → 折半 (各人の取り分)
 *
 * 例:
 *   - 萌えしろ ¥23,000、本指名 = ゆい・りさ
 *   - 売上分配: 各 ¥11,500
 *   - バック率: ゆい 25%、りさ 20% → 平均 22.5% → 各 11.25%
 *   - バック金額: ¥23,000 × 11.25% = 各 ¥2,587 (端数切り捨て)
 *
 * 「折半 (セッパン)」= 全員でバック分配。「平均」= 個別バック率の単純平均。
 */

export interface SplitInput {
  /** 商品価格 (円、税抜きベースで計算するのが業界標準) */
  totalPrice: number
  /** 本指名キャスト名のリスト */
  nominationCastNames: string[]
  /** キャスト名 → そのキャストのバック率 (0.0〜1.0) のマップ */
  castBackRateMap: Record<string, number>
}

export interface SplitOutput {
  /** 各キャストへの売上分配額 */
  perCastRevenue: number
  /** 適用された平均バック率 (0.0〜1.0) */
  averageBackRate: number
  /** 各キャストへのバック金額 (折半後) */
  perCastBackAmount: number
  /** バック総額 (= perCastBackAmount × キャスト数) */
  totalBackAmount: number
}

export function calcChampagneSplit(input: SplitInput): SplitOutput {
  const { totalPrice, nominationCastNames, castBackRateMap } = input
  const n = nominationCastNames.length
  if (n === 0) {
    return { perCastRevenue: 0, averageBackRate: 0, perCastBackAmount: 0, totalBackAmount: 0 }
  }

  // 各キャストの売上分配 (均等)
  const perCastRevenue = Math.floor(totalPrice / n)

  // バック率の単純平均
  const rates = nominationCastNames.map((name) => castBackRateMap[name] ?? 0)
  const sumRates = rates.reduce((s, r) => s + r, 0)
  const averageBackRate = sumRates / n

  // バック総額: 価格 × 平均率
  const totalBackAmount = Math.floor(totalPrice * averageBackRate)

  // 折半 (n 等分)
  const perCastBackAmount = Math.floor(totalBackAmount / n)

  return { perCastRevenue, averageBackRate, perCastBackAmount, totalBackAmount }
}

/**
 * バックタイプから対応する Cast.backRates のキーを返すヘルパ。
 * シャンパン → 'ボトルバック' (% 単位)
 * 焼酎 → 'ボトルバック'
 * 等
 */
export function getBackTypeForCategory(subcategory: string): 'ボトルバック' | null {
  if (['champagne', 'whisky', 'shochu', 'brandy', 'wine'].includes(subcategory)) {
    return 'ボトルバック'
  }
  return null
}
