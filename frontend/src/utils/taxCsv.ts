/**
 * 税理士向け CSV エクスポート。
 *
 * PDF/Word 要件:
 *   - 「税理士提出用CSVでは1組1件」
 *   - 「税理士さんに確認したところ1件(複数枚)でも1件の扱いで大丈夫。CSVは1組1件」
 *   - 「1ヶ月の売上をテストして、1ヶ月がまとまったものを税理士に渡して大丈夫か聞いてみたい」
 *   - 「キャストの給料も一人だけでも1ヶ月分のドリンクや指名などを含めて
 *      まとめたデータ」
 *
 * 本モジュールは UI から切り離した純粋な CSV 文字列ビルダ + ブラウザ download
 * 用のヘルパーを提供する。実呼出は Salary / Profit ページ側の export ボタン。
 */

import {
  type BackType,
  type BillingRecord,
  type Cast,
  type AttendanceRecord,
  type MenuCategory,
  type SetPrice,
  initialMenuCategories,
  isExtensionRow,
  setPrices as initialSetPrices,
} from '../data/mock'
import { calcHourlyPay } from './payroll'
import { getBackRate } from './backRate'
import { computeDailyWork } from './dailyWork'
import { calcMonthlyGuaranteeShortfall } from './saleGuarantee'
import { computeVisitBreakdown, isMergedShadowRecord } from './visitBreakdown'

// ─────────────────────────────────────────────────────────────
// 共通ユーティリティ
// ─────────────────────────────────────────────────────────────

/** CSV セル 1 件をエスケープ。カンマ / 改行 / 二重引用符を含む場合は
 *  全体を二重引用符で囲み、内部の " を "" に置換する (RFC 4180)。 */
export function csvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** 行配列 → CSV テキスト。改行は CRLF (Excel 互換)。 */
export function rowsToCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

/**
 * ブラウザで CSV をダウンロードさせる。BOM 付き UTF-8 で
 * Excel/Numbers でも文字化けしないようにする。
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // メモリ解放は非同期で。ダウンロードが open される前に revoke すると壊れる。
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** YYYY-MM プレフィックスにマッチする会計レコードだけ抽出 (取消除外)。 */
function filterMonthRecords(
  records: readonly BillingRecord[],
  monthPrefix: string,
  // 売上/明細CSV(1組1行)は合算 shadow を除外（代表卓 record に総額が含まれ二重計上になる）。
  // 給与/キャスト別CSVは per-cast 帰属に shadow を使うため除外しない（既定 false）。
  excludeMergedShadow = false,
): BillingRecord[] {
  return records.filter((r) => {
    if (r.voidedAt) return false
    if (excludeMergedShadow && isMergedShadowRecord(r)) return false
    const d = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
    return d.startsWith(monthPrefix)
  })
}

const paymentLabel = (m: BillingRecord['paymentMethod']): string =>
  m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

// ─────────────────────────────────────────────────────────────
// 月次売上 CSV (1組1行)
// ─────────────────────────────────────────────────────────────

/**
 * 月次売上 CSV を組み立てる。**1 BillingRecord = 1 組 = 1 行**。
 * PDF C で複数枚の領収書 (IssuedReceipt) を分割発行していても、
 * 売上集計上は親の BillingRecord 1 件として扱う方針 (税理士確認済み)。
 *
 * 列:
 *   営業日 / 会計日時 / 卓 / 伝票No / 担当キャスト / 本指名 / 人数 /
 *   小計 / セット料金 / 消費税(内税) / TAX(サ料) / 値引 / 合計 /
 *   支払方法 / 現金 / カード / カード手数料 / 売上帰属(JSON)
 */
export function buildMonthlySalesCsv(
  records: readonly BillingRecord[],
  monthPrefix: string,
): string {
  const header = [
    '営業日', '会計日時', '卓', '伝票No', '担当キャスト', '本指名', '人数',
    '小計(税抜)', 'セット料金', '消費税(内税)', 'TAX(サ料)', '値引', '合計',
    '支払方法', '現金', 'カード', 'カード手数料',
    '売上帰属(本指名按分)',
  ] as const
  const filtered = filterMonthRecords(records, monthPrefix, true)
  // 営業日 + 会計日時 でソート (税理士提出用は時系列順が読みやすい)
  filtered.sort((a, b) => {
    const ad = a.businessDate ?? a.date ?? a.completedAt.slice(0, 10)
    const bd = b.businessDate ?? b.date ?? b.completedAt.slice(0, 10)
    if (ad !== bd) return ad.localeCompare(bd)
    return a.completedAt.localeCompare(b.completedAt)
  })
  const rows: (string | number | null | undefined)[][] = [header.slice()]
  for (const r of filtered) {
    const snap = r.receiptSnapshot
    const businessDate = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
    const attribution = r.salesAttributionByCast
      ? Object.entries(r.salesAttributionByCast)
          .map(([k, v]) => `${k}:${v}`)
          .join(' / ')
      : ''
    rows.push([
      businessDate,
      r.completedAt,
      r.tableNumber,
      snap?.receiptNumber ?? '',
      (r.castNamesSnapshot ?? []).join(' / '),
      (snap?.mainNominationCastNamesSnapshot ?? []).join(' / '),
      r.guestCountSnapshot ?? '',
      snap?.subtotal ?? r.subtotalBeforeTax ?? '',
      snap?.setFee ?? '',
      snap?.consumptionTax ?? '',
      snap?.tax ?? '',
      snap?.discount ?? 0,
      r.total,
      paymentLabel(r.paymentMethod),
      r.cashAmount ?? '',
      r.cardAmount ?? '',
      r.cardFee ?? '',
      attribution,
    ])
  }
  return rowsToCsv(rows)
}

