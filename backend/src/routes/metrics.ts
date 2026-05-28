import { Router } from 'express'
import { storeCollection } from '../firebase'
import { todayBusinessDate } from '../lib/businessDate'
import { sendError, throwBadRequest } from '../lib/errors'
import type { BillingRecord, DailyAggregate, Expense, DailyWork } from '../types'

export const metricsRouter = Router()

interface FlSummary {
  businessDate: string
  totalSales: number
  foodCost: number
  laborCostHourly: number
  laborCostBack: number
  expenseTotal: number
  flRate: number
  profit: number
}

async function computeFlForDate(businessDate: string): Promise<FlSummary> {
  // 1) dailyAggregates キャッシュを優先
  const aggSnap = await storeCollection('dailyAggregates').doc(businessDate).get()
  if (aggSnap.exists) {
    const a = aggSnap.data() as DailyAggregate
    return {
      businessDate,
      totalSales: a.totalSales ?? 0,
      foodCost: a.foodCost ?? 0,
      laborCostHourly: a.laborCostHourly ?? 0,
      laborCostBack: a.laborCostBack ?? 0,
      expenseTotal: a.expenseTotal ?? 0,
      flRate: a.flRate ?? 0,
      profit: a.profit ?? 0,
    }
  }

  // 2) on-the-fly 計算
  const billingSnap = await storeCollection('billingRecords')
    .where('businessDate', '==', businessDate)
    .get()
  const billings = billingSnap.docs
    .map((d) => d.data() as BillingRecord)
    .filter((b) => !b.archivedAt && !b.voidedAt)

  let totalSales = 0
  let foodCost = 0
  for (const b of billings) {
    totalSales += b.total ?? 0
    // foodCost は receipt.orders から推定（cost フィールドは BillingRecord 直下に持たないため
    // tables.orders 由来の menuItem.cost 合計が必要だが、保存されていない場合 0）。
    // 暫定: BillingRecord に snapshot がある場合のみ加算。
  }

  // tables.orders からの foodCost
  const tablesSnap = await storeCollection('tables').get()
  for (const t of tablesSnap.docs) {
    const data = t.data() as { businessDate?: string; orders?: Array<{ menuItem?: { cost?: number }, quantity?: number }> }
    if (data.businessDate !== businessDate) continue
    for (const o of data.orders ?? []) {
      foodCost += (o.menuItem?.cost ?? 0) * (o.quantity ?? 0)
    }
  }

  // dailyWork から laborCostBack（castBack 合計）と laborCostHourly
  const dwSnap = await storeCollection('dailyWork')
    .where('businessDate', '==', businessDate)
    .get()
  let laborCostHourly = 0
  let laborCostBack = 0
  for (const d of dwSnap.docs) {
    const w = d.data() as DailyWork
    laborCostHourly += w.hourlyPay ?? 0
    laborCostBack += w.backTotal ?? 0
  }

  // expenses
  const expSnap = await storeCollection('expenses')
    .where('businessDate', '==', businessDate)
    .get()
  let expenseTotal = 0
  for (const e of expSnap.docs) {
    const ex = e.data() as Expense
    if (!ex.deletedAt) expenseTotal += ex.amount ?? 0
  }

  const denom = totalSales > 0 ? totalSales : 1
  const flRate = (foodCost + laborCostHourly + laborCostBack) / denom
  const profit = totalSales - (foodCost + laborCostHourly + laborCostBack) - expenseTotal

  return { businessDate, totalSales, foodCost, laborCostHourly, laborCostBack, expenseTotal, flRate, profit }
}

// GET /api/metrics/fl — 今日の FL 指標
metricsRouter.get('/fl', async (_req, res) => {
  try {
    const businessDate = todayBusinessDate()
    const summary = await computeFlForDate(businessDate)
    res.json(summary)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/metrics/fl/monthly — ?month=YYYY-MM
metricsRouter.get('/fl/monthly', async (req, res) => {
  try {
    const month = req.query.month ? String(req.query.month) : ''
    if (!/^\d{4}-\d{2}$/.test(month)) throwBadRequest('month は YYYY-MM 形式')

    const snap = await storeCollection('dailyAggregates')
      .where('businessDate', '>=', `${month}-01`)
      .where('businessDate', '<=', `${month}-31`)
      .get()

    let totalSales = 0
    let foodCost = 0
    let laborCostHourly = 0
    let laborCostBack = 0
    let expenseTotal = 0
    for (const d of snap.docs) {
      const a = d.data() as DailyAggregate
      totalSales += a.totalSales ?? 0
      foodCost += a.foodCost ?? 0
      laborCostHourly += a.laborCostHourly ?? 0
      laborCostBack += a.laborCostBack ?? 0
      expenseTotal += a.expenseTotal ?? 0
    }
    const denom = totalSales > 0 ? totalSales : 1
    const flRate = (foodCost + laborCostHourly + laborCostBack) / denom
    const profit = totalSales - (foodCost + laborCostHourly + laborCostBack) - expenseTotal

    res.json({
      month,
      totalSales,
      foodCost,
      laborCostHourly,
      laborCostBack,
      expenseTotal,
      flRate,
      profit,
    })
  } catch (e) {
    sendError(res, e)
  }
})
