import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso, todayBusinessDate } from '../lib/businessDate'
import { sendError, throwNotFound } from '../lib/errors'
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
