import { Router } from 'express'
import { storeCollection } from '../firebase'
import { requireRole, getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwBadRequest, throwNotFound } from '../lib/errors'
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

// POST /api/casts — owner only、新規キャスト作成（id は MAX(id)+1 で採番）
castsRouter.post('/', requireRole('owner'), async (req, res) => {
  try {
    const body = req.body ?? {}
    if (typeof body.name !== 'string' || !body.name) {
      throwBadRequest('name が必要です')
    }
    if (typeof body.hourlyRate !== 'number' || body.hourlyRate <= 0) {
      throwBadRequest('hourlyRate は正の数値で指定してください')
    }
    if (typeof body.guaranteeRate !== 'number' || body.guaranteeRate < 0 || body.guaranteeRate > 1) {
      throwBadRequest('guaranteeRate は 0.0〜1.0 で指定してください')
    }
    const user = getAuthedUser(req)
    const now = nowJstIso()
    // 採番: 既存 cast の最大 id + 1（オーナー1名運用前提でレースは許容）
    const snap = await col().get()
    const maxId = snap.docs.reduce((m, d) => Math.max(m, (d.data() as Cast).id ?? 0), 0)
    const id = maxId + 1
    const cast: Cast = {
      id,
      name: body.name,
      hourlyRate: body.hourlyRate,
      guaranteeRate: body.guaranteeRate,
      backRates: typeof body.backRates === 'object' && body.backRates !== null ? body.backRates : {},
      active: typeof body.active === 'boolean' ? body.active : true,
      ...(typeof body.realName === 'string' && body.realName ? { realName: body.realName } : {}),
      ...(typeof body.address === 'string' && body.address ? { address: body.address } : {}),
      createdBy: user.username,
      createdAt: now,
    }
    await col().doc(String(id)).set(cast)
    res.status(201).json(cast)
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
