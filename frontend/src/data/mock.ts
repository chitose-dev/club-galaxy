// ─── 型定義 ───

export type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert'

export interface Table {
  id: number
  number: string
  status: TableStatus
  guestCount: number
  startTime: string | null
  castNames: string[]
  nomination: 'shimei' | 'banai' | 'free' | 'douhan' | null
  setCount: number
  orders: OrderItem[]
  /** 中間チェック票が自動印字されたタイムスタンプ (同一卓での二重印字防止) */
  checkTicketPrintedAt?: string | null
}

export interface GuestMenuItem {
  id: number
  name: string
  price: number
  cost: number        // 原価
  castBack: number    // キャストバック
  category: 'guest'
  subcategory: 'shochu' | 'whisky' | 'brandy' | 'champagne' | 'shot' | 'pitcher' | 'beer' | 'warimono'
}

export interface CastMenuItem {
  id: number
  name: string
  price: number
  cost: number        // 原価
  castBack: number    // キャストバック
  category: 'cast'
  subcategory: 'fd' | 'honkaku' | 'hond'
  backType: BackType
}

export type MenuItem = GuestMenuItem | CastMenuItem

export type BackType = 'FD' | '本D' | 'Fカク' | '本カク' | '本カクW' | '同伴' | '本指名' | '場内指名' | 'ボトルバック' | 'ヘルプ' | 'その他'

export interface OrderItem {
  menuItem: MenuItem
  quantity: number
  castName?: string
}

export interface Cast {
  id: number
  name: string               // 源氏名
  realName?: string          // 本名（日経表PDF下部、税理士提出用）
  address?: string           // 住所（日経表PDF下部、税理士提出用）
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>
  guaranteeRate: number // 売上保証率 (0.0〜1.0)
  active: boolean
  /** 最後に卓にアサインされた時刻 (付け回しの待機時間順表示用) */
  lastAssignedAt?: string | null
}

export interface SetPrice {
  id: string
  label: string
  price: number
  cost: number
}

// ─── 会計関連 ───

export interface DiscountLog {
  id: number
  tableNumber: string
  originalTotal: number
  discountAmount: number
  reason: string
  operator: string
  timestamp: string
}

export interface BillingRecord {
  id: number
  tableNumber: string
  total: number
  paymentMethod: 'cash' | 'card' | 'mixed'
  cashAmount?: number
  cardAmount?: number
  cardFee?: number
  timestamp: string
}

// ─── 給与関連 ───

export interface DailyWork {
  date: string
  hours: number
  backs: Partial<Record<BackType, number>>
  sales: number // その日の個人売上小計
}

export interface DailyPayRequest {
  id: number
  castId: number           // ボーイの場合は一意なstaffId(負数等)で代用
  castName: string
  amount: number
  date: string
  /** 省略時は 'cast' として扱う */
  staffType?: 'cast' | 'boy'
}

// ─── ボトルキープ ───

export interface BottleKeep {
  id: number
  bottleName: string
  remaining: number // 0-100
  storageLocation: string
  customerName: string
  tableNumber?: string
  createdAt: string
}

// ─── 勤怠管理 ───

export interface AttendanceRecord {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  date: string
  clockIn: string | null   // HH:MM
  clockOut: string | null   // HH:MM
  breakMinutes: number
  workHours: number         // 自動計算
}

// ─── 経費管理 ───

export type ExpenseCategory = '仕入れ（酒等）' | '税金' | '雑費'

export interface Expense {
  id: number
  amount: number
  category: ExpenseCategory
  note: string
  source: 'register' | 'transfer'  // レジ現金 or 振込・オーナー立替
  date: string
  timestamp: string
}

// ─── 天引き ───

export interface Deduction {
  id: number
  castId: number           // ボーイの場合は一意なstaffId(負数等)で代用
  amount: number
  reason: string
  source: 'register' | 'transfer'  // レジ現金 or 振込・オーナー立替
  /** 省略時は 'cast' として扱う */
  staffType?: 'cast' | 'boy'
}

