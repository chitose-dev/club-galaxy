/**
 * CLUB GALAXY バックエンド型定義（Rev.4.1 §3 準拠）
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// 共通基盤
// ─────────────────────────────────────────────────────────────

export interface AuditFields {
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

export interface SoftDeletable {
  deletedAt?: string
  deletedBy?: string
  deleteReason?: string
}

// ─────────────────────────────────────────────────────────────
// Role
// ─────────────────────────────────────────────────────────────

export type Role = 'owner' | 'staff' | 'cast'
export type StaffType = 'cast' | 'boy'

// ─────────────────────────────────────────────────────────────
// BackType (17 種、フロント mock.ts と完全一致)
// ─────────────────────────────────────────────────────────────

export type BackType =
  | 'FD' | '本D'
  | 'Fカク' | '本カク' | '本カクW'
  | 'Fショ' | '本ショ'
  | 'FP' | '本P'
  | 'FB' | '本B'
  | '同伴' | '本指名' | '場内指名'
  | 'ボトルバック' | 'ヘルプ' | 'その他'

export const PERCENT_BACK_TYPES: readonly BackType[] = ['ボトルバック'] as const

// ─────────────────────────────────────────────────────────────
// UserAccount (判別ユニオン + Zod、M12)
// ─────────────────────────────────────────────────────────────

const UserBaseSchema = z.object({
  username: z.string().min(1),
  pinHash: z.string(),
  displayName: z.string().min(1),
  failedAttempts: z.number().int().min(0).default(0),
  lockedUntil: z.string().nullable().optional(),
  pinUpdatedAt: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().optional(),
  deletedBy: z.string().optional(),
})

export const UserAccountSchema = z.discriminatedUnion('role', [
  UserBaseSchema.extend({ role: z.literal('owner') }),
  UserBaseSchema.extend({
    role: z.literal('staff'),
    hourlyRate: z.number().int().positive(),
  }),
  UserBaseSchema.extend({
    role: z.literal('cast'),
    castId: z.number().int().positive(),
  }),
])
export type UserAccount = z.infer<typeof UserAccountSchema>

// ─────────────────────────────────────────────────────────────
// Session (M19、クロウ R2)
// ─────────────────────────────────────────────────────────────

export interface SessionDoc {
  jti: string
  username: string
  role: Role
  castId?: number
  storeId: string
  createdAt: string
  lastActivityAt: string
  expiresAt: string
  revoked?: boolean
}

// ─────────────────────────────────────────────────────────────
// Cast
// ─────────────────────────────────────────────────────────────

export interface Cast extends AuditFields, SoftDeletable {
  id: number
  name: string
  realName?: string
  address?: string
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>
  guaranteeRate: number
  active: boolean
  onBreak?: boolean
  lastAssignedAt?: string
  /** ISSUE-007: 直近の出勤打刻時刻 (ルーズタイム判定用) */
  lastClockInAt?: string
}

// ─────────────────────────────────────────────────────────────
// OrderEmbedded (クロウ R1: id 必須)
// ─────────────────────────────────────────────────────────────

export interface OrderEmbedded {
  /** ★ Rev.4.1 (クロウ R1): 注文確定 transaction 内で連番採番、Table.orders 内で一意 */
  id: number
  menuItem: {
    id: number
    name: string
    price: number
    cost: number
    castBack: number
    category: 'guest' | 'cast'
    subcategory: string
    backType?: BackType
  }
  quantity: number
  /** 売上帰属先キャスト */
  castName?: string
  /** 追補03 R18: ボーナス加算先（M7、`maxBonusRatePerOrder=0.3` 上限ガード） */
  bonusCastName?: string
  bonusAmount?: number
  /** ★ Rev.4.1 (M5): シャンパンセッパン用スナップショット。注文時起点で焼く */
  splitCastIds?: number[]
  isExtension?: boolean
  addedAt: string
  addedBy: string
}

