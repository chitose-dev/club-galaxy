import { Router } from 'express'
import { storeCollection } from '../firebase'
import { requireRole, getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwNotFound } from '../lib/errors'
import type { Cast } from '../types'

export const castsRouter = Router()
const col = () => storeCollection('casts')

// GET /api/casts
castsRouter.get('/', async (_req, res) => {
  try {
    const snap = await col().orderBy('id').get()
    const data = snap.docs
      .map((d) => d.data() as Cast)
      .filter((c) => !c.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/casts/:id
castsRouter.get('/:id', async (req, res) => {
  try {
    const doc = await col().doc(String(req.params.id)).get()
    if (!doc.exists) throwNotFound('キャストが見つかりません')
    const data = doc.data() as Cast
    if (data.deletedAt) throwNotFound('キャストが見つかりません')
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// PATCH /api/casts/:id — staff/owner
castsRouter.patch('/:id', requireRole('staff', 'owner'), async (req, res) => {
  try {
    const ref = col().doc(String(req.params.id))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('キャストが見つかりません')
    const user = getAuthedUser(req)
    await ref.update({
      ...(req.body ?? {}),
      updatedBy: user.username,
      updatedAt: nowJstIso(),
    })
    const updated = await ref.get()
    res.json(updated.data())
  } catch (e) {
    sendError(res, e)
  }
})

// PUT /api/casts — replace all (owner only)
castsRouter.put('/', requireRole('owner'), async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const now = nowJstIso()
    const inputs = (req.body ?? []) as Cast[]
    const casts: Cast[] = inputs.map((c) => ({
      ...c,
      createdBy: c.createdBy ?? user.username,
      createdAt: c.createdAt ?? now,
      updatedBy: user.username,
      updatedAt: now,
    }))
    const batch = col().firestore.batch()
    const existing = await col().get()
    existing.docs.forEach((d) => batch.delete(d.ref))
    casts.forEach((c) => batch.set(col().doc(String(c.id)), c))
    await batch.commit()
    res.json(casts)
  } catch (e) {
    sendError(res, e)
  }
})
