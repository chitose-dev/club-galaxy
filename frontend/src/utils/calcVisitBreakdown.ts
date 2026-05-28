/**
 * セット単位の会計内訳を計算する単一の純関数。
 *
 * 利用明細 / 会計 / 印刷 / 確定後レコードの全てがこの関数を経由して同じ内訳を出すための
 * 「正準計算」。アプリ実行時の値（時間帯セット単価・延長単価・指名スナップショット・
 * 注文）は呼び出し側が解決して **プレーンなデータ** として渡す。本モジュールは mock や
 * React に依存せず、算術と按分だけを行う（単体テスト可能にするため）。
 *
 * 課金モデル（確定仕様）:
 * - セット料金: 1Set目 = 時間帯セット単価×人数−値引、各EX = 延長単価(minutes)×人数。
 *   → これにより従来 `ExtensionConfirmPage` 経路で未計上だった延長料金が正しく乗る。
 * - 指名料（本指名/場内/同伴）: セットごとに、そのセットで有効な指名スナップショットに
 *   応じて課金。EX でリセットされたセットは 0、承継したセットには課金される。
 * - 商品注文: `setSequence` でセットへ振り分ける。
 *
 * 二重計上対策:
 * - 旧 `useExtendTable` 経路は「延長料金」「本指名料」を注文行として積む。これらは
 *   セット側で計上するため、商品注文小計から除外する（`isSeparatelyBilledRow`）。
 *   除外は厳しめの複合判定（isExtension フラグ / 延長注文の menuItem.id 一致 / 旧 EX 命名 /
 *   指名 charge の限定品名一致）で、同名の通常商品を誤除外しない。
 */

/** 会計内訳に渡す注文 1 行（最小情報）。 */
export interface BreakdownOrderInput {
  /** menuItem.id。延長注文の二重計上除外（orderMenuItemId 一致）に使う。 */
  menuItemId?: number
  name: string
  price: number
  quantity: number
  castName?: string
  /** 所属セット通し番号。0=1Set目, 1=EX1 …。未設定は 0(base) 扱い。 */
  setSequence?: number
  /** 旧 useExtendTable が延長注文に立てるフラグ（あれば最優先で除外）。 */
  isExtension?: boolean
}

/** セット（1Set目 or 1 回分の延長）1 件の入力。指名は人数、料金は単価×人数で算出。 */
export interface BreakdownSetInput {
  kind: 'base' | 'extension'
  /** "1Set目" / "EX(1)" / "EX(1)半" など。 */
  label: string
  minutes: number
  /** このセットのセット料金（base = setPrice×人数−値引、EX = extPrice×人数）。呼び出し側で算出。 */
  setFee: number
  /** このセットで有効な本指名の人数。 */
  honShimeiCount: number
  /** このセットで有効な場内指名の人数。 */
  banaiCount: number
  /** このセットで有効な同伴の人数（通常 base のみ）。 */
  douhanCount: number
}

export interface CalcVisitBreakdownInput {
  sets: BreakdownSetInput[]
  /** visit 全体の商品注文。setSequence でセットへ振り分ける。 */
  orders: BreakdownOrderInput[]
  honShimeiUnit: number
  banaiUnit: number
  douhanUnit: number
  taxRate: number
  /** 値引き（税前小計から引く）。 */
  discount?: number
  /** 二重計上除外: 旧 useExtendTable が積んだ延長注文の menuItem.id 群
   *  (= extensionHistory[].orderMenuItemId)。 */
  excludedExtensionOrderIds?: number[]
  /** 二重計上除外: 指名料 charge 行の品名（本指名/場内指名/同伴のラベル）。
   *  これと完全一致する注文のみ除外する。 */
  nominationChargeNames?: string[]
}

export interface BreakdownSetLine extends BreakdownSetInput {
  honShimeiFee: number
  banaiFee: number
  douhanFee: number
  nominationFee: number
  orderLines: BreakdownOrderInput[]
  orderSubtotal: number
  /** setFee + nominationFee + orderSubtotal（税前）。 */
  subtotal: number
}