// ─────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────

export type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert' | 'settled'

export interface ExtensionEntry {
  id: number
  minutes: 30 | 60
  timestamp: string
  /** 延長時の指名キャスト（バック帰属、M23 で本指名バック継続） */
  nominatedCastName?: string
  /** 連動して追加した orderItem ID 群（取消時に同時削除） */
  orderItemIds: string[]
}

export interface Table extends AuditFields {
  id: number
  number: string
  status: TableStatus
  guestCount: number
  startTime: string | null
  /** YYYY-MM-DD（サーバーが startTime から焼く） */
  businessDate: string | null
  /** 動的: 現在対応中のキャスト名 */
  assignedCasts: string[]
  /**
   * 本指名担当（固定、複数可）。
   * - 売上・本指名バックはここに帰属
   * - 複数指定時はシャンパン等のセッパン対象（calcChampagneSplit）
   */
  mainNominationCastNames: string[]
  isDouhan?: boolean
  isBanaiShimei?: boolean
  setCount: number
  orders: OrderEmbedded[]
  checkTicketPrintedAt?: string
  setDiscountPerSet?: number
  timeAdjustmentMinutes?: number
  extensionHistory?: ExtensionEntry[]
}

// ─────────────────────────────────────────────────────────────
// MenuCategory (M10)
// ─────────────────────────────────────────────────────────────

export interface MenuCategory extends AuditFields {
  kind: 'guest' | 'cast'
  id: string
  label: string
  order: number
  hidden?: boolean
  custom?: boolean
  /** ★ Rev.4.1 (M10): ボトルキープ可否。シャンパン系既定 false */
  allowsBottleKeep: boolean
}

// ─────────────────────────────────────────────────────────────
// GuestMenuItem / CastMenuItem
// ─────────────────────────────────────────────────────────────

export interface GuestMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'guest'
  subcategory: string
  archived?: boolean
}

export interface CastMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'cast'
  subcategory: string
  backType: BackType
  archived?: boolean
}

// ─────────────────────────────────────────────────────────────
// SetPrice / ChargeItem
// ─────────────────────────────────────────────────────────────

export interface SetPrice extends AuditFields {
  id: string
  label: string
  price: number
  cost: number
  startHour: number
}

export interface ChargeItem extends AuditFields {
  id: string
  label: string
  price: number
  cost: number
}

// ─────────────────────────────────────────────────────────────
// BillingRecord / ReceiptSnapshot (M1〜M4 命名統一・shadow 合算・再発行)
// ─────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'mixed'

export interface ReceiptSnapshot {
  receiptNumber: number
  receiptName: string
  receiptPurpose: string
  subtotal: number
  setFee: number
  /** ★ 旧 `tax`、内部識別子のみ統一（UI 表示は「TAX」維持） */
  serviceCharge: number
  consumptionTax: number
  discount: number
  orders: {
    menuItem: { id: number; name: string; price: number }
    quantity: number
    castName?: string
  }[]
  startTime: string | null
  /** 'フリー' | '本指名 あいり, みく + 同伴' 等 */
  nominationLabel: string
  /** ★ CLUB GALAXY を冒頭表記 */
  storeNameSnapshot: string
  storeAddressSnapshot: string
  storePhoneSnapshot: string
  invoiceNumberSnapshot: string
  stampRequired: boolean
  completedAt: string
  /** 合算会計時の卓番号リスト */
  mergedTables?: string[]
  /** 割り勘人数（1 = 通常会計） */
  splitCount?: number
}

export interface BillingRecord extends AuditFields, SoftDeletable {
  id: string
  storeId: string
  /** metadata/billing.nextReceiptNumber tx 内採番（M17） */
  receiptNumber: number
  tableNumber: string

  /** ★ Rev.4.1 命名統一（M1） */
  subtotalBeforeTax: number
  /** ★ 旧 `taxAmount`、UI 表記は「TAX」維持 */
  serviceChargeAmount: number
  consumptionTaxAmount: number
  total: number

