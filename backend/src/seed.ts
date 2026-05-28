/**
 * Seed script: フロント mock.ts 互換の初期データを Firestore に投入。
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' npx tsx src/seed.ts
 *
 * Or with ADC on Cloud Run / local gcloud auth:
 *   npx tsx src/seed.ts
 */

import bcrypt from 'bcrypt'
import { db, storeCollection, storeDoc } from './firebase'
import { nowJstIso } from './lib/businessDate'
import type {
  Cast,
  GuestMenuItem,
  CastMenuItem,
  SetPrice,
  ChargeItem,
  Table,
  StoreSettings,
} from './types'

const BCRYPT_ROUNDS = 10
const SEED_USER = 'seed'
const now = nowJstIso()

function audit() {
  return { createdBy: SEED_USER, createdAt: now }
}

// ── Cast data ──

const casts: Cast[] = [
  {
    id: 1, name: 'あいり', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
    ...audit(),
  },
  {
    id: 2, name: 'みく', hourlyRate: 2000, guaranteeRate: 0.45, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
    ...audit(),
  },
  {
    id: 3, name: 'れな', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
    ...audit(),
  },
  {
    id: 4, name: 'ゆい', hourlyRate: 2000, guaranteeRate: 0.4, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
    ...audit(),
  },
  {
    id: 5, name: 'りさ', hourlyRate: 3000, guaranteeRate: 0.55, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
    ...audit(),
  },
]

// ── Menu data ──

const guestMenu: GuestMenuItem[] = [
  { id: 101, name: '焼酎', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'shochu', ...audit() },
  { id: 102, name: 'ウイスキー', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'whisky', ...audit() },
  { id: 103, name: 'ブランデー', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'brandy', ...audit() },
  { id: 104, name: 'シャンパン', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'champagne', ...audit() },
  { id: 105, name: 'ゲストショット', price: 2000, cost: 500, castBack: 0, category: 'guest', subcategory: 'shot', ...audit() },
  { id: 106, name: 'ピッチャー', price: 2000, cost: 800, castBack: 0, category: 'guest', subcategory: 'pitcher', ...audit() },
  { id: 107, name: 'ゲストビール', price: 1500, cost: 400, castBack: 0, category: 'guest', subcategory: 'beer', ...audit() },
  { id: 108, name: '割物', price: 600, cost: 100, castBack: 0, category: 'guest', subcategory: 'warimono', ...audit() },
]

const castMenu: CastMenuItem[] = [
  { id: 201, name: 'レディースドリンク (FD)', price: 1000, cost: 0, castBack: 500, category: 'cast', subcategory: 'fd', backType: 'FD', ...audit() },
  { id: 202, name: 'レディースカクテル (本カク)', price: 1500, cost: 0, castBack: 800, category: 'cast', subcategory: 'honkaku', backType: '本カク', ...audit() },
  { id: 203, name: 'レディースショット (本D)', price: 2000, cost: 0, castBack: 1000, category: 'cast', subcategory: 'hond', backType: '本D', ...audit() },
]

// ── Set prices & charges ──

const setPrices: SetPrice[] = [
  { id: 'set-2000', label: '20:00〜20:59', price: 3500, cost: 300, startHour: 20, ...audit() },
  { id: 'set-2100', label: '21:00〜22:59', price: 4000, cost: 300, startHour: 21, ...audit() },
  { id: 'set-2300', label: '23:00〜ラスト', price: 5000, cost: 300, startHour: 23, ...audit() },
]

const chargeItems: ChargeItem[] = [
  { id: 'single-charge', label: 'シングルチャージ', price: 1000, cost: 300, ...audit() },
  { id: 'douhan', label: '同伴', price: 4000, cost: 300, ...audit() },
  { id: 'shimei', label: '指名料', price: 2000, cost: 300, ...audit() },
  { id: 'banai', label: '場内指名', price: 1000, cost: 300, ...audit() },
]

// ── Tables (10 tables, all empty for fresh start、Rev.4.1 §3.6 構造) ──

const tableNumbers = [
  { id: 1, number: '1' },
  { id: 2, number: '2' },
  { id: 3, number: '3' },
  { id: 4, number: '4' },
  { id: 5, number: '5' },
  { id: 6, number: '6' },
  { id: 7, number: '7' },
  { id: 8, number: '8' },
  { id: 9, number: 'VIP1' },
  { id: 10, number: 'VIP2' },
]

