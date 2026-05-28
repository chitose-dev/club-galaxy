import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { getBusinessDate, nowJstIso } from '../lib/businessDate'
import { ApiError, sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import { append, buildEntry } from '../lib/audit'
import type { AttendanceRecord } from '../types'

export const attendanceRouter = Router()
const col = () => storeCollection('attendanceRecords')

const LOOSE_TIME_MINUTES = 15
const PAY_UNIT_MINUTES = 15
const MAX_SHIFT_MINUTES = 24 * 60

function calcPaidMinutes(workMinutes: number): number {
  if (workMinutes <= 0) return 0
  // ルーズタイム 15 分（短時間切捨て） + 15 分単位切上
  const adjusted = workMinutes - LOOSE_TIME_MINUTES
  if (adjusted <= 0) return 0
  return Math.ceil(adjusted / PAY_UNIT_MINUTES) * PAY_UNIT_MINUTES
}

// GET /api/attendance — カーソルページネーション
attendanceRouter.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Math.max(1, parseInt(String(req.query.limit), 10)) : 100
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined

    let query = col().orderBy('id') as FirebaseFirestore.Query
    if (req.query.businessDate) {
      query = col()
        .where('businessDate', '==', String(req.query.businessDate))
        .orderBy('id')
    }
    if (req.query.staffId) {
      query = query.where('staffId', '==', Number(req.query.staffId))
    }
    if (cursor) {
      const cursorDoc = await col().doc(cursor).get()
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc)
      }
    }
    query = query.limit(limit)
    const snap = await query.get()
    const data = snap.docs.map((d) => d.data() as AttendanceRecord)
    const nextCursor =
      snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null
    res.json({ data, nextCursor })
  } catch (e) {
    sendError(res, e)
  }
})

// POST /api/attendance — 出勤打刻
attendanceRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.id !== 'number') throwBadRequest('id が必要です')
    if (typeof body.staffId !== 'number') throwBadRequest('staffId が必要です')
    if (typeof body.staffName !== 'string') throwBadRequest('staffName が必要です')
    if (body.staffType !== 'cast' && body.staffType !== 'boy') {
      throwBadRequest('staffType は cast / boy のいずれか')
    }
    if (typeof body.clockIn !== 'string') throwBadRequest('clockIn (ISO 8601) が必要です')

    // 同一 staffId の clockOut == null 未終了レコードを 409
    const openSnap = await col()
      .where('staffId', '==', body.staffId)
      .where('clockOut', '==', null)
      .get()
    if (!openSnap.empty) {
      throw new ApiError(409, 'CLOCK_IN_OPEN', '未退勤の出勤レコードがあります')
    }

    const now = nowJstIso()
    const businessDate = getBusinessDate(body.clockIn)
    const breakMinutes = typeof body.breakMinutes === 'number' ? body.breakMinutes : 0
    const record: AttendanceRecord = {
      id: body.id,
      staffId: body.staffId,
      staffName: body.staffName,
      staffType: body.staffType,
      businessDate,
      clockIn: body.clockIn,
      clockOut: null,
      ...(body.scheduledClockIn !== undefined ? { scheduledClockIn: body.scheduledClockIn } : {}),
      breakMinutes,
      // clockIn 時点では workMinutes 計算不可。PATCH (clockOut) 時に正しい値で上書きされる
      workMinutes: 0,
      paidMinutes: 0,
      ...(body.autoCreated ? { autoCreated: true } : {}),
      createdBy: user.username,
      createdAt: now,
    }
    await col().doc(String(record.id)).set(record)
    await append(
      buildEntry({
        action: 'create',
        performedBy: user.username,
        targetType: 'attendanceRecords',
        targetId: String(record.id),
        payload: { collection: 'attendanceRecords', after: record },
      }),
    )
    res.status(201).json(record)
  } catch (e) {
    sendError(res, e)
  }
})

// PATCH /api/attendance/:id — 退勤打刻
attendanceRouter.patch('/:id', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = req.body ?? {}
    if (typeof body.clockOut !== 'string') throwBadRequest('clockOut (ISO 8601) が必要です')

    const ref = col().doc(String(req.params.id))
    const snap = await ref.get()
    if (!snap.exists) throwNotFound('出勤レコードが見つかりません')
    const before = snap.data() as AttendanceRecord

    const clockInMs = new Date(before.clockIn).getTime()
    const clockOutMs = new Date(body.clockOut).getTime()
    if (Number.isNaN(clockOutMs)) throwBadRequest('clockOut が不正な日時です')
    if (clockOutMs < clockInMs) throwBadRequest('clockOut は clockIn より後である必要があります')
    const diffMin = Math.floor((clockOutMs - clockInMs) / 60000)
    if (diffMin > MAX_SHIFT_MINUTES) throwBadRequest('勤務時間が 24 時間を超えています')

    const breakMinutes = typeof body.breakMinutes === 'number' ? body.breakMinutes : before.breakMinutes
    const workMinutes = Math.max(0, diffMin - breakMinutes)
    const paidMinutes = calcPaidMinutes(workMinutes)
    const now = nowJstIso()

    const after: AttendanceRecord = {
      ...before,
      clockOut: body.clockOut,
      breakMinutes,
      workMinutes,
      paidMinutes,
      updatedBy: user.username,
      updatedAt: now,
    }
    await ref.set(after)
    await append(
      buildEntry({
        action: 'update',
        performedBy: user.username,
        targetType: 'attendanceRecords',
        targetId: String(after.id),
        payload: { collection: 'attendanceRecords', before, after },
      }),
    )
    res.json(after)
  } catch (e) {
    sendError(res, e)
  }
})