  setFee: number
  drinkSubtotal: number
  tableDiscountAmount: number
  specialDiscountAmount: number
  specialDiscountReason?: string
  cardFee?: number
  cardProcessingCost?: number
  paymentMethod: PaymentMethod
  cashAmount?: number
  cardAmount?: number

  completedAt: string
  /** YYYY-MM-DD（サーバー算出） */
  businessDate: string

  /** ★ Rev.4.1 複数本指名（M2） */
  nominatedCastIds: number[]
  /** 税理士提出に realName 必要 */
  castSnapshot: { id: number; name: string; realName?: string }[]

  receiptSnapshot: ReceiptSnapshot
  receiptIssued: boolean

  /** ★ Rev.4.1 再発行（M3）— 上限 20 で打ち切り */
  reissueParentId?: string
  /** 1〜20。表示は `${receiptNumber}-${reissueIndex}` */
  reissueIndex?: number

  /** ★ Rev.4.1 shadow 合算（M4） */
  primaryBillingId?: string
  mergedBillingIds?: string[]
  mergedFromTableNumbers?: string[]

  /** void / 取消 */
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  refundAmount?: number
  /** 差し替え先 BillingRecord.id */
  replacedBy?: string

  /** ★ Rev.4.1 アーカイブ（M21、物理削除なし、再アクティブ化なし） */
  archivedAt?: string
}

// ─────────────────────────────────────────────────────────────
// DiscountLog (append-only、firestore.rules で update/delete 全拒否)
// ─────────────────────────────────────────────────────────────

export type DiscountReasonCategory =
  | '端数カット' | 'VIP値引' | '店長承認' | 'クーポン' | 'その他'

export interface DiscountLog extends AuditFields {
  id: string
  storeId: string
  billingRecordId?: string
  tableNumber: string
  originalTotal: number
  discountAmount: number
  finalTotal: number
  reason: string
  reasonCategory?: DiscountReasonCategory
  operator: string
  operatorRole: 'owner' | 'staff'
  businessDate: string
  timestamp: string
}

// ─────────────────────────────────────────────────────────────
// DailyWork (集計キャッシュ、上書き保存 M14)
// ─────────────────────────────────────────────────────────────

export interface DailyWork extends AuditFields {
  /** Doc ID = `${castId}_${businessDate}` */
  id: string
  castId: number
  businessDate: string
  /** AttendanceRecord 集計 */
  workMinutes: number
  /** calcPaidMinutes 適用後 */
  paidMinutes: number
  hourlyPay: number
  /** 件数（本指名 1, FD 3 等） */
  backs: Partial<Record<BackType, number>>
  /** 円換算合計 */
  backTotal: number
  /** OrderItem.bonusAmount の自分宛て合計 */
  bonusTotal: number
  /** 個人小計売上（本指名複数の均等割後） */
  sales: number
}

// ─────────────────────────────────────────────────────────────
// DailyPayment / Deduction / AdvancePayment
// ─────────────────────────────────────────────────────────────

export interface DailyPayment extends AuditFields, SoftDeletable {
  id: number
  /** ボーイは負数等で一意化 */
  castId: number
  castName: string
  /** 額面（10% 控除前） */
  amount: number
  /** 10% 控除後の手渡し額（サーバー計算） */
  amountAfterDeduction: number
  source: 'register' | 'transfer'
  staffType: StaffType
  businessDate: string
  timestamp: string
}

export interface Deduction extends AuditFields, SoftDeletable {
  id: number
  castId: number
  amount: number
  reason: string
  source: 'register' | 'transfer'
  staffType: StaffType
  businessDate: string
}

export interface AdvancePayment extends AuditFields, SoftDeletable {
  id: number
  castId: number
  castName: string
  amount: number
  source: 'register' | 'transfer'
  reason: string
  businessDate: string
  timestamp: string
}

