import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwNotFound } from '../lib/errors'
import type { BottleKeep } from '../types'

export const bottlesRouter = Router()
const col = () => storeCollection('bottleKeeps')

// GET /api/bottles
bottlesRouter.get('/', async (_req, res) => {
  try {
    const snap = await col().orderBy('id').get()
    const data = snap.docs
      .map((d) => d.data() as BottleKeep)
      .filter((b) => !b.deletedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/bottles
bottlesRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const now = nowJstIso()
    const keep = {
      ...(req.body ?? {}),
      createdBy: user.username,
      createdAt: now,
    } as BottleKeep
    await col().doc(String(keep.id)).set(keep)
    res.status(201).json(keep)
  } catch (e) {
    sendError(res, e)
  }
})

// PATCH /api/bottles/:id
bottlesRouter.patch('/:id', async (req, res) => {
  try {
    const ref = col().doc(String(req.params.id))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('ボトルが見つかりません')
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

// DELETE /api/bottles/:id — soft-delete (Rev.4.1 BottleKeep extends SoftDeletable)
bottlesRouter.delete('/:id', async (req, res) => {
  try {
    const ref = col().doc(String(req.params.id))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('ボトルが見つかりません')
    const user = getAuthedUser(req)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    await ref.update({
      deletedAt: nowJstIso(),
      deletedBy: user.username,
      ...(reason ? { deleteReason: reason } : {}),
    })
    res.json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
})
