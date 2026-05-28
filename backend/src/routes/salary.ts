import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { sendError } from '../lib/errors'
import type { DailyWork, DailyPayment, Deduction, AttendanceRecord } from '../types'

export const salaryRouter = Router()

// GET /api/salary/me — JWT sub 由来のみ参照（横移動防止）
salaryRouter.get('/me', async (req, res) => {
  try {
    const user = getAuthedUser(req)

    if (user.role === 'cast') {
      if (typeof user.castId !== 'number') {
        res.json({ role: 'cast', dailyWork: [], dailyPayments: [], deductions: [] })
        return
      }
      const castId = user.castId
      const [dwSnap, dpSnap, dedSnap] = await Promise.all([
        storeCollection('dailyWork').where('castId', '==', castId).get(),
        storeCollection('dailyPayments').where('castId', '==', castId).get(),
        storeCollection('deductions').where('castId', '==', castId).get(),
      ])
      const dailyWork = dwSnap.docs.map((d) => d.data() as DailyWork)
      const dailyPayments = dpSnap.docs
        .map((d) => d.data() as DailyPayment)
        .filter((p) => !p.deletedAt)
      const deductions = dedSnap.docs
        .map((d) => d.data() as Deduction)
        .filter((d) => !d.deletedAt)
      res.json({ role: 'cast', castId, dailyWork, dailyPayments, deductions })
      return
    }

    if (user.role === 'staff') {
      const [dpSnap, attSnap] = await Promise.all([
        storeCollection('dailyPayments').where('castName', '==', user.username).get(),
        storeCollection('attendanceRecords').where('staffName', '==', user.username).get(),
      ])
      const dailyPayments = dpSnap.docs
        .map((d) => d.data() as DailyPayment)
        .filter((p) => !p.deletedAt)
      const attendanceRecords = attSnap.docs.map((d) => d.data() as AttendanceRecord)
      res.json({
        role: 'staff',
        username: user.username,
        dailyPayments,
        attendanceRecords,
      })
      return
    }

    // owner: 自身は salary 概念なし（空配列）
    res.json({
      role: 'owner',
      username: user.username,
      dailyWork: [],
      dailyPayments: [],
      deductions: [],
      attendanceRecords: [],
    })
  } catch (e) {
    sendError(res, e)
  }
})