// ─── 前借り ───

export interface AdvancePayment {
  id: number
  castId: number
  castName: string
  amount: number
  source: 'register' | 'transfer'  // レジ現金 or 振込・オーナー立替
  reason: string
  date: string
  timestamp: string
}

// ─── 店舗設定 ───

export interface StoreSettings {
  taxRate: number        // default 0.2
  cardFeeRate: number    // 客向け手数料。default 0.1
  cardProcessingFeeRate: number // カード会社への支払手数料 (店舗経費)。default 0.035
  initialCash: number    // default 100000
  closingDay: number     // default 15
  storeName: string
  storeAddress: string
  storePhone: string
  invoiceNumber: string  // インボイス登録番号
}

// ─── 日報 ───

export interface DailyReport {
  id: number
  date: string               // YYYY-MM-DD
  initialCash: number
  cashSales: number
  cardSales: number
  totalSales: number
  dailyPayTotal: number
  cashExpenseTotal: number
  cashAdvanceTotal: number
  theoreticalCash: number
  actualCash: number
  difference: number
  note: string
  operator: string
  createdAt: string          // ISO timestamp
}

// ─── アーカイブ ───

export interface ArchivedData {
  id: number
  archivedAt: string
  dateRange: string
  billingCount: number
  totalSales: number
}

// ─── セット料金（時間帯別） ───

export const setPrices: SetPrice[] = [
  { id: 'set-2000', label: '20:00〜', price: 4000, cost: 300 },
  { id: 'set-2200', label: '22:00〜', price: 5000, cost: 300 },
  { id: 'set-2400', label: '24:00〜LAST', price: 6000, cost: 300 },
]

export const chargeItems: SetPrice[] = [
  { id: 'single-charge', label: 'シングルチャージ', price: 1000, cost: 300 },
  { id: 'douhan', label: '同伴', price: 4000, cost: 300 },
  { id: 'shimei', label: '本指名', price: 1500, cost: 300 },
  { id: 'banai', label: '場内指名', price: 500, cost: 300 },
]

export const SET_DURATION_MINUTES = 60
export const EXTENSION_OPTIONS = [30, 60] as const
export const ALERT_MINUTES = 50
export const ENDING_MINUTES = 10

// ─── ゲスト用ドリンクメニュー ───

export const guestMenuItems: GuestMenuItem[] = [
  { id: 101, name: '焼酎', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 102, name: 'ウイスキー', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 103, name: 'ブランデー', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 104, name: 'シャンパン', price: 0, cost: 2000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 105, name: 'ゲストショット', price: 2000, cost: 500, castBack: 0, category: 'guest', subcategory: 'shot' },
  { id: 106, name: 'ピッチャー', price: 2000, cost: 800, castBack: 0, category: 'guest', subcategory: 'pitcher' },
  { id: 107, name: 'ゲストビール', price: 1500, cost: 400, castBack: 0, category: 'guest', subcategory: 'beer' },
  { id: 108, name: '割物', price: 600, cost: 100, castBack: 0, category: 'guest', subcategory: 'warimono' },
]

// ─── キャスト用ドリンクメニュー ───

export const castMenuItems: CastMenuItem[] = [
  { id: 201, name: 'レディースドリンク (FD)', price: 1000, cost: 0, castBack: 500, category: 'cast', subcategory: 'fd', backType: 'FD' },
  { id: 202, name: 'レディースカクテル (本カク)', price: 1500, cost: 0, castBack: 800, category: 'cast', subcategory: 'honkaku', backType: '本カク' },
  { id: 203, name: 'レディースショット (本D)', price: 2000, cost: 0, castBack: 1000, category: 'cast', subcategory: 'hond', backType: '本D' },
]

export const allMenuItems: MenuItem[] = [...guestMenuItems, ...castMenuItems]

// ─── キャスト一覧 ───

