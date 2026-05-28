/**
 * 1組（= 1 BillingRecord）の伝票内訳ビュー用ヘルパー。
 *
 * PDF/Word 要件:
 * - 「1件は1組で、1件は複数枚になるときもある」
 * - 「画面上では1組の中に複数伝票の内訳を紐づけて閲覧」
 * - 「特定の1件(複数枚)を提示して欲しいと言われる」
 * - 「伝票区分（1Set目 / EX(1) / EX(2)半 など）」
 *
 * 1 BillingRecord は会計確定時の卓セッション 1 件分。`receiptSnapshot` と
 * `extensionHistorySnapshot` から、以下を 1 件ずつ並べた breakdown を作る:
 *   1Set目 → EX(1) or EX(1)半 → EX(2) or EX(2)半 → … (時間帯付き)
 *
 * 商品明細は注文に区分タグを持たないため、伝票区分（セット/延長）単位では
 * 切り分けず「visit 全体の注文一覧」を商品カテゴリ別にグループ化して出す。
 * これは PDF/Word の「ドリンク/ウイスキー/シャンパン等の商品カテゴリ別の内訳」
 * 要件を満たす最小実装。
 */

import {
  type BillingRecord,
  type ExtensionEntry,
  type MenuCategory,
  type ReceiptSnapshot,
  type SetPrice,
  SET_DURATION_MINUTES,
  getSetPriceForTime,
  initialMenuCategories,
  isChargeOrNominationOrder,
  isExtensionRow,
  setPrices as initialSetPrices,
} from '../data/mock'
import { addMinutesToHHmm, formatTimeRange, getExLabel } from './setCountLabel'

/** セット/延長 1 区分ぶんの行。 */
export interface VisitTicket {
  /** 'set' = 1Set目（入店分）、'extension' = 1 回ぶんの延長 */
  kind: 'set' | 'extension'
  /** ラベル: "1Set目" / "EX(1)" / "EX(1)半" / "EX(2)" ... */
  label: string
  /** 開始 HH:MM (startTime 未定の旧レコードは null) */
  startHHMM: string | null
  /** 終了 HH:MM (startTime 未定の旧レコードは null) */
  endHHMM: string | null
  /** "12:00〜13:00まで" 形式の表示用文字列 (null 含みは空) */
  rangeLabel: string
  /** この区分の所要分数 (1Set目 = SET_DURATION_MINUTES、EX は entry.minutes) */
  minutes: number
  /** この区分に按分されたセット/延長料金（円）。
   *  - 1Set目: `getSetPriceForTime(startTime) × guestCount` (会計時単価で復元)
   *  - EX:    残額（totals.setFee − 1Set目）を entry.minutes 比で按分
   *  最後の EX で端数を吸収して setFee 合計と一致させる。 */
  setFeeAllocated: number
  /** 指名・同伴・チャージ系の合計（円）。
   *  各 charge が「いつ発生したか」のタイムスタンプは記録されていないため、
   *  便宜的に **1Set目** に全額集約する。EX 側は常に 0。 */
  chargeAllocated: number
  /** setFeeAllocated + chargeAllocated。商品（メニュー注文）は注文ごとの
   *  ticket 紐付けが残っていないので含めない（visit 全体の `totals.menuSubtotal`
   *  を別途参照する想定）。 */
  subtotalEstimate: number
  /** subtotalEstimate を visit 全体の subtotal で按分した TAX 概算（円）。 */
  taxEstimate: number
  /** 同じく消費税の按分概算（円）。 */
  consumptionTaxEstimate: number
  /** subtotalEstimate + taxEstimate + consumptionTaxEstimate。 */
  totalEstimate: number
}

/** 注文・指名・チャージの 1 行を商品カテゴリ別に分けたもの。 */
export interface VisitOrderLine {
  name: string
  /** チャージ/指名系か (シングルチャージ/同伴/本指名/場内指名/Help) */
  isCharge: boolean
  /** GuestMenuItem.subcategory / CastMenuItem.subcategory。チャージ系は 'charge' 固定。 */
  subcategory: string
  /** 表示ラベル化されたカテゴリ名（"焼酎" 等）。subcategory が
   *  initialMenuCategories に無いとき・古いレコードは subcategory 値そのまま。 */
  categoryLabel: string
  quantity: number
  /** 単価 (会計時スナップショット) */
  unitPrice: number
  /** quantity × unitPrice */
  subtotal: number
  /** 注文時に紐付けたキャスト名 (任意) */
  castName?: string
}