const tables: Table[] = tableNumbers.map((t) => ({
  ...t,
  status: 'empty',
  guestCount: 0,
  startTime: null,
  businessDate: null,
  assignedCasts: [],
  mainNominationCastNames: [],
  isDouhan: false,
  isBanaiShimei: false,
  setCount: 0,
  orders: [],
  ...audit(),
}))

// ── User accounts (Rev.4.1 §3.3 判別ユニオン互換) ──

interface SeedUser {
  username: string
  pin: string
  role: 'owner' | 'staff' | 'cast'
  displayName: string
  castId?: number
  hourlyRate?: number
}

// owner のみ seed する。staff/cast は AdminPage > ユーザー管理 から作成。
const userAccounts: SeedUser[] = [
  { username: 'owner', pin: '1234', role: 'owner', displayName: 'オーナー' },
]

// ── Store settings ──

const storeSettings: Partial<StoreSettings> = {
  taxRate: 0.2,
  consumptionTaxRate: 0.1,
  cardFeeRate: 0.1,
  cardProcessingFeeRate: 0.035,
  initialCash: 100_000,
  closingDay: 15,
  payrollDeductionRate: 0.1,
  dailyPayDeductionRate: 0.1,
  looseTimeMinutes: 15,
  payUnitMinutes: 15,
  legalWithholdingConfirmed: false,
  businessDayCutoffHour: 5,
  storeName: 'CLUB GALAXY',
  storeAddress: '',
  storePhone: '',
  invoiceNumber: 'T5390001005970',
  extensionPricingMode: 'per_guest_set',
  extensionMinuteOptions: [30, 60],
  checkTicketAutoPrintMinutes: 50,
  sessionIdleMinutes: 30,
  jwtExpiresHours: 12,
  heartbeatIntervalMinutes: 5,
  pinLockStage1Failures: 5,
  pinLockStage1Minutes: 5,
  pinLockStage2Failures: 10,
  pinLockStage2Minutes: 30,
  pinLockStage3Failures: 15,
  pinLockStage3Hours: 24,
  maxBonusRatePerOrder: 0.3,
  champagneSplitThreshold: 20_000,
  staffFixedCost: 28_800,
  createdBy: SEED_USER,
  createdAt: now,
}

// ── Seed function ──

async function seed() {
  console.log('Seeding Firestore...')

  const batch = db.batch()

  // Store settings
  batch.set(storeDoc(), storeSettings, { merge: true })

  // Tables
  for (const t of tables) {
    batch.set(storeCollection('tables').doc(String(t.id)), t)
  }

  // Casts
  for (const c of casts) {
    batch.set(storeCollection('casts').doc(String(c.id)), c)
  }

  // Guest menu
  for (const item of guestMenu) {
    batch.set(storeCollection('guestMenu').doc(String(item.id)), item)
  }

  // Cast menu
  for (const item of castMenu) {
    batch.set(storeCollection('castMenu').doc(String(item.id)), item)
  }

  // Set prices
  for (const p of setPrices) {
    batch.set(storeCollection('setPrices').doc(p.id), p)
  }

  // Charge items
  for (const item of chargeItems) {
    batch.set(storeCollection('chargeItems').doc(item.id), item)
  }

  // User accounts (PIN は bcrypt でハッシュ化して pinHash として保存、AuditFields stamp)
  for (const user of userAccounts) {
    const { pin, ...rest } = user
    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS)
    batch.set(storeCollection('userAccounts').doc(user.username), {
      ...rest,
      pinHash,
      failedAttempts: 0,
      createdBy: SEED_USER,
      createdAt: now,
    })
  }

  await batch.commit()
  console.log('Seed complete!')
  console.log(`  - ${tables.length} tables`)
  console.log(`  - ${casts.length} casts`)
  console.log(`  - ${guestMenu.length} guest menu items`)
  console.log(`  - ${castMenu.length} cast menu items`)
  console.log(`  - ${setPrices.length} set prices`)
  console.log(`  - ${chargeItems.length} charge items`)
  console.log(`  - ${userAccounts.length} user accounts`)
  console.log(`  - store settings`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