export const casts: Cast[] = [
  {
    id: 1, name: 'あいり', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
  },
  {
    id: 2, name: 'みく', hourlyRate: 2000, guaranteeRate: 0.45, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
  },
  {
    id: 3, name: 'れな', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
  },
  {
    id: 4, name: 'ゆい', hourlyRate: 2000, guaranteeRate: 0.4, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
  },
  {
    id: 5, name: 'りさ', hourlyRate: 3000, guaranteeRate: 0.55, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000 },
  },
]

// ─── ユーティリティ ───

export function getSetPriceForTime(startTime: string): number {
  // 要件定義書 Ver.20.0: 20:00〜 4000 / 22:00〜 5000 / 24:00〜LAST 6000
  // startTime が "00:00"〜"03:00" 等、日付をまたいだ時刻の場合は「24:00〜」区分(深夜帯)として扱う
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 4) return 6000               // 0時台〜3時台(ラスト前)
  if (hour < 22) return 4000              // 20:00〜21:59
  if (hour < 24) return 5000              // 22:00〜23:59
  return 6000
}

export function getSetPriceLabel(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 4) return '24:00〜LAST'
  if (hour < 22) return '20:00〜'
  if (hour < 24) return '22:00〜'
  return '24:00〜LAST'
}

// ─── 卓データ（デモ用10卓） ───

/** 現在時刻からN分前の時刻をHH:MM形式で返す */
function minutesAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const initialTables: Table[] = [
  { id: 1, number: '1', status: 'occupied', guestCount: 3, startTime: minutesAgo(30), castNames: ['あいり'], nomination: 'shimei', setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 2 },
    { menuItem: guestMenuItems[4], quantity: 1 },
  ] },
  { id: 2, number: '2', status: 'occupied', guestCount: 2, startTime: minutesAgo(45), castNames: ['みく'], nomination: 'free', setCount: 1, orders: [
    { menuItem: castMenuItems[1], quantity: 1 },
    { menuItem: guestMenuItems[7], quantity: 3 },
  ] },
  { id: 3, number: '3', status: 'ending', guestCount: 4, startTime: minutesAgo(55), castNames: ['れな'], nomination: 'shimei', setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 3 },
    { menuItem: castMenuItems[2], quantity: 1 },
    { menuItem: guestMenuItems[5], quantity: 2 },
  ] },
  { id: 4, number: '4', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 5, number: '5', status: 'occupied', guestCount: 2, startTime: minutesAgo(15), castNames: ['ゆい'], nomination: 'free', setCount: 1, orders: [] },
  { id: 6, number: '6', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 7, number: '7', status: 'alert', guestCount: 5, startTime: minutesAgo(52), castNames: ['りさ', 'あいり'], nomination: 'douhan', setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 4 },
    { menuItem: castMenuItems[1], quantity: 2 },
    { menuItem: guestMenuItems[6], quantity: 3 },
  ] },
  { id: 8, number: '8', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 9, number: 'VIP1', status: 'occupied', guestCount: 3, startTime: minutesAgo(20), castNames: ['みく', 'ゆい'], nomination: 'shimei', setCount: 1, orders: [] },
  { id: 10, number: 'VIP2', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
]

export const nominationLabels: Record<string, string> = {
  shimei: '本指名',
  banai: '場内指名',
  free: 'フリー',
  douhan: '同伴',
}

// ─── 給与計算用ダミーデータ ───