/** カテゴリ別 (subcategory) の小計。 */
export interface VisitCategoryTotal {
  subcategory: string
  categoryLabel: string
  /** 件数 (orders[].quantity の合計) */
  quantity: number
  /** 合計金額 */
  subtotal: number
}

export interface VisitBreakdown {
  recordId: string
  tableNumber: string
  /** 入店開始 HH:MM (receiptSnapshot.startTime) */
  startTime: string | null
  /** セッション全体の終了 HH:MM (1Set目 + 全 EX) */
  sessionEndHHMM: string | null
  /** 完了日時 (ISO) */
  completedAt: string
  /** 営業日 (businessDate ?? date ?? null) */
  businessDate: string | null
  /** 入店人数（会計時スナップショット）。古いレコードは null。 */
  guestCount: number | null
  /** 担当キャスト名一覧 */
  assignedCastNames: string[]
  /** 本指名キャスト名一覧 (会計時スナップショット) */
  mainNominationCastNames: string[]
  /** 売上帰属（本指名按分済み） */
  salesAttributionByCast: Record<string, number>
  /** 伝票区分の並び (1Set目 → EX(1) → ...) */
  tickets: VisitTicket[]
  /** チャージ/指名系の明細 (visit 全体まとめ) */
  chargeLines: VisitOrderLine[]
  /** ドリンク等の明細 (subcategory 単位で並ぶ) */
  menuLines: VisitOrderLine[]
  /** カテゴリ別小計 (menuLines のみ) */
  categoryTotals: VisitCategoryTotal[]
  /** 合計類 */
  totals: {
    /** セット料金合計 (1Set目 + 延長料金。receiptSnapshot.setFee) */
    setFee: number
    /** チャージ/指名の合計金額 */
    chargeSubtotal: number
    /** 商品明細の合計金額 */
    menuSubtotal: number
    /** TAX前の小計 */
    subtotal: number
    /** TAX (サービス料) */
    tax: number
    /** 内税の消費税 */
    consumptionTax: number
    /** 値引き */
    discount: number
    /** 最終合計 (BillingRecord.total) */
    total: number
  }
  paymentMethod: BillingRecord['paymentMethod']
  /** 取消済みフラグ (取消後の表示制御用) */
  voided: boolean
}

/** snapshot 欠落の旧データ向け: orders 内の延長行から擬似 ExtensionEntry 配列を
 *  生成する。timestamp は復元できないため空文字 (`buildTicketSkeletons` 側で
 *  cursorHHMM フォールバックされる)。 */
function extractExtensionsFromOrders(
  orders: ReceiptSnapshot['orders'] | undefined,
): ExtensionEntry[] {
  if (!orders) return []
  const out: ExtensionEntry[] = []
  for (const o of orders) {
    const name = o.menuItem.name
    let minutes: 30 | 60 | null = null
    const legacy = /^延長\s*\+(30|60)分$/.exec(name)
    if (legacy) minutes = legacy[1] === '30' ? 30 : 60
    else {
      const ex = /^EX\((?:\d+|\?)\)(半?)$/.exec(name)
      if (ex) minutes = ex[1] === '半' ? 30 : 60
    }
    if (minutes == null) continue
    out.push({
      id: out.length + 1,
      minutes,
      timestamp: '',
      nominatedCastName: o.castName,
      nominatedCastNames: o.castName ? [o.castName] : [],
    })
  }
  return out
}

function buildCategoryLabelMap(categories: readonly MenuCategory[]): Map<string, string> {
  // subcategory id → 日本語ラベル。'guest' と 'cast' に同名 id は出ないため kind は無視。
  const m = new Map<string, string>()
  for (const c of categories) {
    if (!m.has(c.id)) m.set(c.id, c.label)
  }
  return m
}

/** ベースの ticket 骨組み（時間帯まで）を作る内部 helper。金額は computeVisitBreakdown
 *  側で配分してから上書きする。 */