export interface CalcVisitBreakdownResult {
  sets: BreakdownSetLine[]
  setFeeTotal: number
  nominationTotal: number
  orderTotal: number
  /** 税前小計（= setFeeTotal + nominationTotal + orderTotal）。 */
  subtotalBeforeTax: number
  discount: number
  tax: number
  /** 税込合計（= subtotalBeforeTax + tax − discount）。カード手数料は呼び出し側で別途加算。 */
  total: number
}

/** 旧 useExtendTable 由来の延長注文の品名か（新 `EX(n)` / `EX(n)半`、旧 `延長 +30分`）。 */
function isLegacyExtensionName(name: string): boolean {
  return /^EX\((?:\d+|\?)\)半?$/.test(name) || /^延長\s*\+(?:30|60)分$/.test(name)
}

/**
 * 商品注文小計から除外すべき行か（延長料金行・指名/同伴 charge 行）。
 * 延長: isExtension フラグ → menuItem.id 一致 → 旧 EX 命名、の複合で厳しめに判定。
 * 指名 charge: 限定した品名一致のみ（同名の通常商品を誤除外しないため）。
 */
export function isSeparatelyBilledRow(
  o: BreakdownOrderInput,
  excludedExtensionOrderIds: ReadonlySet<number>,
  nominationChargeNames: ReadonlySet<string>,
): boolean {
  if (o.isExtension === true) return true
  if (o.menuItemId !== undefined && excludedExtensionOrderIds.has(o.menuItemId)) return true
  if (isLegacyExtensionName(o.name)) return true
  if (nominationChargeNames.has(o.name)) return true
  return false
}

export function calcVisitBreakdown(input: CalcVisitBreakdownInput): CalcVisitBreakdownResult {
  const excludedIds = new Set(input.excludedExtensionOrderIds ?? [])
  const nomNames = new Set(input.nominationChargeNames ?? [])
  const setCount = input.sets.length

  // 商品注文をセットへ振り分け（別計上行・延長行は除外）。
  // setSequence 未設定/範囲外は 0(1Set目) に寄せる。
  const perSetOrders: BreakdownOrderInput[][] = input.sets.map(() => [])
  for (const o of input.orders) {
    if (isSeparatelyBilledRow(o, excludedIds, nomNames)) continue
    const seq = o.setSequence ?? 0
    const idx = seq >= 0 && seq < setCount ? seq : 0
    perSetOrders[idx].push(o)
  }

  const sets: BreakdownSetLine[] = input.sets.map((s, i) => {
    const honShimeiFee = s.honShimeiCount * input.honShimeiUnit
    const banaiFee = s.banaiCount * input.banaiUnit
    const douhanFee = s.douhanCount * input.douhanUnit
    const nominationFee = honShimeiFee + banaiFee + douhanFee
    const orderLines = perSetOrders[i]
    const orderSubtotal = orderLines.reduce((acc, o) => acc + o.price * o.quantity, 0)
    return {
      ...s,
      honShimeiFee,
      banaiFee,
      douhanFee,
      nominationFee,
      orderLines,
      orderSubtotal,
      subtotal: s.setFee + nominationFee + orderSubtotal,
    }
  })

  const setFeeTotal = sets.reduce((acc, l) => acc + l.setFee, 0)
  const nominationTotal = sets.reduce((acc, l) => acc + l.nominationFee, 0)
  const orderTotal = sets.reduce((acc, l) => acc + l.orderSubtotal, 0)
  const subtotalBeforeTax = setFeeTotal + nominationTotal + orderTotal
  const discount = input.discount ?? 0
  const tax = Math.floor(subtotalBeforeTax * input.taxRate)
  const total = subtotalBeforeTax + tax - discount

  return { sets, setFeeTotal, nominationTotal, orderTotal, subtotalBeforeTax, discount, tax, total }
}