export const sampleDailyWork: Record<number, DailyWork[]> = {
  // あいり (id:1) - 前半15日分
  1: [
    { date: '3/1', hours: 5, backs: { FD: 3, '本カク': 2, '本指名': 1 }, sales: 42000 },
    { date: '3/2', hours: 6, backs: { FD: 4, '本D': 1, '場内指名': 2 }, sales: 55000 },
    { date: '3/3', hours: 0, backs: {}, sales: 0 },
    { date: '3/4', hours: 5, backs: { FD: 2, '本カク': 1, '同伴': 1 }, sales: 48000 },
    { date: '3/5', hours: 6, backs: { FD: 5, '本D': 2, '本指名': 1 }, sales: 62000 },
    { date: '3/6', hours: 5, backs: { FD: 3, '本カクW': 1 }, sales: 38000 },
    { date: '3/7', hours: 6, backs: { FD: 4, '本カク': 3, '本指名': 2 }, sales: 71000 },
    { date: '3/8', hours: 5, backs: { FD: 2, '場内指名': 1 }, sales: 35000 },
    { date: '3/9', hours: 0, backs: {}, sales: 0 },
    { date: '3/10', hours: 6, backs: { FD: 6, '本D': 1, '同伴': 1, '本指名': 1 }, sales: 78000 },
    { date: '3/11', hours: 5, backs: { FD: 3, '本カク': 2 }, sales: 44000 },
    { date: '3/12', hours: 6, backs: { FD: 4, '本カクW': 1, '場内指名': 1 }, sales: 52000 },
    { date: '3/13', hours: 5, backs: { FD: 2, '本D': 1 }, sales: 39000 },
    { date: '3/14', hours: 6, backs: { FD: 5, '本カク': 2, '本指名': 1, '同伴': 1 }, sales: 85000 },
    { date: '3/15', hours: 5, backs: { FD: 3, '場内指名': 2 }, sales: 41000 },
  ],
  // みく (id:2)
  2: [
    { date: '3/1', hours: 5, backs: { FD: 2, '本カク': 1 }, sales: 32000 },
    { date: '3/2', hours: 0, backs: {}, sales: 0 },
    { date: '3/3', hours: 6, backs: { FD: 3, '場内指名': 1 }, sales: 38000 },
    { date: '3/4', hours: 5, backs: { FD: 2, '本D': 1 }, sales: 35000 },
    { date: '3/5', hours: 6, backs: { FD: 4, '本カク': 2, '本指名': 1 }, sales: 56000 },
    { date: '3/6', hours: 0, backs: {}, sales: 0 },
    { date: '3/7', hours: 5, backs: { FD: 3, '本カクW': 1 }, sales: 42000 },
    { date: '3/8', hours: 6, backs: { FD: 4, '場内指名': 2 }, sales: 48000 },
    { date: '3/9', hours: 5, backs: { FD: 2, '本カク': 1 }, sales: 33000 },
    { date: '3/10', hours: 0, backs: {}, sales: 0 },
    { date: '3/11', hours: 6, backs: { FD: 5, '本D': 2, '同伴': 1 }, sales: 65000 },
    { date: '3/12', hours: 5, backs: { FD: 3, '本指名': 1 }, sales: 44000 },
    { date: '3/13', hours: 6, backs: { FD: 4, '本カク': 1 }, sales: 41000 },
    { date: '3/14', hours: 0, backs: {}, sales: 0 },
    { date: '3/15', hours: 5, backs: { FD: 2, '場内指名': 1 }, sales: 30000 },
  ],
  // れな (id:3)
  3: [
    { date: '3/1', hours: 6, backs: { FD: 4, '本カク': 2, '本指名': 1 }, sales: 58000 },
    { date: '3/2', hours: 5, backs: { FD: 3, '同伴': 1 }, sales: 52000 },
    { date: '3/3', hours: 6, backs: { FD: 5, '本D': 1, '場内指名': 1 }, sales: 61000 },
    { date: '3/4', hours: 0, backs: {}, sales: 0 },
    { date: '3/5', hours: 5, backs: { FD: 3, '本カクW': 1 }, sales: 45000 },
    { date: '3/6', hours: 6, backs: { FD: 4, '本カク': 3 }, sales: 55000 },
    { date: '3/7', hours: 0, backs: {}, sales: 0 },
    { date: '3/8', hours: 6, backs: { FD: 5, '本D': 2, '本指名': 2 }, sales: 74000 },
    { date: '3/9', hours: 5, backs: { FD: 3, '場内指名': 1 }, sales: 40000 },
    { date: '3/10', hours: 6, backs: { FD: 4, '本カク': 1, '同伴': 1 }, sales: 63000 },
    { date: '3/11', hours: 0, backs: {}, sales: 0 },
    { date: '3/12', hours: 5, backs: { FD: 2, '本カクW': 1 }, sales: 38000 },
    { date: '3/13', hours: 6, backs: { FD: 4, '本D': 1, '本指名': 1 }, sales: 57000 },
    { date: '3/14', hours: 5, backs: { FD: 3, '場内指名': 2 }, sales: 43000 },
    { date: '3/15', hours: 6, backs: { FD: 5, '本カク': 2, '同伴': 1 }, sales: 68000 },
  ],
  4: [
    { date: '3/1', hours: 5, backs: { FD: 2, '場内指名': 1 }, sales: 28000 },
    { date: '3/2', hours: 6, backs: { FD: 3, '本カク': 1 }, sales: 35000 },
    { date: '3/3', hours: 0, backs: {}, sales: 0 },
    { date: '3/4', hours: 5, backs: { FD: 2 }, sales: 25000 },
    { date: '3/5', hours: 0, backs: {}, sales: 0 },
    { date: '3/6', hours: 6, backs: { FD: 3, '本D': 1, '場内指名': 1 }, sales: 40000 },
    { date: '3/7', hours: 5, backs: { FD: 2, '本カク': 1 }, sales: 32000 },
    { date: '3/8', hours: 0, backs: {}, sales: 0 },
    { date: '3/9', hours: 6, backs: { FD: 4, '本指名': 1 }, sales: 45000 },
    { date: '3/10', hours: 5, backs: { FD: 2, '場内指名': 1 }, sales: 30000 },
    { date: '3/11', hours: 6, backs: { FD: 3, '本カク': 2 }, sales: 42000 },
    { date: '3/12', hours: 0, backs: {}, sales: 0 },
    { date: '3/13', hours: 5, backs: { FD: 2, '本D': 1 }, sales: 33000 },
    { date: '3/14', hours: 6, backs: { FD: 4, '同伴': 1 }, sales: 50000 },
    { date: '3/15', hours: 5, backs: { FD: 3 }, sales: 28000 },
  ],
  5: [
    { date: '3/1', hours: 6, backs: { FD: 5, '本カク': 3, '本指名': 2, '同伴': 1 }, sales: 92000 },
    { date: '3/2', hours: 6, backs: { FD: 4, '本D': 2, '場内指名': 1 }, sales: 68000 },
    { date: '3/3', hours: 0, backs: {}, sales: 0 },
    { date: '3/4', hours: 6, backs: { FD: 6, '本カク': 2, '本カクW': 1, '本指名': 1 }, sales: 85000 },
    { date: '3/5', hours: 6, backs: { FD: 4, '本D': 1, '同伴': 1 }, sales: 72000 },
    { date: '3/6', hours: 0, backs: {}, sales: 0 },
    { date: '3/7', hours: 6, backs: { FD: 5, '本カク': 3, '場内指名': 2 }, sales: 78000 },
    { date: '3/8', hours: 6, backs: { FD: 3, '本D': 1 }, sales: 55000 },
    { date: '3/9', hours: 6, backs: { FD: 6, '本カクW': 2, '本指名': 2 }, sales: 95000 },
    { date: '3/10', hours: 0, backs: {}, sales: 0 },
    { date: '3/11', hours: 6, backs: { FD: 4, '本カク': 2, '同伴': 1 }, sales: 75000 },
    { date: '3/12', hours: 6, backs: { FD: 5, '本D': 2, '本指名': 1 }, sales: 82000 },
    { date: '3/13', hours: 6, backs: { FD: 4, '場内指名': 1 }, sales: 60000 },
    { date: '3/14', hours: 0, backs: {}, sales: 0 },
    { date: '3/15', hours: 6, backs: { FD: 6, '本カク': 3, '本カクW': 1, '同伴': 1, '本指名': 1 }, sales: 98000 },
  ],
}