function buildTicketSkeletons(
  startTime: string | null,
  extensionHistory: readonly ExtensionEntry[] | undefined,
): VisitTicket[] {
  const zeroMoney = {
    setFeeAllocated: 0,
    chargeAllocated: 0,
    subtotalEstimate: 0,
    taxEstimate: 0,
    consumptionTaxEstimate: 0,
    totalEstimate: 0,
  }
  const tickets: VisitTicket[] = []
  const setEnd = startTime ? addMinutesToHHmm(startTime, SET_DURATION_MINUTES) : null
  tickets.push({
    kind: 'set',
    label: '1Set目',
    startHHMM: startTime,
    endHHMM: setEnd,
    rangeLabel: startTime && setEnd ? formatTimeRange(startTime, setEnd) : '',
    minutes: SET_DURATION_MINUTES,
    ...zeroMoney,
  })
  // 延長分。entry.timestamp が ISO の場合は HH:MM に丸める。
  // 旧レコードで timestamp 欠落 / 不正な場合は、直前 ticket の endHHMM を起点に推定。
  let cursorHHMM: string | null = setEnd
  ;(extensionHistory ?? []).forEach((entry, i) => {
    const label = getExLabel(i + 1, entry.minutes)
    let extStart: string | null = null
    if (entry.timestamp) {
      const d = new Date(entry.timestamp)
      if (!Number.isNaN(d.getTime())) {
        extStart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
    }
    if (!extStart) extStart = cursorHHMM
    const extEnd = extStart ? addMinutesToHHmm(extStart, entry.minutes) : null
    tickets.push({
      kind: 'extension',
      label,
      startHHMM: extStart,
      endHHMM: extEnd,
      rangeLabel: extStart && extEnd ? formatTimeRange(extStart, extEnd) : '',
      minutes: entry.minutes,
      ...zeroMoney,
    })
    cursorHHMM = extEnd
  })
  return tickets
}

/**
 * setFee の合計を 1Set目 / 各 EX に按分する。
 * - 1Set目 = `getSetPriceForTime(startTime) × guestCount`（時間帯ごとの単価で復元）
 * - 残額 = `setFeeTotal − 1Set目` を各 EX の minutes 比で按分
 * - 端数は最後の EX が吸収して合計と一致させる
 * - guestCount / startTime / 残額が取れない場合は均等割り（合計は保つ）
 */
export function allocateSetFee(
  setFeeTotal: number,
  startTime: string | null,
  guestCount: number | null,
  extensions: readonly ExtensionEntry[],
  bands: readonly SetPrice[] = initialSetPrices,
): number[] {
  const ticketCount = 1 + extensions.length
  if (setFeeTotal <= 0 || ticketCount === 0) return new Array(ticketCount).fill(0)
  // 1Set目 推定。startTime / guestCount があれば単価で復元、無ければ
  // 「setFeeTotal を ticketCount で均等割り」のフォールバック。
  let first = 0
  if (startTime && guestCount != null && guestCount > 0) {
    const unit = getSetPriceForTime(startTime, bands as SetPrice[])
    first = Math.min(unit * guestCount, setFeeTotal)
  } else {
    first = Math.floor(setFeeTotal / ticketCount)
  }
  const out: number[] = [first]
  const remaining = Math.max(0, setFeeTotal - first)
  const totalExtMinutes = extensions.reduce((s, e) => s + e.minutes, 0)
  let accum = 0
  extensions.forEach((entry, i) => {
    const isLast = i === extensions.length - 1
    let portion: number
    if (totalExtMinutes > 0) {
      portion = isLast
        ? Math.max(0, remaining - accum)
        : Math.floor(remaining * (entry.minutes / totalExtMinutes))
    } else {
      portion = isLast ? Math.max(0, remaining - accum) : 0
    }
    out.push(portion)
    accum += portion
  })
  return out
}

/**
 * BillingRecord 1 件分の breakdown を組み立てる。
 *
 * @param record - 対象の会計レコード
 * @param categories - subcategory ID → 日本語ラベルの解決元（store 由来）。
 *   省略時は `initialMenuCategories` を使う（テスト用途・後方互換）。
 */
export function computeVisitBreakdown(
  record: BillingRecord,
  categories: readonly MenuCategory[] = initialMenuCategories,
  bands: readonly SetPrice[] = initialSetPrices,
): VisitBreakdown {
  const snap: ReceiptSnapshot | undefined = record.receiptSnapshot
  const labelMap = buildCategoryLabelMap(categories)
  const startTime = snap?.startTime ?? null
  // extensionHistorySnapshot を一次ソースに ticket を組み立てる。snapshot 欠落の
  // 旧データ救済として、snapshot が空で orders 内に延長行があれば、orders から
  // 擬似的に ExtensionEntry を合成して ticket 化する (序数は登場順)。
  const snapshotExt = record.extensionHistorySnapshot ?? []
  const fallbackExt = snapshotExt.length === 0
    ? extractExtensionsFromOrders(snap?.orders)
    : []
  const ext: readonly ExtensionEntry[] = snapshotExt.length > 0 ? snapshotExt : fallbackExt
  const tickets = buildTicketSkeletons(startTime, ext)
  const sessionEndHHMM = tickets.length > 0 ? tickets[tickets.length - 1].endHHMM : null

  // orders を charge / menu に分割し、subcategory 単位で集計する。
  const chargeLines: VisitOrderLine[] = []
  const menuLines: VisitOrderLine[] = []
  const categoryAgg = new Map<string, VisitCategoryTotal>()
  if (snap?.orders) {
    for (const o of snap.orders) {
      // 延長行は伝票区分セクションで個別表示するため、注文/カテゴリ集計からは除外。
      if (isExtensionRow(o.menuItem.name)) continue
      const qty = o.quantity ?? 1
      const unit = o.menuItem.price ?? 0
      const sub = unit * qty
      const isCharge = isChargeOrNominationOrder({ menuItem: { name: o.menuItem.name } })
      const subcategory = isCharge ? 'charge' : (o.menuItem.subcategory ?? 'unknown')
      const categoryLabel = isCharge
        ? '指名・チャージ'
        : (labelMap.get(subcategory) ?? subcategory)
      const line: VisitOrderLine = {
        name: o.menuItem.name,
        isCharge,
        subcategory,
        categoryLabel,
        quantity: qty,
        unitPrice: unit,
        subtotal: sub,
        castName: o.castName,
      }
      if (isCharge) {
        chargeLines.push(line)
      } else {
        menuLines.push(line)
        const existing = categoryAgg.get(subcategory)
        if (existing) {
          existing.quantity += qty
          existing.subtotal += sub
        } else {
          categoryAgg.set(subcategory, {
            subcategory,
            categoryLabel,
            quantity: qty,
            subtotal: sub,
          })
        }
      }
    }
  }
  // カテゴリ表示順は initialMenuCategories.order に従う（無いものは末尾）
  const categoryOrder = new Map<string, number>()
  categories.forEach((c, idx) => {
    if (!categoryOrder.has(c.id)) categoryOrder.set(c.id, c.order ?? idx)
  })
  const categoryTotals = [...categoryAgg.values()].sort((a, b) => {
    const ao = categoryOrder.get(a.subcategory) ?? 9999
    const bo = categoryOrder.get(b.subcategory) ?? 9999
    return ao - bo
  })

  const chargeSubtotal = chargeLines.reduce((s, l) => s + l.subtotal, 0)
  const menuSubtotal = menuLines.reduce((s, l) => s + l.subtotal, 0)

  // ticket ごとに setFee / charge を按分し、subtotal と按分 tax を載せる。
  // 商品 (menuSubtotal) は注文単位の ticket 紐付けが残っていないため、
  // ticket には乗せず visit 全体合計だけ保持する（UI/CSV で注記する）。
  const setFee = snap?.setFee ?? 0
  const subtotal = snap?.subtotal ?? record.subtotalBeforeTax ?? 0
  const tax = snap?.tax ?? 0
  const consumptionTax = snap?.consumptionTax ?? 0
  const guestCountVal = record.guestCountSnapshot ?? null
  const setFeeByIndex = allocateSetFee(setFee, startTime, guestCountVal, ext, bands)
  const allocAccum = { tax: 0, ct: 0 }
  tickets.forEach((t, i) => {
    t.setFeeAllocated = setFeeByIndex[i] ?? 0
    t.chargeAllocated = i === 0 ? chargeSubtotal : 0
    t.subtotalEstimate = t.setFeeAllocated + t.chargeAllocated
    const ratio = subtotal > 0 ? t.subtotalEstimate / subtotal : 0
    const isLast = i === tickets.length - 1
    // 最後の ticket は端数を吸収して合計と一致させる
    if (isLast) {
      t.taxEstimate = Math.max(0, tax - allocAccum.tax)
      t.consumptionTaxEstimate = Math.max(0, consumptionTax - allocAccum.ct)
    } else {
      t.taxEstimate = Math.floor(tax * ratio)
      t.consumptionTaxEstimate = Math.floor(consumptionTax * ratio)
    }
    t.totalEstimate = t.subtotalEstimate + t.taxEstimate + t.consumptionTaxEstimate
    allocAccum.tax += t.taxEstimate
    allocAccum.ct += t.consumptionTaxEstimate
  })

  return {
    recordId: record.id,
    tableNumber: record.tableNumber,
    startTime,
    sessionEndHHMM,
    completedAt: record.completedAt,
    businessDate: record.businessDate ?? record.date ?? null,
    guestCount: record.guestCountSnapshot ?? null,
    assignedCastNames: record.castNamesSnapshot ?? [],
    mainNominationCastNames: snap?.mainNominationCastNamesSnapshot ?? [],
    salesAttributionByCast: record.salesAttributionByCast ?? {},
    tickets,
    chargeLines,
    menuLines,
    categoryTotals,
    totals: {
      setFee,
      chargeSubtotal,
      menuSubtotal,
      subtotal,
      tax,
      consumptionTax,
      discount: snap?.discount ?? 0,
      total: record.total,
    },
    paymentMethod: record.paymentMethod,
    voided: !!record.voidedAt,
  }
}

/**
 * 合算会計の shadow レコードか判定する。
 * 代表卓レコードの total に合算総額が含まれるため、shadow を売上/利益/レジ締めの
 * **総額集計から除外**して二重計上を防ぐ（per-cast 売上帰属には引き続き使う）。
 * 明示フラグ `isMergedShadow` を優先し、フラグ無し旧データは
 * 「mixed・receiptSnapshot なし・現金/カード 0」で後方互換判定する。
 */
export function isMergedShadowRecord(r: Pick<BillingRecord,
  'isMergedShadow' | 'receiptSnapshot' | 'cashAmount' | 'cardAmount' | 'paymentMethod'
>): boolean {
  if (r.isMergedShadow === true) return true
  return r.paymentMethod === 'mixed'
    && !r.receiptSnapshot
    && (r.cashAmount ?? 0) === 0
    && (r.cardAmount ?? 0) === 0
}

/** 日付（businessDate / date）でグループ化された会計レコード一覧。 */
export interface DailyVisitGroup {
  /** YYYY-MM-DD */
  businessDate: string
  records: BillingRecord[]
  /** 取消除外後の合計金額 (= 表示用 sales) */
  totalSales: number
  /** 件数 (取消除外後) */
  visitCount: number
}

/**
 * BillingRecord[] を businessDate (無ければ date) ベースでグループ化する。
 * 取消済みレコード (voidedAt あり) も `records` には含めるが、
 * `totalSales` / `visitCount` の集計からは除外する。
 */
export function groupBillingRecordsByDate(
  records: readonly BillingRecord[],
): DailyVisitGroup[] {
  const map = new Map<string, BillingRecord[]>()
  for (const r of records) {
    const key = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  const out: DailyVisitGroup[] = []
  for (const [date, list] of map) {
    // 取消除外 + 合算 shadow 除外（shadow は代表卓 record に含まれ二重計上になる）。
    const active = list.filter((r) => !r.voidedAt && !isMergedShadowRecord(r))
    out.push({
      businessDate: date,
      records: list,
      totalSales: active.reduce((s, r) => s + r.total, 0),
      visitCount: active.length,
    })
  }
  // 新しい日付が先頭になるよう降順
  out.sort((a, b) => b.businessDate.localeCompare(a.businessDate))
  return out
}