// ─────────────────────────────────────────────────────────────
// Expense
// ─────────────────────────────────────────────────────────────

export type ExpenseCategory = '仕入れ（酒等）' | '税金' | '雑費' | string

export interface Expense extends AuditFields, SoftDeletable {
  id: number
  amount: number
  category: ExpenseCategory
  note: string
  source: 'register' | 'transfer'
  businessDate: string
  timestamp: string
}

// ─────────────────────────────────────────────────────────────
// AttendanceRecord (ISO 8601 化)
// ─────────────────────────────────────────────────────────────

export interface AttendanceRecord extends AuditFields {
  id: number
  staffId: number
  /** スナップショット */
  staffName: string
  staffType: StaffType
  /** YYYY-MM-DD（clockIn の businessDate で固定、clockOut が翌日でも不変） */
  businessDate: string
  /** ISO 8601 full timestamp */
  clockIn: string
  /** ISO 8601（翌 3:00 等もOK） */
  clockOut: string | null
  scheduledClockIn?: string | null
  breakMinutes: number
  /** サーバー算出 = (clockOut - clockIn) - breakMinutes */
  workMinutes: number
  /** ルーズタイム + 15 分単位切上後 */
  paidMinutes: number
  /** 自動打刻の場合 true (AttendanceSchedule から生成) */
  autoCreated?: boolean
}

// ─────────────────────────────────────────────────────────────
// AttendanceSchedule (M11)
// ─────────────────────────────────────────────────────────────

export interface AttendanceSchedule extends AuditFields {
  id: number
  staffId: number
  staffName: string
  staffType: StaffType
  businessDate: string
  /** ISO 8601 full timestamp（HH:MM ではない） */
  scheduledClockIn: string
  processed?: boolean
  processedAt?: string
  /** 紐付く AttendanceRecord.id */
  processedRecordId?: number
}

// ─────────────────────────────────────────────────────────────
// CastMoveLog
// ─────────────────────────────────────────────────────────────

export interface CastMoveLog extends AuditFields {
  id: number
  castName: string
  /** null = 待機から */
  fromTableId: number | null
  /** null = 待機戻し */
  toTableId: number | null
  timestamp: string
  businessDate: string
  /** 元の卓に何分対応していたか */
  durationMinutes?: number
}

// ─────────────────────────────────────────────────────────────
// DailyReport
// ─────────────────────────────────────────────────────────────

export interface DailyReport extends AuditFields {
  /** Doc ID */
  businessDate: string
  initialCash: number
  cashSales: number
  cardSales: number
  totalSales: number
  dailyPayTotal: number
  cashExpenseTotal: number
  cashAdvanceTotal: number
  theoreticalCash: number
  actualCash: number
  /** actual - theoretical */
  difference: number
  note: string
  operator: string
  closedAt: string
  reopenedAt?: string
  reopenedBy?: string
  reopenReason?: string
}

// ─────────────────────────────────────────────────────────────
// BottleKeep
// ─────────────────────────────────────────────────────────────

export interface BottleKeep extends AuditFields, SoftDeletable {
  id: number
  bottleName: string
  /** 0-100 (%) */
  remaining: number
  storageLocation: string
  customerName: string
  tableNumber?: string
  expiresAt?: string
  /** 元 OrderItem との紐付き（シャンパン等のセッパン対象注文だった場合） */
  sourceOrderId?: string
}

// ─────────────────────────────────────────────────────────────
// StoreSettings (singleton)
// ─────────────────────────────────────────────────────────────

export interface StoreSettings extends AuditFields {
  // 税・手数料
  taxRate: number                     // TAX (サービス料) default 0.20
  consumptionTaxRate: number          // 消費税 default 0.10 (内税)
  cardFeeRate: number                 // 客向けカード手数料 default 0.10
  cardProcessingFeeRate: number       // 店舗→決済会社 default 0.035