// ─── 日払い申請ダミーデータ ───

export const initialDailyPayRequests: DailyPayRequest[] = [
  { id: 1, castId: 1, castName: 'あいり', amount: 10000, date: '3/5' },
  { id: 2, castId: 5, castName: 'りさ', amount: 15000, date: '3/9' },
]

// ─── 会計済みデータ（レジ締め用ダミー） ───

export const initialBillingRecords: BillingRecord[] = [
  { id: 1, tableNumber: '4', total: 52800, paymentMethod: 'cash', timestamp: '21:30' },
  { id: 2, tableNumber: '6', total: 38500, paymentMethod: 'card', timestamp: '22:15' },
  { id: 3, tableNumber: '8', total: 66000, paymentMethod: 'cash', timestamp: '23:00' },
]

// ─── ボトルキープダミーデータ ───

export const initialBottleKeeps: BottleKeep[] = [
  { id: 1, bottleName: '響 17年', remaining: 65, storageLocation: 'A-3', customerName: '田中様', tableNumber: '1', createdAt: '2025-03-01' },
  { id: 2, bottleName: 'ヘネシー XO', remaining: 30, storageLocation: 'B-1', customerName: '佐藤様', tableNumber: 'VIP1', createdAt: '2025-02-20' },
  { id: 3, bottleName: 'ドンペリ', remaining: 15, storageLocation: 'C-2', customerName: '山田様', createdAt: '2025-03-10' },
  { id: 4, bottleName: 'マッカラン 18年', remaining: 80, storageLocation: 'A-5', customerName: '鈴木様', createdAt: '2025-03-15' },
  { id: 5, bottleName: 'モエ ロゼ', remaining: 5, storageLocation: 'B-4', customerName: '高橋様', createdAt: '2025-02-28' },
]

