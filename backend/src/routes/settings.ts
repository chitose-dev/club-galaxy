import { Router } from 'express'
import { storeDoc } from '../firebase'
import { requireRole, getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError } from '../lib/errors'
import type { StoreSettings } from '../types'

export const settingsRouter = Router()

const DEFAULT_SETTINGS: Partial<StoreSettings> = {
  // 税・手数料
  taxRate: 0.2,
  consumptionTaxRate: 0.1,
  cardFeeRate: 0.1,
  cardProcessingFeeRate: 0.035,
  // レジ
  initialCash: 100_000,
  // 給与
  closingDay: 15,
  payrollDeductionRate: 0.1,
  dailyPayDeductionRate: 0.1,
  looseTimeMinutes: 15,
  payUnitMinutes: 15,
  // 法定源泉ガード（M25）
  legalWithholdingConfirmed: false,
  // 営業日
  businessDayCutoffHour: 5,
  // 店舗情報
  storeName: 'CLUB GALAXY',
  storeAddress: '',
  storePhone: '',
  invoiceNumber: 'T5390001005970',
  // 延長料金（M22）
  extensionPricingMode: 'per_guest_set',
  extensionMinuteOptions: [30, 60],
  // 中間チェック票
  checkTicketAutoPrintMinutes: 50,
  // セッション
  sessionIdleMinutes: 30,
  jwtExpiresHours: 12,
  heartbeatIntervalMinutes: 5,
  // PIN ロック（クロウ R3 段階ロック 5/30/24）
  pinLockStage1Failures: 5,
  pinLockStage1Minutes: 5,
  pinLockStage2Failures: 10,
  pinLockStage2Minutes: 30,
  pinLockStage3Failures: 15,
  pinLockStage3Hours: 24,
  // ボーナス上限（M7）
  maxBonusRatePerOrder: 0.3,
  // シャンパンセッパン（M6）
  champagneSplitThreshold: 20_000,
}

// GET /api/settings
settingsRouter.get('/', async (_req, res) => {
  try {
    const doc = await storeDoc().get()
    const stored = doc.exists ? (doc.data() ?? {}) : {}
    res.json({ ...DEFAULT_SETTINGS, ...stored })
  } catch (e) {
    sendError(res, e)
  }
})

// PUT /api/settings
settingsRouter.put('/', requireRole('owner'), async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const update = {
      ...(req.body ?? {}),
      updatedBy: user.username,
      updatedAt: nowJstIso(),
    }
    await storeDoc().set(update, { merge: true })
    res.json(update)
  } catch (e) {
    sendError(res, e)
  }
})
