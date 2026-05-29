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
  /** 原価。旧EX命名の複合判定（延長/charge は cost 0）で通常商品との誤判定を避けるために使う。 */
  cost?: number
  /** キャストバック。同上（延長/charge は castBack 0）。 */
  castBack?: number
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
  /** 値引き。既存 BillingPage と同様、税前小計ではなく**税計算後の合計から**差し引く
   *  （total = subtotalBeforeTax + tax − discount）。 */
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
 * 延長の判定は信頼できるシグナル優先で厳しめに:
 *   1. isExtension フラグ（延長コードが立てる）
 *   2. menuItem.id が延長注文ID集合（extensionHistory[].orderMenuItemId）に一致
 *   3. 旧 EX 命名 **かつ** 構造的に fee 行（原価0・バック0）の複合
 *      → 通常商品が偶然 `EX(1)` 等の名前でも、原価>0 なら除外しない。
 * 指名 charge は限定した品名一致のみ（charge ラベルは原価>0 のため構造ガードは使わない）。
 */
export function isSeparatelyBilledRow(
  o: BreakdownOrderInput,
  excludedExtensionOrderIds: ReadonlySet<number>,
  nominationChargeNames: ReadonlySet<string>,
): boolean {
  if (o.isExtension === true) return true
  if (o.menuItemId !== undefined && excludedExtensionOrderIds.has(o.menuItemId)) return true
  if (isLegacyExtensionName(o.name) && (o.cost ?? 0) === 0 && (o.castBack ?? 0) === 0) return true
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

/**
 * visit の TAX をセット小計按分でセットごとに割り当てる。
 * Σ(per-set tax) === result.tax を保証（端数は最終セットが吸収）。
 * 利用明細 / 延長確認のセット別「TAX・合計」表示でセット合計の総和が visit 合計と一致するために使う。
 */
export function allocatePerSetTax(result: CalcVisitBreakdownResult): number[] {
  const { sets, tax, subtotalBeforeTax } = result
  if (sets.length === 0) return []
  if (subtotalBeforeTax <= 0) return sets.map(() => 0)
  let allocated = 0
  return sets.map((s, i) => {
    if (i === sets.length - 1) return tax - allocated
    const t = Math.floor((tax * s.subtotal) / subtotalBeforeTax)
    allocated += t
    return t
  })
}

// ─────────────────────────────────────────────────────────────
// Table -> calcVisitBreakdown 入力アダプタ
// アプリ側（BillingPage 等）が解決済みの単価を rates で渡し、Table から per-set
// 入力を組み立てる。mock/React 非依存（構造的型）で単体テスト可能。
// ─────────────────────────────────────────────────────────────

/** アダプタが必要とする、解決済みの単価・税率。 */
export interface VisitBreakdownRates {
  /** 時間帯セット単価（getSetPriceForTime 解決済み、値引き前）。 */
  baseSetUnit: number
  /** 30分延長単価（storeSettings.extensionPrice30Min）。 */
  extPrice30: number
  /** 60分延長単価（storeSettings.extensionPrice60Min）。 */
  extPrice60: number
  honShimeiUnit: number
  banaiUnit: number
  douhanUnit: number
  taxRate: number
}

/** アダプタが読む最小限の Table 形（構造的型。実 Table はこれを満たす）。 */
export interface VisitTableLike {
  guestCount: number
  setCount: number
  startTime: string | null
  mainNominationCastNames: string[]
  isBanaiShimei?: boolean
  isDouhan?: boolean
  assignedCasts: string[]
  setDiscountPerSet?: number
  extensionHistory?: ReadonlyArray<{
    minutes: 30 | 60
    nominatedCastNames?: string[]
    banaiCastNames?: string[]
    orderMenuItemId?: number
  }>
  baseNominationSnapshot?: {
    mainNominationCastNames: string[]
    banaiCastNames: string[]
    douhanCount: number
  }
  orders: ReadonlyArray<{
    menuItem: { id: number; name: string; price: number; cost?: number; castBack?: number }
    quantity: number
    castName?: string
    setSequence?: number
    isExtension?: boolean
  }>
}

/** 指名料 charge 行として商品小計から除外する品名（chargeItems の本指名/場内/同伴ラベル）。 */
export const NOMINATION_CHARGE_NAMES: readonly string[] = ['本指名', '場内指名', '同伴']

/**
 * 売上帰属の均等按分（端数は最後のキャストに寄せる）。本指名なしは空。
 * **各レコードは自分の subtotalBeforeTax のみを渡すこと**。合算会計でも、代表卓は
 * 代表卓分・合算対象卓は合算対象卓分のみを按分し、合算全体を代表卓キャストに
 * 二重で乗せない（給与・キャスト別売上の誤帰属防止）。
 */
export function buildSalesAttribution(
  subtotalBeforeTax: number,
  nominationCastNames: readonly string[],
): Record<string, number> {
  const n = nominationCastNames.length
  if (n === 0) return {}
  const each = Math.floor(subtotalBeforeTax / n)
  const acc: Record<string, number> = {}
  nominationCastNames.forEach((name, i) => {
    acc[name] = i === n - 1 ? subtotalBeforeTax - each * (n - 1) : each
  })
  return acc
}

/**
 * Table を calcVisitBreakdown 入力へ変換する。
 * - base セット指名: 0EX は現フラグ、≥1EX は baseNominationSnapshot（無ければ現フラグへ fallback）
 * - 各EXセット指名: そのエントリのスナップショット（本指名 = nominatedCastNames、
 *   場内 = banaiCastNames）。同伴は EX では課金しない
 * - 場内 count は現行 billing 踏襲（isBanaiShimei 卓は assignedCasts 全員）
 * - 延長料金は設定の延長単価（extPrice）× 人数
 */
export function buildVisitBreakdownInput(t: VisitTableLike, rates: VisitBreakdownRates): CalcVisitBreakdownInput {
  const guests = t.guestCount
  const ex = t.extensionHistory ?? []
  const n = ex.length
  const baseSetFee = Math.max(0, rates.baseSetUnit - (t.setDiscountPerSet ?? 0)) * guests * Math.max(1, t.setCount || 1)

  // 現行 billing 準拠の現フラグ由来 count（0EX の base、および fallback に使う）。
  const currentHon = t.mainNominationCastNames.length
  const currentBanai = t.isBanaiShimei ? t.assignedCasts.length : 0
  const currentDouhan = t.isDouhan ? t.assignedCasts.length : 0

  const baseSnap = t.baseNominationSnapshot
  const baseHon = n === 0 ? currentHon : (baseSnap ? baseSnap.mainNominationCastNames.length : currentHon)
  const baseBanai = n === 0 ? currentBanai : (baseSnap ? baseSnap.banaiCastNames.length : currentBanai)
  const baseDouhan = n === 0 ? currentDouhan : (baseSnap ? baseSnap.douhanCount : currentDouhan)

  const sets: BreakdownSetInput[] = [{
    kind: 'base',
    label: '1Set目',
    minutes: 60,
    setFee: baseSetFee,
    honShimeiCount: baseHon,
    banaiCount: baseBanai,
    douhanCount: baseDouhan,
  }]

  ex.forEach((e, i) => {
    const extUnit = e.minutes === 30 ? rates.extPrice30 : rates.extPrice60
    sets.push({
      kind: 'extension',
      label: e.minutes === 30 ? `EX(${i + 1})半` : `EX(${i + 1})`,
      minutes: e.minutes,
      setFee: extUnit * guests,
      honShimeiCount: e.nominatedCastNames?.length ?? 0,
      banaiCount: e.banaiCastNames?.length ?? 0,
      douhanCount: 0,
    })
  })

  const orders: BreakdownOrderInput[] = t.orders.map((o) => ({
    menuItemId: o.menuItem.id,
    name: o.menuItem.name,
    price: o.menuItem.price,
    quantity: o.quantity,
    castName: o.castName,
    setSequence: o.setSequence,
    isExtension: o.isExtension,
    cost: o.menuItem.cost,
    castBack: o.menuItem.castBack,
  }))

  const excludedExtensionOrderIds = ex
    .map((e) => e.orderMenuItemId)
    .filter((id): id is number => typeof id === 'number')

  return {
    sets,
    orders,
    honShimeiUnit: rates.honShimeiUnit,
    banaiUnit: rates.banaiUnit,
    douhanUnit: rates.douhanUnit,
    taxRate: rates.taxRate,
    excludedExtensionOrderIds,
    nominationChargeNames: [...NOMINATION_CHARGE_NAMES],
  }
}
