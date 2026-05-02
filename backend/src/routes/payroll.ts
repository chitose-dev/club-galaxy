import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser, requireRole } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwBadRequest } from '../lib/errors'
import type { DailyPayment, Deduction, DailyWork } from '../types'

export const payrollRouter = Router()

// 10% 控除（StoreSettings.dailyPayDeductionRate と同義、暫定 const）
const DAILY_PAY_DEDUCTION_RATE = 0.1

function calcAmountAfterDeduction(amount: number): number {
  return Math.floor(amount * (1 - DAILY_PAY_DEDUCTION_RATE))
}

// GET /api/payroll/daily-payments
payrollRouter.get('/daily-payments', async (req, res) => {
  try {
    let query = storeCollection('dailyPayments').orderBy('id')
    if (req.query.castId) {
      query = storeCollection('dailyPayments')
        .where('castId', '==', Number(req.query.castId))
        .orderBy('id')
    }
    const snap = await query.get()
    const data = snap.docs
      .map((d) => d.data() as DailyPayment)
      .filter((p) => !p.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/payroll/daily-payments
payrollRouter.post('/daily-payments', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (
      typeof body.id !== 'number' ||
      typeof body.amount !== 'number' ||
      typeof body.castId !== 'number'
    ) {
      throwBadRequest('id / amount / castId が必要です')
    }
    if (body.staffType !== 'cast' && body.staffType !== 'boy') {
      throwBadRequest('staffType は cast / boy のいずれか')
    }
    const now = nowJstIso()
    const payment: DailyPayment = {
      ...body,
      amountAfterDeduction: calcAmountAfterDeduction(body.amount),
      createdBy: user.username,
      createdAt: now,
    } as DailyPayment
    await storeCollection('dailyPayments').doc(String(payment.id)).set(payment)
    res.status(201).json(payment)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/payroll/deductions
payrollRouter.get('/deductions', async (req, res) => {
  try {
    let query = storeCollection('deductions').orderBy('id')
    if (req.query.castId) {
      query = storeCollection('deductions')
        .where('castId', '==', Number(req.query.castId))
        .orderBy('id')
    }
    const snap = await query.get()
    const data = snap.docs
      .map((d) => d.data() as Deduction)
      .filter((d) => !d.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// PUT /api/payroll/deductions — replace-all (R8 同様、当面マスタ刷新用に物理削除を許容)
// ⚠️ Rev.4.1 §5.8 では PUT 仕様自体が無く、本来は POST(追加)/DELETE(:id soft) の組合せ運用。
// 暫定として残置、owner-only でガード。
// TODO P1: Rev.4.1 仕様に揃え POST + DELETE/:id (soft) に整理
payrollRouter.put('/deductions', requireRole('owner'), async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const inputs = (req.body ?? []) as Deduction[]
    for (const d of inputs) {
      if (d.staffType !== 'cast' && d.staffType !== 'boy') {
        throwBadRequest(`Deduction id=${d.id} の staffType は cast / boy のいずれか`)
      }
    }
    const now = nowJstIso()
    const deductions: Deduction[] = inputs.map((d) => ({
      ...d,
      createdBy: d.createdBy ?? user.username,
      createdAt: d.createdAt ?? now,
      updatedBy: user.username,
      updatedAt: now,
    }))
    const batch = storeCollection('deductions').firestore.batch()
    const existing = await storeCollection('deductions').get()
    existing.docs.forEach((d) => batch.delete(d.ref))
    deductions.forEach((d) =>
      batch.set(storeCollection('deductions').doc(String(d.id)), d),
    )
    await batch.commit()
    res.json(deductions)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/payroll/daily-work/:castId — DailyWork は集計キャッシュ (M14)
// Doc ID = `${castId}_${businessDate}` 形式 (Rev.4.1 §3.13)
payrollRouter.get('/daily-work/:castId', async (req, res) => {
  try {
    const snap = await storeCollection('dailyWork')
      .where('castId', '==', Number(req.params.castId))
      .get()
    const data = snap.docs.map((d) => d.data() as DailyWork)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})
