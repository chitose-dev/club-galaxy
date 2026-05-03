import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso, todayBusinessDate } from '../lib/businessDate'
import { sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import { append, buildEntry } from '../lib/audit'
import type { AdvancePayment } from '../types'

export const advancesRouter = Router()
const col = () => storeCollection('advances')

// GET /api/advances — ?castId or ?month=YYYY-MM
advancesRouter.get('/', async (req, res) => {
  try {
    let query = col().orderBy('businessDate', 'desc') as FirebaseFirestore.Query
    if (req.query.castId) {
      query = col()
        .where('castId', '==', Number(req.query.castId))
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
      .map((d) => d.data() as AdvancePayment)
      .filter((a) => !a.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/advances
advancesRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.id !== 'number') throwBadRequest('id が必要です')
    if (typeof body.castId !== 'number') throwBadRequest('castId が必要です')
    if (typeof body.amount !== 'number') throwBadRequest('amount が必要です')
    const now = nowJstIso()
    const advance: AdvancePayment = {
      ...body,
      businessDate: body.businessDate ?? todayBusinessDate(),
      timestamp: body.timestamp ?? now,
      createdBy: user.username,
      createdAt: now,
    } as AdvancePayment
    await col().doc(String(advance.id)).set(advance)
    await append(
      buildEntry({
        action: 'create',
        performedBy: user.username,
        targetType: 'advances',
        targetId: String(advance.id),
        payload: { collection: 'advances', after: advance },
      }),
    )
    res.status(201).json(advance)
  } catch (e) {
    sendError(res, e)
  }
})

// DELETE /api/advances/:id — soft-delete
advancesRouter.delete('/:id', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const ref = col().doc(String(req.params.id))
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('前借りが見つかりません')
    const before = snap.data() as AdvancePayment
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
        targetType: 'advances',
        targetId: String(before.id),
        payload: { collection: 'advances', before, after: { ...before, ...update } },
      }),
    )
    res.json({ deleted: req.params.id })
  } catch (e) {
    sendError(res, e)
  }
})