// ─── 店舗デフォルト設定 ───

export const defaultStoreSettings: StoreSettings = {
  taxRate: 0.2,
  cardFeeRate: 0.1,
  cardProcessingFeeRate: 0.035,
  initialCash: 100000,
  closingDay: 15,
  storeName: "Heaven's Garden",
  storeAddress: '',
  storePhone: '',
  invoiceNumber: 'T5390001005970',
}

// ─── 勤怠ダミーデータ ───

export const initialAttendanceRecords: AttendanceRecord[] = [
  { id: 1, staffId: 1, staffName: 'あいり', staffType: 'cast', date: '2026-04-14', clockIn: '20:00', clockOut: null, breakMinutes: 0, workHours: 0 },
  { id: 2, staffId: 3, staffName: 'れな', staffType: 'cast', date: '2026-04-14', clockIn: '20:30', clockOut: null, breakMinutes: 0, workHours: 0 },
]

// ─── 経費ダミーデータ ───

export const initialExpenses: Expense[] = [
  { id: 1, amount: 15000, category: '仕入れ（酒等）', note: 'ビール仕入れ', source: 'register', date: '2026-04-14', timestamp: '18:30' },
]

// ─── 前借りダミーデータ ───

export const initialAdvancePayments: AdvancePayment[] = []

// ─── ダミーアカウント ───

export interface UserAccount {
  username: string
  pin: string
  role: 'owner' | 'staff' | 'cast'
  castId?: number
  displayName: string
  /** ボーイ(staff)の時給。給与計算に使用 */
  hourlyRate?: number
}

export const dummyAccounts: UserAccount[] = [
  { username: 'owner', pin: '1234', role: 'owner', displayName: 'オーナー' },
  { username: 'staff', pin: '5678', role: 'staff', displayName: '黒服', hourlyRate: 1500 },
  { username: 'cast1', pin: '1111', role: 'cast', castId: 1, displayName: 'あいり' },
  { username: 'cast2', pin: '2222', role: 'cast', castId: 2, displayName: 'みく' },
]
