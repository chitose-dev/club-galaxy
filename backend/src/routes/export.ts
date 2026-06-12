import { Router } from 'express'
import { storeCollection } from '../firebase'
import { sendError, throwBadRequest } from '../lib/errors'
import { getBackRate } from '../lib/backRate'
import type { BackType, Cast, DailyWork, DailyPayment, Deduction } from '../types'

export const exportRouter = Router()

const UTF8_BOM = '﻿'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  // RFC 4180: CRLF 区切り
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

function isDateRange(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
}

// GET /api/export/payroll-csv — ?from=YYYY-MM-DD&to=YYYY-MM-DD
exportRouter.get('/payroll-csv', async (req, res) => {
  try {
    const from = String(req.query.from ?? '')
    const to = String(req.query.to ?? '')
    if (!isDateRange(from, to)) throwBadRequest('from / to は YYYY-MM-DD 形式')

    // dailyWork 範囲取得
    const dwSnap = await storeCollection('dailyWork')
      .where('businessDate', '>=', from)
      .where('businessDate', '<=', to)
      .get()
    const dailyWork = dwSnap.docs.map((d) => d.data() as DailyWork)

    // dailyPayments / deductions（範囲取得 → メモリで集計）
    const [dpSnap, dedSnap, castSnap] = await Promise.all([
      storeCollection('dailyPayments')
        .where('businessDate', '>=', from)
        .where('businessDate', '<=', to)
        .get(),
      storeCollection('deductions')
        .where('businessDate', '>=', from)
        .where('businessDate', '<=', to)
        .get(),
      storeCollection('casts').get(),
    ])
    const dailyPayments = dpSnap.docs
      .map((d) => d.data() as DailyPayment)
      .filter((p) => !p.deletedAt)
    const deductions = dedSnap.docs
      .map((d) => d.data() as Deduction)
      .filter((d) => !d.deletedAt)
    const casts = new Map<number, Cast>(
      castSnap.docs.map((d) => {
        const c = d.data() as Cast
        return [c.id, c]
      }),
    )

    // (castId, businessDate) で日払/天引集計
    const dpKey = (castId: number, bd: string) => `${castId}_${bd}`
    const dpByKey = new Map<string, number>()
    for (const p of dailyPayments) {
      const k = dpKey(p.castId, p.businessDate)
      dpByKey.set(k, (dpByKey.get(k) ?? 0) + (p.amount ?? 0))
    }
    const dedByKey = new Map<string, number>()
    for (const d of deductions) {
      const k = dpKey(d.castId, d.businessDate)
      dedByKey.set(k, (dedByKey.get(k) ?? 0) + (d.amount ?? 0))
    }

    const header = [
      'castName',
      'businessDate',
      'workMinutes',
      'hourlyPay',
      'backTotal',
      'dailyPay',
      'deduction',
      'net',
    ]
    const rows: (string | number | null | undefined)[][] = [header]
    for (const w of dailyWork) {
      const cast = casts.get(w.castId)
      const castName = cast?.name ?? `cast_${w.castId}`
      const k = dpKey(w.castId, w.businessDate)
      const dailyPay = dpByKey.get(k) ?? 0
      const deduction = dedByKey.get(k) ?? 0
      const gross = (w.hourlyPay ?? 0) + (w.backTotal ?? 0)
      const net = gross - dailyPay - deduction
      rows.push([
        castName,
        w.businessDate,
        w.workMinutes ?? 0,
        w.hourlyPay ?? 0,
        w.backTotal ?? 0,
        dailyPay,
        deduction,
        net,
      ])
    }

    const csv = UTF8_BOM + toCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payroll_${from}_${to}.csv"`,
    )
    res.send(csv)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/export/cast-ledger/:castId — ?month=YYYY-MM
// 列: 日, 時間, 日給, Fドリンク, 本ドリンク, Fカクテル, 本カクテル, 本カクW,
//      同伴, 本指, 場内, ボトルバック, その他, P合計, 日給合計, ホステス税, 総支給額
// ドリンク系セルは `12杯/4800円`、それ以外のバック系セルは `1/4000円` 形式（0 件は空欄）。
// 欄外/参考情報（先月売上 P 数、①②等）は別画面で参照するため CSV には含めない。
type LedgerBackCol = {
  key: BackType
  label: string
  /** ドリンク系（FD/本D/Fカク/本カク/本カクW）は本数を「杯」表記 */
  isDrink: boolean
}

const LEDGER_BACK_COLUMNS: readonly LedgerBackCol[] = [
  { key: 'FD', label: 'Fドリンク', isDrink: true },
  { key: '本D', label: '本ドリンク', isDrink: true },
  { key: '本DW', label: '本DW', isDrink: true },
  { key: 'Fカク', label: 'Fカク', isDrink: true },
  { key: '本カク', label: '本カク', isDrink: true },
  { key: '本カクW', label: '本カクW', isDrink: true },
  { key: '同伴', label: '同伴', isDrink: false },
  { key: '本指名', label: '本指', isDrink: false },
  { key: '場内指名', label: '場内', isDrink: false },
  { key: 'ボトルバック', label: 'ボトルバック', isDrink: false },
  { key: 'その他', label: 'その他', isDrink: false },
]

/** バック単価が設定されている場合は `本カク(バック400円)` 形式で見出しを返す */
function backColumnHeader(col: LedgerBackCol, rate: number | undefined): string {
  if (typeof rate === 'number' && rate > 0) {
    return `${col.label}(バック${rate}円)`
  }
  return col.label
}

/** バックセルの本数 / バック額を `12杯/4800円` 形式で返す（0 件は空欄） */
function backCellValue(col: LedgerBackCol, count: number, rate: number | undefined): string {
  if (!count || count <= 0) return ''
  const amount = count * (rate ?? 0)
  return col.isDrink ? `${count}杯/${amount}円` : `${count}/${amount}円`
}

exportRouter.get('/cast-ledger/:castId', async (req, res) => {
  try {
    const castId = Number(req.params.castId)
    if (!Number.isFinite(castId)) throwBadRequest('castId は数値')
    const month = String(req.query.month ?? '')
    if (!/^\d{4}-\d{2}$/.test(month)) throwBadRequest('month は YYYY-MM 形式')
    const from = `${month}-01`
    const to = `${month}-31`

    const [dwSnap, castDoc] = await Promise.all([
      storeCollection('dailyWork')
        .where('castId', '==', castId)
        .where('businessDate', '>=', from)
        .where('businessDate', '<=', to)
        .get(),
      storeCollection('casts').doc(String(castId)).get(),
    ])
    const dailyWork = dwSnap.docs
      .map((d) => d.data() as DailyWork)
      .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
    const backRates = ((castDoc.data() as Cast | undefined)?.backRates) ?? {}

    const header = [
      '日', '時間', '日給',
      ...LEDGER_BACK_COLUMNS.map((c) => backColumnHeader(c, getBackRate(backRates, c.key))),
      'P合計', '日給合計', 'ホステス税', '総支給額',
    ]
    const rows: (string | number | null | undefined)[][] = [header]

    for (const w of dailyWork) {
      const day = w.businessDate.slice(8, 10) // DD
      const hours = ((w.workMinutes ?? 0) / 60).toFixed(2)
      const hourlyPay = w.hourlyPay ?? 0
      const backs = w.backs ?? {}
      const backCells = LEDGER_BACK_COLUMNS.map((c) =>
        backCellValue(c, backs[c.key] ?? 0, getBackRate(backRates, c.key)),
      )
      const pTotal = w.backTotal ?? 0
      const grossDaily = hourlyPay + pTotal
      const hostessTax = Math.floor(grossDaily * 0.1)
      const totalPay = grossDaily - hostessTax
      rows.push([
        day, hours, hourlyPay,
        ...backCells,
        pTotal, grossDaily, hostessTax, totalPay,
      ])
    }

    const csv = UTF8_BOM + toCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cast_${castId}_${month}.csv"`,
    )
    res.send(csv)
  } catch (e) {
    sendError(res, e)
  }
})