/**
 * 月次売上 (内訳) CSV — 1組内の伝票区分・商品明細を 1 行ずつに展開した詳細版。
 * 「1組1件」の本 CSV とは別に、内訳確認用として税理士に補助提示する想定。
 *
 * 行種別:
 *   - 'セット料金'           : 1Set目 / EX(n) ごとに 1 行 (区分 = 'セット料金',
 *                               名称 = '1Set目'/'EX(1)'/'EX(1)半'/...、
 *                               小計 = computeVisitBreakdown の按分額)
 *   - '指名・チャージ'       : 1Set目 に集約された charge 合計を 1 行 (>0 のときのみ)
 *   - '注文'                 : 注文ごとに 1 行 (区分 = '組全体' = ticket 紐付け不可)
 *
 * @param categories - subcategory ID → 日本語ラベル解決元（store 由来）。
 *   省略時は initialMenuCategories を使う（テスト用途・後方互換）。
 */
export function buildMonthlySalesDetailCsv(
  records: readonly BillingRecord[],
  monthPrefix: string,
  categories: readonly MenuCategory[] = initialMenuCategories,
  bands: readonly SetPrice[] = initialSetPrices,
): string {
  const header = [
    '営業日', '会計日時', '卓', '伝票No',
    '行種別', '区分', '名称', 'カテゴリ', '数量', '単価', '小計', '担当キャスト',
  ] as const
  const filtered = filterMonthRecords(records, monthPrefix, true)
  filtered.sort((a, b) => {
    const ad = a.businessDate ?? a.date ?? a.completedAt.slice(0, 10)
    const bd = b.businessDate ?? b.date ?? b.completedAt.slice(0, 10)
    if (ad !== bd) return ad.localeCompare(bd)
    return a.completedAt.localeCompare(b.completedAt)
  })
  const rows: (string | number | null | undefined)[][] = [header.slice()]
  for (const r of filtered) {
    const snap = r.receiptSnapshot
    if (!snap) continue
    const businessDate = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
    const base: (string | number | null | undefined)[] = [
      businessDate, r.completedAt, r.tableNumber, snap.receiptNumber,
    ]
    const b = computeVisitBreakdown(r, categories, bands)
    // セット料金行を ticket ごとに 1 行ずつ出す（1Set目 / EX(n) / EX(n)半 ...）
    for (const t of b.tickets) {
      rows.push([
        ...base, 'セット料金', t.label, 'セット料金', '-', '', '',
        t.setFeeAllocated, '',
      ])
    }
    // 指名・チャージ計（>0 のときのみ。1Set目 に集約済み）
    if (b.totals.chargeSubtotal > 0) {
      rows.push([
        ...base, '指名・チャージ', '1Set目', '指名・チャージ計', '-', '', '',
        b.totals.chargeSubtotal, '',
      ])
    }
    // 注文明細 (組全体扱い — 注文ごとの ticket 紐付けは記録されていない)。
    // 延長行は伝票区分側で個別に出るため注文セクションから除外する。
    for (const o of snap.orders) {
      if (isExtensionRow(o.menuItem.name)) continue
      const qty = o.quantity ?? 1
      rows.push([
        ...base, '注文', '組全体', o.menuItem.name,
        o.menuItem.subcategory ?? '',
        qty, o.menuItem.price, qty * o.menuItem.price,
        o.castName ?? '',
      ])
    }
  }
  return rowsToCsv(rows)
}

// ─────────────────────────────────────────────────────────────
// 月次キャスト給与 CSV
// ─────────────────────────────────────────────────────────────

/** バック種別の列順 (キャスト給与 CSV のヘッダ用)。
 *  本指名 / 場内 / 同伴 / 各種ドリンク・カクテル系 / ボトルバック を 1 行に出す。 */
