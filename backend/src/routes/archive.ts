import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwBadRequest } from '../lib/errors'
import { append, buildEntry } from '../lib/audit'

export const archiveRouter = Router()

const ARCHIVABLE_COLLECTIONS = [
  'billingRecords',
  'dailyReports',
  'expenses',
  'advances',
  'attendanceRecords',
  'dailyPayments',
] as const
type ArchivableCollection = (typeof ARCHIVABLE_COLLECTIONS)[number]

// POST /api/archive — businessDate < beforeDate を archivedAt フラグ付与（物理削除しない）
archiveRouter.post('/', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const beforeDate = req.body?.beforeDate
    if (typeof beforeDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
      throwBadRequest('beforeDate は YYYY-MM-DD 形式')
    }
    const now = nowJstIso()
    const result: Record<string, number> = {}

    for (const collection of ARCHIVABLE_COLLECTIONS) {
      const snap = await storeCollection(collection)
        .where('businessDate', '<', beforeDate)
        .get()
      const targets = snap.docs.filter((d) => {
        const data = d.data() as { archivedAt?: string }
        return !data.archivedAt
      })
      if (targets.length === 0) {
        result[collection] = 0
        continue
      }
      // バッチ更新（500 件ずつ）
      let count = 0
      for (let i = 0; i < targets.length; i += 500) {
        const chunk = targets.slice(i, i + 500)
        const batch = storeCollection(collection).firestore.batch()
        for (const doc of chunk) {
          batch.update(doc.ref, { archivedAt: now, archivedBy: user.username })
        }
        await batch.commit()
        count += chunk.length
      }
      result[collection] = count
    }

    await append(
      buildEntry({
        action: 'archive',
        performedBy: user.username,
        targetType: 'archive',
        targetId: beforeDate,
        payload: { beforeDate, result },
      }),
    )
    res.json({ beforeDate, archivedAt: now, result })
  } catch (e) {
    sendError(res, e)
  }
})

// GET /api/archive — ?collection=... で archivedAt あり一覧、未指定なら全コレクション横断
archiveRouter.get('/', async (req, res) => {
  try {
    const target = req.query.collection ? String(req.query.collection) : null
    if (target && !ARCHIVABLE_COLLECTIONS.includes(target as ArchivableCollection)) {
      throwBadRequest(`collection は次のいずれか: ${ARCHIVABLE_COLLECTIONS.join(', ')}`)
    }

    const collectionsToQuery: readonly string[] = target ? [target] : ARCHIVABLE_COLLECTIONS
    const result: Record<string, unknown[]> = {}
    for (const collection of collectionsToQuery) {
      const snap = await storeCollection(collection).get()
      result[collection] = snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .filter((data) => typeof data.archivedAt === 'string')
    }
    res.json(target ? result[target] : result)
  } catch (e) {
    sendError(res, e)
  }
})
