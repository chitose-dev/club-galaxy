import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso, todayBusinessDate } from '../lib/businessDate'
import { sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import { append, buildEntry } from '../lib/audit'
import type { Expense } from '../types'

export const expensesRouter = Router()
const col = () => storeCollection('expenses')

// GET /api/expenses — ?businessDate or ?month=YYYY-MM
expensesRouter.get('/', async (req, res) => {
  try {
    let query = col().orderBy('businessDate', 'desc') as FirebaseFirestore.Query
    if (req.query.businessDate) {
      query = col()
        .where('businessDate', '==', String(req.query.businessDate))
        .orderBy('businessDate', 'desc')
    } else if (req.query.month) {
      const month = String(req.query.month)
      if (!/^\d{4}-\d{2}$/.test(month)) throwBadRequest('month は YYYY-MM 形式')
      query = col()
        .where('businessDate', '>=', `${month}-01`)
        .where('businessDate', '<=', `${month}-31`)
        .orderBy('businessDate', 'desc')
    }
    const snap = await query.get()
    const data = snap.docs
      .map((d) => d.data() as Expense)
      .filter((e) => !e.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/expenses
expensesRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.id !== 'number') throwBadRequest('id が必要です')
    if (typeof body.amount !== 'number') throwBadRequest('amount が必要です')
    const now = nowJstIso()
    const expense: Expense = {
      ...body,
      businessDate: body.businessDate ?? todayBusinessDate(),
      timestamp: body.timestamp ?? now,
      createdBy: user.username,
      createdAt: now,
    } as Expense
    await col().doc(String(expense.id)).set(expense)
    await append(
      buildEntry({
        action: 'create',
        performedBy: user.username,
        targetType: 'expenses',
        targetId: String(expense.id),
        payload: { collection: 'expenses', after: expense },
      }),
    )
    res.status(201).json(expense)
  } catch (e) {
    sendError(res, e)
  }
})

// DELETE /api/expenses/:id — soft-delete
expensesRouter.delete('/:id', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const ref = col().doc(String(req.params.id))
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('経費が見つかりません')
    const before = snap.data() as Expense
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
    const now = nowJstIso()
    const update = {
      deletedAt: now,
      deletedBy: user.username,
      deleteReason: reason,
    }
    await ref.update(update)
    await append(
      buildEntry({
        action: 'delete',
        performedBy: user.username,
        targetType: 'expenses',
        targetId: String(before.id),
        payload: { collection: 'expenses', before, after: { ...before, ...update } },
        ...(reason ? {} : {}),
      }),
    )
    res.json({ deleted: req.params.id })
  } catch (e) {
    sendError(res, e)
  }
})