  // レジ
  initialCash: number                 // default 100000

  // 給与
  closingDay: number                  // 締め日 default 15
  payrollDeductionRate: number        // default 0.10
  dailyPayDeductionRate: number       // default 0.10
  looseTimeMinutes: number            // ルーズタイム default 15
  payUnitMinutes: number              // 給与単位 default 15

  // ★ 法定源泉ガード (M25)
  legalWithholdingConfirmed: boolean
  legalWithholdingConfirmedAt?: string
  legalWithholdingConfirmedBy?: string
  legalWithholdingTaxAccountantName?: string
  legalWithholdingConfirmationDocUrl?: string

  // 営業日（クロウ R4: FE/BE 同時デプロイ手順は §14.4 参照）
  businessDayCutoffHour: number       // default 5

  // 店舗情報
  storeName: string
  storeAddress: string
  storePhone: string
  invoiceNumber: string

  // 延長料金 (M22 で人数連動)
  extensionPricingMode: 'per_guest_set'
  extensionMinuteOptions: [30, 60]
  /** 30 分延長の 1 セット料金 (default ¥3,000)。frontend defaultStoreSettings と整合。 */
  extensionPrice30Min: number
  /** 60 分延長の 1 セット料金 (default ¥5,000、22:00〜セット料金と同額の運用想定)。 */
  extensionPrice60Min: number

  // 中間チェック票
  checkTicketAutoPrintMinutes: number // 50

  // セッション
  sessionIdleMinutes: number          // 30
  jwtExpiresHours: number             // 12
  heartbeatIntervalMinutes: number    // 5

  // PIN ロック (クロウ R3: 段階ロック 5/30/24)
  pinLockStage1Failures: number       // 5
  pinLockStage1Minutes: number        // 5
  pinLockStage2Failures: number       // 10
  pinLockStage2Minutes: number        // 30
  pinLockStage3Failures: number       // 15
  pinLockStage3Hours: number          // 24

  // ボーナス上限 (M7)
  maxBonusRatePerOrder: number        // 0.30

  // シャンパンセッパン (M6)
  champagneSplitThreshold: number     // 20000

  // 固定人件費 (FL計算の労務費に加算)
  staffFixedCost: number              // default 28800
}

// ─────────────────────────────────────────────────────────────
// DailyAggregate (キャッシュ、tx 同梱更新 M15)
// ─────────────────────────────────────────────────────────────

export interface DailyAggregate {
  /** Doc ID */
  businessDate: string
  totalSales: number
  cashSales: number
  cardSales: number
  cardFeeIncome: number
  cardProcessingFee: number
  foodCost: number
  laborCostHourly: number
  laborCostBack: number
  expenseTotal: number
  guestCount: number
  tableCount: number
  billingCount: number
  /** (foodCost + labor + cardProcessingFee) / totalSales */
  flRate: number
  profit: number
  updatedAt: string
}

// ─────────────────────────────────────────────────────────────
// AuditLog (永続版、§7 / §3.23)
// ─────────────────────────────────────────────────────────────

export type AuditLogAction =
  | 'create' | 'update' | 'delete' | 'void' | 'reopen' | 'archive'
  | 'login_success' | 'login_failed' | 'pin_locked' | 'logout'
  | 'legal_withholding_confirmed' | 'champagne_redistribute'

export interface AuditLogV41 {
  id: string
  storeId: string
  collection: string
  documentId: string | number
  action: AuditLogAction
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  userId: string
  userRole: Role
  timestamp: string
  reason?: string
  /** 任意の追加情報（lockedUntil, failedAttempts 等） */
  payload?: unknown
  ipAddress?: string
}

// ─────────────────────────────────────────────────────────────
// metadata/billing (singleton、M17)
// ─────────────────────────────────────────────────────────────

export interface BillingMetadata {
  nextReceiptNumber: number
  lastReceiptIssuedAt: string
  receiptResetAt?: string
}