const BACK_TYPE_COLS: readonly BackType[] = [
  '本指名', '場内指名', '同伴',
  'FD', '本D', '本DW',
  'Fカク', '本カク', '本カクW',
  'Fショ', '本ショ',
  'FP', '本P',
  'FB', '本B',
  'ボトルバック',
] as const

/**
 * 月次キャスト給与 CSV を組み立てる。
 *
 * 列:
 *   キャストID / キャスト名 / 本名 / 勤務時間 / 時給 / 時給支給額 /
 *   本指名…ボトルバック (件数) / 各バック金額合計 /
 *   延長指名バック(円) / ボトルバック(円, A2) /
 *   売上保証差額 / 想定支給(時給+バック+保証差額)
 */
export function buildMonthlyCastSalaryCsv(
  casts: readonly Cast[],
  billingRecords: readonly BillingRecord[],
  attendanceRecords: readonly AttendanceRecord[],
  monthPrefix: string,
): string {
  const monthRecords = filterMonthRecords(billingRecords, monthPrefix)
  const monthAttendance = attendanceRecords.filter((a) => a.date.startsWith(monthPrefix))
  // PR #76/A2 仕様: 本指名ボトルバックを按分するため、computeDailyWork に
  // **全キャスト分の `ボトルバック` 率マップ** を渡す必要がある（自キャスト分
  // だけでは calcChampagneSplit が他の本指名割合を計算できず 0 になる）。
  const bottleBackRateByCast = Object.fromEntries(
    casts.map((c) => [c.name, c.backRates['ボトルバック'] ?? 0]),
  )

  const header: string[] = [
    'キャストID', 'キャスト名', '本名',
    '勤務時間(h)', '時給(円)', '時給支給額(円)',
    ...BACK_TYPE_COLS.map((t) => `${t}(件数)`),
    'バック合計金額(円)',
    '延長指名バック(円)', 'ボトルバック(円)',
    '月通常給与(円)', '月売上(円)', '保証額(円)', '売上保証差額(円)',
    '想定支給(円, 時給+バック+保証差額)',
  ]
  const rows: (string | number | null | undefined)[][] = [header.slice()]
  for (const cast of casts) {
    if (!cast.active) continue
    // キャスト出勤分の勤務時間合計
    const attMine = monthAttendance.filter((a) => a.staffId === cast.id && a.staffType === 'cast')
    const totalHours = attMine.reduce((s, a) => s + (a.workHours ?? 0), 0)
    // 売上 / バックは computeDailyWork で日次集計してから月で合算。
    // shimeiRate = cast.backRates['本指名'] (extensionBackAmount の按分基準額)
    // bottleBackRateByCast = 全キャスト分の率マップ (calcChampagneSplit が
    //   レシート同卓の他キャストの率も参照するため、自キャストだけでは不足)
    const shimeiRate = cast.backRates['本指名'] ?? 0
    const dailyWork = computeDailyWork(
      cast.id, cast.name, [...monthAttendance], [...monthRecords],
      shimeiRate, bottleBackRateByCast,
    )
    // 件数集計
    const backCounts: Partial<Record<BackType, number>> = {}
    for (const dw of dailyWork) {
      for (const [k, v] of Object.entries(dw.backs)) {
        backCounts[k as BackType] = (backCounts[k as BackType] ?? 0) + (v ?? 0)
      }
    }
    // バック金額 = 件数 × backRates[type]。ボトルバックは bottleBackAmount を別途。
    let backAmountTotal = 0
    for (const t of BACK_TYPE_COLS) {
      if (t === 'ボトルバック') continue // bottleBackAmount が正本
      const cnt = backCounts[t] ?? 0
      const rate = getBackRate(cast.backRates, t)
      backAmountTotal += cnt * rate
    }
    const extensionBackAmount = dailyWork.reduce(
      (s, dw) => s + (dw.extensionBackAmount ?? 0), 0,
    )
    const bottleBackAmount = dailyWork.reduce(
      (s, dw) => s + (dw.bottleBackAmount ?? 0), 0,
    )
    const hourlyPay = calcHourlyPay(cast.hourlyRate, totalHours)
    // 売上保証差額（月次）
    const shortfall = calcMonthlyGuaranteeShortfall(dailyWork, cast)
    const supposedTotal =
      hourlyPay + backAmountTotal + extensionBackAmount + bottleBackAmount + shortfall.shortfall

    rows.push([
      cast.id, cast.name, cast.realName ?? '',
      totalHours.toFixed(2), cast.hourlyRate, hourlyPay,
      ...BACK_TYPE_COLS.map((t) => backCounts[t] ?? 0),
      backAmountTotal,
      extensionBackAmount, bottleBackAmount,
      shortfall.monthlyRegularSalary, shortfall.monthlyTotalSales,
      shortfall.guaranteeBase, shortfall.shortfall,
      supposedTotal,
    ])
  }
  return rowsToCsv(rows)
}
