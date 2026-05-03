import { Router } from 'express'
import { storeCollection } from '../firebase'
import { sendError, throwBadRequest } from '../lib/errors'
import type { Cast, DailyWork, DailyPayment, Deduction } from '../types'

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
// 列: 日, 時間, 日給, FD, 本D, Fカク, 本カク, 本カクW, 同伴, 本指名, 場内指名, ボトルバック, その他, P合計, 日給合計, ホステス税(-10%), 総支給額
exportRouter.get('/cast-ledger/:castId', async (req, res) => {
  try {
    const castId = Number(req.params.castId)
    if (!Number.isFinite(castId)) throwBadRequest('castId は数値')
    const month = String(req.query.month ?? '')
    if (!/^\d{4}-\d{2}$/.test(month)) throwBadRequest('month は YYYY-MM 形式')
    const from = `${month}-01`
    const to = `${month}-31`

    const dwSnap = await storeCollection('dailyWork')
      .where('castId', '==', castId)
      .where('businessDate', '>=', from)
      .where('businessDate', '<=', to)
      .get()
    const dailyWork = dwSnap.docs
      .map((d) => d.data() as DailyWork)
      .sort((a, b) => a.businessDate.localeCompare(b.businessDate))

    const header = [
      '日', '時間', '日給',
      'FD', '本D', 'Fカク', '本カク', '本カクW',
      '同伴', '本指名', '場内指名', 'ボトルバック', 'その他',
      'P合計', '日給合計', 'ホステス税(-10%)', '総支給額',
    ]
    const rows: (string | number | null | undefined)[][] = [header]

    for (const w of dailyWork) {
      const day = w.businessDate.slice(8, 10) // DD
      const hours = ((w.workMinutes ?? 0) / 60).toFixed(2)
      const hourlyPay = w.hourlyPay ?? 0
      const backs = w.backs ?? {}
      const fd = backs['FD'] ?? 0
      const honD = backs['本D'] ?? 0
      const fKaku = backs['Fカク'] ?? 0
      const honKaku = backs['本カク'] ?? 0
      const honKakuW = backs['本カクW'] ?? 0
      const douhan = backs['同伴'] ?? 0
      const honShimei = backs['本指名'] ?? 0
      const banaiShimei = backs['場内指名'] ?? 0
      const bottleBack = backs['ボトルバック'] ?? 0
      const sonota = backs['その他'] ?? 0
      const pTotal = w.backTotal ?? 0
      const grossDaily = hourlyPay + pTotal
      const hostessTax = Math.floor(grossDaily * 0.1)
      const totalPay = grossDaily - hostessTax
      rows.push([
        day, hours, hourlyPay,
        fd, honD, fKaku, honKaku, honKakuW,
        douhan, honShimei, banaiShimei, bottleBack, sonota,
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
