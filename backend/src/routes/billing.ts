import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser, requireRole } from '../middleware/auth'
import { nowJstIso, todayBusinessDate } from '../lib/businessDate'
import { sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import type { BillingRecord, DiscountLog } from '../types'

export const billingRouter = Router()

// GET /api/billing/records
//   - クロウ R5 反映: ?includeVoided=true でデフォルト除外を解除
//   - M21 反映: archivedAt は常に除外
billingRouter.get('/records', async (req, res) => {
  try {
    const includeVoided = req.query.includeVoided === 'true'
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined
    let query = storeCollection('billingRecords').orderBy('completedAt', 'desc')
    if (req.query.businessDate) {
      query = storeCollection('billingRecords')
        .where('businessDate', '==', req.query.businessDate)
        .orderBy('completedAt', 'desc')
    }
    if (limit && limit > 0) {
      query = query.limit(limit) as typeof query
    }
    const snap = await query.get()
    const data = snap.docs
      .map((d) => d.data() as BillingRecord)
      .filter((r) => !r.archivedAt)
      .filter((r) => includeVoided || !r.voidedAt)
    res.json(data)
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/billing/records
// 暫定実装: body をそのまま受け、audit/businessDate stamp のみ
// TODO P1: receiptNumber アトミック採番 (M17), nominatedCastIds/castSnapshot/receiptSnapshot 算出,
//          dailyAggregates 同梱更新 (M15), reissueParentId チェーン遡及, primaryBillingId/mergedBillingIds
billingRouter.post('/records', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.id !== 'string' && typeof body.id !== 'number') {
      throwBadRequest('id が必要です')
    }
    const now = nowJstIso()
    const record = {
      ...body,
      businessDate: body.businessDate ?? todayBusinessDate(),
      completedAt: body.completedAt ?? now,
      createdBy: user.username,
      createdAt: now,
    } as BillingRecord
    await storeCollection('billingRecords').doc(String(record.id)).set(record)
    res.status(201).json(record)
  } catch (e) {
    sendError(res, e)
  }
})

// PATCH /api/billing/records/:id — 未収管理（owner only）
// 更新可能フィールドは uncollectedStatus / uncollectedReason / writtenOffAt / settledOff のみ。
// 売上等の他フィールドは取り違え防止のため受け付けない（whitelist 方式）。
billingRouter.patch('/records/:id', requireRole('owner'), async (req, res) => {
  try {
    const id = String(req.params.id)
    const ref = storeCollection('billingRecords').doc(id)
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('BillingRecord が見つかりません')
    const body = req.body ?? {}
    const update: Record<string, unknown> = {}
    if (body.uncollectedStatus !== undefined) {
      const v = body.uncollectedStatus
      if (v !== 'pending' && v !== 'written_off' && v !== 'recovered') {
        throwBadRequest('uncollectedStatus は pending / written_off / recovered のいずれか')
      }
      update.uncollectedStatus = v
    }
    if (body.uncollectedReason !== undefined) {
      if (typeof body.uncollectedReason !== 'string') {
        throwBadRequest('uncollectedReason は文字列で指定してください')
      }
      update.uncollectedReason = body.uncollectedReason
    }
    if (body.writtenOffAt !== undefined) {
      if (typeof body.writtenOffAt !== 'string') {
        throwBadRequest('writtenOffAt は ISO 文字列で指定してください')
      }
      update.writtenOffAt = body.writtenOffAt
    }
    if (body.settledOff !== undefined) {
      if (typeof body.settledOff !== 'boolean') {
        throwBadRequest('settledOff は boolean で指定してください')
      }
      update.settledOff = body.settledOff
    }
    if (Object.keys(update).length === 0) {
      throwBadRequest('更新可能なフィールドが指定されていません')
    }
    const user = getAuthedUser(req)
    update.updatedBy = user.username
    update.updatedAt = nowJstIso()
    await ref.update(update)
    const updated = await ref.get()
    res.json(updated.data() as BillingRecord)
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/billing/discounts
billingRouter.get('/discounts', async (req, res) => {
  try {
    let query = storeCollection('discountLogs').orderBy('id')
    if (req.query.businessDate) {
      query = storeCollection('discountLogs')
        .where('businessDate', '==', req.query.businessDate)
        .orderBy('id')
    }
    const snap = await query.get()
    res.json(snap.docs.map((d) => d.data() as DiscountLog))
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/billing/discounts — append-only
// (firestore.rules で update/delete を全拒否する予定 — Rev.4.1 §3.12)
billingRouter.post('/discounts', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.id !== 'string' && typeof body.id !== 'number') {
      throwBadRequest('id が必要です')
    }
    if (typeof body.reason !== 'string' || body.reason.trim() === '') {
      throwBadRequest('reason は必須（空文字禁止）')
    }
    const now = nowJstIso()
    const log = {
      ...body,
      businessDate: body.businessDate ?? todayBusinessDate(),
      timestamp: body.timestamp ?? now,
      operator: body.operator ?? user.username,
      createdBy: user.username,
      createdAt: now,
    } as DiscountLog
    await storeCollection('discountLogs').doc(String(log.id)).set(log)
    res.status(201).json(log)
  } catch (e) {
    sendError(res, e)
  }
})
