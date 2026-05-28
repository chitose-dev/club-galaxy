import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser, requireRole } from '../middleware/auth'
import { nowJstIso, todayBusinessDate } from '../lib/businessDate'
import { ApiError, sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import { append, buildEntry } from '../lib/audit'
import type { DailyReport } from '../types'

export const dailyReportsRouter = Router()

// GET /api/daily-reports
dailyReportsRouter.get('/', async (req, res) => {
  try {
    let query = storeCollection('dailyReports').orderBy('businessDate', 'desc')
    if (req.query.businessDate) {
      query = storeCollection('dailyReports')
        .where('businessDate', '==', req.query.businessDate)
        .orderBy('businessDate', 'desc')
    }
    const snap = await query.get()
    res.json(snap.docs.map((d) => d.data() as DailyReport))
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/daily-reports
dailyReportsRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    const now = nowJstIso()
    const businessDate = body.businessDate ?? todayBusinessDate()
    const report: DailyReport = {
      ...body,
      businessDate,
      closedAt: body.closedAt ?? now,
      operator: body.operator ?? user.username,
      createdBy: user.username,
      createdAt: now,
    }
    await storeCollection('dailyReports').doc(businessDate).set(report)
    res.status(201).json(report)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/daily-reports/:businessDate/reopen — レジ締め解除（owner only）
//   - closedAt を null に戻し reopenedAt / reopenedBy / reopenReason を記録
//   - 設計書 §6: 締め後 void が必要な時の通常フロー
//   - 監査ログ (action: 'update') に記録
dailyReportsRouter.post('/:businessDate/reopen', requireRole('owner'), async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const businessDate = String(req.params.businessDate)
    const body = req.body ?? {}
    if (typeof body.reopenReason !== 'string' || body.reopenReason.trim() === '') {
      throwBadRequest('reopenReason は必須（空文字禁止）')
    }
    const ref = storeCollection('dailyReports').doc(businessDate)
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('日報が見つかりません')
    // 既に解除済み（closedAt が null/未設定）の二重 reopen を防ぐ
    const current = snap.data() as DailyReport
    if (!current.closedAt) {
      throw new ApiError(400, 'NOT_CLOSED', '締め済みではないため解除できません')
    }
    const now = nowJstIso()
    const update = {
      // closedAt を null に戻して以降の void / 編集を再び可能に
      closedAt: null,
      reopenedAt: now,
      reopenedBy: user.username,
      reopenReason: body.reopenReason,
    }
    await ref.update(update)
    await append(buildEntry({
      action: 'update',
      performedBy: user.username,
      targetType: 'dailyReport',
      targetId: businessDate,
      payload: { reopenReason: body.reopenReason },
      businessDate,
    }))
    const updated = await ref.get()
    res.json(updated.data() as DailyReport)
  } catch (e) {
    sendError(res, e)
  }
})

// DELETE /api/daily-reports/:businessDate
dailyReportsRouter.delete('/:businessDate', async (req, res) => {
  try {
    getAuthedUser(req)
    const ref = storeCollection('dailyReports').doc(req.params.businessDate)
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('日報が見つかりません')
    await ref.delete()
    res.json({ deleted: req.params.businessDate })
  } catch (e) {
    sendError(res, e)
  }
})
