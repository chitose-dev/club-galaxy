// ─── 型定義 ───

export type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert'

export interface Table {
  id: number
  number: string
  status: TableStatus
  guestCount: number
  startTime: string | null
  /**
   * 現在「対応中」のキャスト (動的)。卓間の付け回しで変動する。
   * 追補02 R1: 旧 castNames を置換。「今ついてる女の子」= これ。
   */
  assignedCasts: string[]
  /**
   * 本指名担当の源氏名 (追補02 R1-2/R1-3/R1-4 + 追補03 R24: 複数対応)。
   * 卓に対して固定で、キャストが他卓へ移動しても消えない (売上・バック帰属用)。
   * 空配列 = 本指名なし (フリー扱いの基礎条件)。
   * 複数指定時は売上を均等割りで分配 (PR 暫定、運用後に要 再調整)。
   */
  mainNominationCastNames: string[]
  /** 同伴フラグ (追補02 R9: 本指名と共存可) */
  isDouhan?: boolean
  /** 場内指名フラグ (追補02 R8-5: 延長で変更可) */
  isBanaiShimei?: boolean
  setCount: number
  orders: OrderItem[]
  /** 中間チェック票が自動印字されたタイムスタンプ (同一卓での二重印字防止) */
  checkTicketPrintedAt?: string | null
  /** セット料金1セット分の値引き額 (0 or undefined = 値引きなし) */
  setDiscountPerSet?: number
  /** 残り時間の手動微調整(分単位、±) */
  timeAdjustmentMinutes?: number
  /** 延長履歴(延長取消のため) */
  extensionHistory?: ExtensionEntry[]
}

export interface ExtensionEntry {
  id: number
  minutes: 30 | 60
  timestamp: string  // ISO
  /** 延長料金を紐付けたキャスト名 (延長時に指名したキャスト) */
  nominatedCastName?: string
  /** このエントリで追加された注文ID(取消時に一緒に削除するため) */
  orderMenuItemId?: number
}

/** 延長料金 (指示書§6.2.3: +30分=1000円、+60分=3000円) */
export const EXTENSION_CHARGES: Record<30 | 60, number> = {
  30: 1000,
  60: 3000,
}

export interface GuestMenuItem {
  id: number
  name: string
  price: number
  cost: number        // 原価
  castBack: number    // キャストバック
  category: 'guest'
  subcategory: 'shochu' | 'whisky' | 'brandy' | 'champagne' | 'wine' | 'shot' | 'pitcher' | 'beer' | 'warimono'
}

export interface CastMenuItem {
  id: number
  name: string
  price: number
  cost: number        // 原価
  castBack: number    // キャストバック
  category: 'cast'
  /**
   * 先方フィードバック (2026-04-23):
   * F = フリー (バック安) / 本 = 本指名 (バック高) を 10 基本項目 + 個別銘柄 で表現
   */
  subcategory:
    | 'fdrink' | 'hondrink'
    | 'fkaku' | 'honkaku' | 'honkakuW'
    | 'fshot' | 'honshot'
    | 'fpitcher' | 'honpitcher'
    | 'fbeer' | 'honbeer'
  backType: BackType
}

export type MenuItem = GuestMenuItem | CastMenuItem

/**
 * 追補03 R19: ボトルバックのみ「%」単位で格納する BackType リスト。
 * 値は 0-100 の整数で格納し、実計算時に 100 で割って率として使う。
 * (他の BackType は「円」単位)
 */
export const PERCENT_BACK_TYPES: readonly string[] = ['ボトルバック'] as const

export function isPercentBackType(bt: string): boolean {
  return PERCENT_BACK_TYPES.includes(bt)
}

/**
 * バック種別。追補02 の先方フィードバック (2026-04-23) で F/本 を全ドリンク系列で区別する仕様に拡張。
 * フリー (F*) はバック安、本指名 (本*) はバック高。
 */
export type BackType =
  | 'FD' | '本D'
  | 'Fカク' | '本カク' | '本カクW'
  | 'Fショ' | '本ショ'
  | 'FP' | '本P'
  | 'FB' | '本B'
  | '同伴' | '本指名' | '場内指名'
  | 'ボトルバック' | 'ヘルプ' | 'その他'

export interface OrderItem {
  menuItem: MenuItem
  quantity: number
  castName?: string
  /**
   * 追補03 R18: 1 件単位のボーナス加算先 (任意)。
   * 本指名卓でドリンクを注文したが、別のキャスト (例: フリーのキャスト)
   * にも「ボーナス的な給料を少しだけ」出したいケースに使う。
   * 売上帰属は変わらず (castName に紐付くまま)、ボーナスだけ別キャストに加算。
   */
  bonusCastName?: string
  /**
   * ボーナス金額 (円)。設定すれば給与計算時に bonusCastName の「その他」バック
   * として加算される。
   */
  bonusAmount?: number
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
  /** 休憩中フラグ (active=true のときのみ有効、待機カウント対象外) */
  onBreak?: boolean
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
  timestamp: string           // HH:MM
  date?: string               // YYYY-MM-DD (月年別集計用、省略時は今日扱い)
  /** 本指名卓の場合の担当キャストID (指示書§5.2: 売上重畳のため) */
  nominatedCastId?: number
  /** TAX前の小計(保証計算・売上重畳に使用) */
  subtotalBeforeTax?: number
  /** 担当キャスト名(集計表示用) */
  castNamesSnapshot?: string[]
  /** 会計履歴からの再印刷用スナップショット */
  receiptSnapshot?: ReceiptSnapshot
}

/** 領収書再印刷用に必要な会計スナップショット */
export interface ReceiptSnapshot {
  receiptNumber: number
  receiptName: string
  receiptPurpose: string
  subtotal: number
  setFee: number
  tax: number
  consumptionTax: number
  discount: number
  orders: { menuItem: { id: number; name: string; price: number }; quantity: number; castName?: string }[]
  startTime: string | null
  nominationLabel: string
  /** 会計日時 (新規会計時に保存。古いレコードは再印刷不可) */
  completedAt: string
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
  /**
   * 追補02 R4-3: 事前予定された出勤時刻 (HH:MM)。
   * 実打刻 (clockIn) と異なれば遅刻/早出としてログ可能。
   * null = 飛び込み出勤 (事前予定なし)
   */
  scheduledClockIn?: string | null
}

/**
 * 追補02 R4: 事前出勤予定
 * 時刻到達時にフロントのタイマーが自動的に AttendanceRecord を生成する。
 * 事前登録 → 自動打刻 のフロー用。
 */
export interface AttendanceSchedule {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  date: string              // YYYY-MM-DD
  scheduledClockIn: string  // HH:MM
  /** true になると AttendanceRecord が生成され、AttendanceManager の 「本日の勤怠」に出現 */
  processed?: boolean
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
  { id: 'single-charge', label: 'シングルチャージ', price: 2000, cost: 300 },
  { id: 'douhan', label: '同伴', price: 4000, cost: 300 },
  { id: 'shimei', label: '本指名', price: 1500, cost: 300 },
  { id: 'banai', label: '場内指名', price: 500, cost: 300 },
  { id: 'help', label: 'Help(1名)', price: 4000, cost: 300 },
]

export const SET_DURATION_MINUTES = 60
export const EXTENSION_OPTIONS = [30, 60] as const
export const ALERT_MINUTES = 50
export const ENDING_MINUTES = 10

// ─── ゲスト用ドリンクメニュー ───

export const guestMenuItems: GuestMenuItem[] = [
  // ─── ゲスト飲料(単品) ───
  { id: 105, name: 'ゲストショット', price: 2000, cost: 500, castBack: 0, category: 'guest', subcategory: 'shot' },
  { id: 106, name: 'ピッチャー各種', price: 2000, cost: 800, castBack: 0, category: 'guest', subcategory: 'pitcher' },
  { id: 107, name: 'ゲストビール(中瓶)', price: 1500, cost: 400, castBack: 0, category: 'guest', subcategory: 'beer' },
  { id: 108, name: '割り物各種', price: 600, cost: 100, castBack: 0, category: 'guest', subcategory: 'warimono' },

  // ─── シャンパン(指示書§7.2) ───
  { id: 301, name: 'ヴーヴクリコ イエロー', price: 28000, cost: 12000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 302, name: 'ヴーヴクリコ ロゼ', price: 35000, cost: 15000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 303, name: 'ヴーヴクリコ ホワイト', price: 35000, cost: 15000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 304, name: 'モエ・エ・シャンドン 白', price: 23000, cost: 10000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 305, name: 'モエ・エ・シャンドン ロゼ', price: 29000, cost: 12000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 306, name: 'モエ ネクター', price: 36000, cost: 15000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 307, name: 'モエ ネクター ロゼ', price: 58000, cost: 22000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 308, name: 'モエ アイス 白', price: 45000, cost: 18000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 309, name: 'モエ アイス ロゼ', price: 58000, cost: 22000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 310, name: 'ソウメイ ゴールド', price: 100000, cost: 40000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 311, name: 'ソウメイ オレンジ', price: 140000, cost: 55000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 312, name: 'ソウメイ ロゼ', price: 190000, cost: 75000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 313, name: 'ソウメイ ブラック', price: 450000, cost: 180000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 314, name: 'ペリエ・ジュエ ベル・エポック 白', price: 110000, cost: 42000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 315, name: 'ペリエ・ジュエ ベル・エポック ロゼ', price: 250000, cost: 100000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 316, name: 'アルマンド ゴールド', price: 160000, cost: 65000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 317, name: 'アルマンド ロゼ', price: 250000, cost: 100000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 318, name: 'アルマンド レッド', price: 350000, cost: 140000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 319, name: 'アルマンド グリーン', price: 400000, cost: 160000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 320, name: 'エンジェル ブラック白', price: 160000, cost: 65000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 321, name: 'エンジェル ホワイトロゼ', price: 250000, cost: 100000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 322, name: 'エンジェル ピンク', price: 350000, cost: 140000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 323, name: 'エンジェル ブルー', price: 350000, cost: 140000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 324, name: 'クリスタル 白', price: 220000, cost: 90000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 325, name: 'クリスタル ロゼ', price: 400000, cost: 160000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 326, name: 'サロン (時価)', price: 550000, cost: 220000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 327, name: 'ドン・ペリニヨン 白', price: 90000, cost: 36000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 328, name: 'ドン・ペリニヨン ロゼ', price: 160000, cost: 65000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 329, name: 'ドン・ペリニヨン ゴールド', price: 550000, cost: 220000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 330, name: 'D.ROCK ゴールド', price: 100000, cost: 40000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 331, name: 'D.ROCK ホワイト', price: 130000, cost: 52000, castBack: 0, category: 'guest', subcategory: 'champagne' },
  { id: 332, name: 'D.ROCK ロゼ', price: 160000, cost: 65000, castBack: 0, category: 'guest', subcategory: 'champagne' },

  // ─── ウイスキー(指示書§7.2) ───
  { id: 401, name: 'I.W. ハーパー GOLD MEDAL', price: 12000, cost: 5000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 402, name: 'I.W. ハーパー 12年', price: 35000, cost: 14000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 403, name: '竹鶴', price: 55000, cost: 22000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 404, name: 'ジャックダニエル', price: 15000, cost: 6000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 405, name: 'オールドパー 12年', price: 20000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 406, name: 'バランタイン 12年', price: 30000, cost: 12000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 407, name: 'シーバスリーガル 18年', price: 35000, cost: 14000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 408, name: '宮城峡', price: 30000, cost: 12000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 409, name: '白州', price: 50000, cost: 20000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 410, name: '余市', price: 35000, cost: 14000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 411, name: '山崎', price: 60000, cost: 24000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 412, name: '山崎 12年', price: 130000, cost: 52000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 413, name: '響', price: 60000, cost: 24000, castBack: 0, category: 'guest', subcategory: 'whisky' },
  { id: 414, name: '響 12年', price: 350000, cost: 140000, castBack: 0, category: 'guest', subcategory: 'whisky' },

  // ─── 焼酎(指示書§7.2) ───
  { id: 501, name: '鍛高譚', price: 6000, cost: 2400, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 502, name: '黒霧島', price: 8000, cost: 3200, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 503, name: '赤霧島', price: 8000, cost: 3200, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 504, name: '茜霧島', price: 8000, cost: 3200, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 505, name: '白霧島', price: 8000, cost: 3200, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 506, name: 'いいちこフラスコボトル', price: 12000, cost: 4800, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 507, name: '一刻者(赤)', price: 15000, cost: 6000, castBack: 0, category: 'guest', subcategory: 'shochu' },
  { id: 508, name: '吉四六', price: 15000, cost: 6000, castBack: 0, category: 'guest', subcategory: 'shochu' },

  // ─── ブランデー(指示書§7.2) ───
  { id: 601, name: 'レミーマルタン VSOP', price: 20000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 602, name: 'レミーマルタン XO', price: 75000, cost: 30000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 603, name: 'ヘネシー VSOP', price: 45000, cost: 18000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 604, name: 'ヘネシー XO', price: 75000, cost: 30000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 605, name: 'マーテル VSOP', price: 35000, cost: 14000, castBack: 0, category: 'guest', subcategory: 'brandy' },
  { id: 606, name: 'マーテル コルドンブルー', price: 75000, cost: 30000, castBack: 0, category: 'guest', subcategory: 'brandy' },

  // ─── ワイン(赤)(指示書§7.2) ───
  { id: 701, name: 'ドルーアンラローズ ジュヴレ シャンベルタン', price: 28000, cost: 12000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 702, name: 'サン テステフ ド カロン セギュール', price: 18000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 703, name: 'ルイ ジャド ソンジュ ド バッカス ピノノワール', price: 18000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 704, name: 'ワイ バイ ヨンキ カベルネ ソーヴィニヨン', price: 26000, cost: 10000, castBack: 0, category: 'guest', subcategory: 'wine' },

  // ─── ワイン(白)(指示書§7.2) ───
  { id: 705, name: 'ルイ ジャド ソンジュ ド バッカス シャルドネ', price: 18000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 706, name: 'レザルム ド ラグランジュ', price: 23000, cost: 10000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 707, name: 'ルイ ジャド シャブリ セリエ デュ ヴァルヴァン', price: 20000, cost: 8000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 708, name: 'ウィリアム フェーブル シャブリ 1er クリュ ヴァイヨン', price: 23000, cost: 10000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 709, name: 'ワイ バイ ヨンキ シャルドネ アンコール', price: 26000, cost: 10000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 710, name: 'KENZO EST. あさつゆ', price: 70000, cost: 28000, castBack: 0, category: 'guest', subcategory: 'wine' },
  { id: 711, name: 'オーパスワン', price: 180000, cost: 72000, castBack: 0, category: 'guest', subcategory: 'wine' },
]

// ─── キャスト用ドリンクメニュー ───
// 先方フィードバック (2026-04-23): F (フリー、バック安) / 本 (本指名、バック高) を全系列で区別。
// 価格・CB 単価は暫定値 (FD:1000/200、本D:2000/500 の比率を他の系列に展開)。
// 運用開始前に管理画面から正式値に調整可能。

export const castMenuItems: CastMenuItem[] = [
  // ─── Lドリンク (レディースドリンク) ───
  { id: 201, name: 'Lドリンク (FD)', price: 1000, cost: 200, castBack: 200, category: 'cast', subcategory: 'fdrink', backType: 'FD' },
  { id: 211, name: 'Lドリンク (本D)', price: 2000, cost: 400, castBack: 500, category: 'cast', subcategory: 'hondrink', backType: '本D' },

  // ─── Lカクテル ───
  { id: 202, name: 'Lカクテル (Fカク)', price: 1200, cost: 250, castBack: 300, category: 'cast', subcategory: 'fkaku', backType: 'Fカク' },
  { id: 212, name: 'Lカクテル (本カク)', price: 1500, cost: 300, castBack: 400, category: 'cast', subcategory: 'honkaku', backType: '本カク' },

  // ─── Lショット ───
  { id: 203, name: 'Lショット (Fショ)', price: 1500, cost: 300, castBack: 300, category: 'cast', subcategory: 'fshot', backType: 'Fショ' },
  { id: 213, name: 'Lショット (本ショ)', price: 2000, cost: 400, castBack: 500, category: 'cast', subcategory: 'honshot', backType: '本ショ' },

  // ─── Lピッチャー ───
  { id: 204, name: 'Lピッチャー (FP)', price: 2500, cost: 600, castBack: 300, category: 'cast', subcategory: 'fpitcher', backType: 'FP' },
  { id: 214, name: 'Lピッチャー (本P)', price: 3000, cost: 700, castBack: 500, category: 'cast', subcategory: 'honpitcher', backType: '本P' },

  // ─── Lビール ───
  { id: 205, name: 'Lビール (FB)', price: 1500, cost: 400, castBack: 300, category: 'cast', subcategory: 'fbeer', backType: 'FB' },
  { id: 215, name: 'Lビール (本B)', price: 2000, cost: 500, castBack: 500, category: 'cast', subcategory: 'honbeer', backType: '本B' },

  // ─── 個別銘柄 (現行を維持、本カク/本ショ 系列として継続) ───
  { id: 206, name: 'キティ', price: 1500, cost: 300, castBack: 400, category: 'cast', subcategory: 'honkaku', backType: '本カク' },
  { id: 207, name: 'ミッフィ', price: 1500, cost: 300, castBack: 400, category: 'cast', subcategory: 'honkaku', backType: '本カク' },
  { id: 208, name: 'コカボム', price: 2500, cost: 500, castBack: 500, category: 'cast', subcategory: 'honshot', backType: '本ショ' },
  { id: 209, name: 'クライナー各種', price: 2500, cost: 500, castBack: 500, category: 'cast', subcategory: 'honshot', backType: '本ショ' },
]

export const allMenuItems: MenuItem[] = [...guestMenuItems, ...castMenuItems]

// ─── キャスト一覧 ───

export const casts: Cast[] = [
  {
    id: 1, name: 'あいり', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 2, name: 'みく', hourlyRate: 2000, guaranteeRate: 0.45, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 3, name: 'れな', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 4, name: 'ゆい', hourlyRate: 2000, guaranteeRate: 0.4, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 5, name: 'りさ', hourlyRate: 3000, guaranteeRate: 0.55, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
]

// ─── ユーティリティ ───

/**
 * 注文の表示名。キャスト名が紐づいていれば「本指名あいり」「本カクみく」等を返す。
 */
export function displayOrderName(o: OrderItem): string {
  if (!o.castName) return o.menuItem.name
  // メニュー名末尾が「(FD)」「(本カク)」のような括弧付きの場合、キャスト名をその前に挿入
  const match = o.menuItem.name.match(/^(.*)\s*\(([^)]+)\)\s*$/)
  if (match) return `${match[1]}${o.castName} (${match[2]})`
  return `${o.menuItem.name}${o.castName}`
}

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
  { id: 1, number: '1', status: 'occupied', guestCount: 3, startTime: minutesAgo(30), assignedCasts: ['あいり'], mainNominationCastNames: ['あいり'], setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 2 },
    { menuItem: guestMenuItems[4], quantity: 1 },
  ] },
  { id: 2, number: '2', status: 'occupied', guestCount: 2, startTime: minutesAgo(45), assignedCasts: ['みく'], mainNominationCastNames: [], setCount: 1, orders: [
    { menuItem: castMenuItems[1], quantity: 1 },
    { menuItem: guestMenuItems[7], quantity: 3 },
  ] },
  { id: 3, number: '3', status: 'ending', guestCount: 4, startTime: minutesAgo(55), assignedCasts: ['れな'], mainNominationCastNames: ['れな'], setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 3 },
    { menuItem: castMenuItems[2], quantity: 1 },
    { menuItem: guestMenuItems[5], quantity: 2 },
  ] },
  { id: 4, number: '4', status: 'empty', guestCount: 0, startTime: null, assignedCasts: [], mainNominationCastNames: [], setCount: 0, orders: [] },
  { id: 5, number: '5', status: 'occupied', guestCount: 2, startTime: minutesAgo(15), assignedCasts: ['ゆい'], mainNominationCastNames: [], setCount: 1, orders: [] },
  { id: 6, number: '6', status: 'empty', guestCount: 0, startTime: null, assignedCasts: [], mainNominationCastNames: [], setCount: 0, orders: [] },
  // 卓7: 同伴 + 複数本指名の例 (追補03 R24: 複数本指名対応)
  { id: 7, number: '7', status: 'alert', guestCount: 5, startTime: minutesAgo(52), assignedCasts: ['りさ', 'あいり'], mainNominationCastNames: ['りさ', 'あいり'], isDouhan: true, setCount: 1, orders: [
    { menuItem: castMenuItems[0], quantity: 4 },
    { menuItem: castMenuItems[1], quantity: 2 },
    { menuItem: guestMenuItems[6], quantity: 3 },
  ] },
  { id: 8, number: '8', status: 'empty', guestCount: 0, startTime: null, assignedCasts: [], mainNominationCastNames: [], setCount: 0, orders: [] },
  { id: 9, number: 'VIP1', status: 'occupied', guestCount: 3, startTime: minutesAgo(20), assignedCasts: ['みく', 'ゆい'], mainNominationCastNames: ['みく'], setCount: 1, orders: [] },
  { id: 10, number: 'VIP2', status: 'empty', guestCount: 0, startTime: null, assignedCasts: [], mainNominationCastNames: [], setCount: 0, orders: [] },
]

/**
 * @deprecated 追補02 R1-6 で指名タイプ選択欄は廃止。
 * 新規実装では `utils/nomination.ts#getNominationLabel(table)` を使用する。
 * 既存の BillingRecord.receiptSnapshot.nominationLabel 互換のため残置。
 */
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

// 推移グラフ用に過去365日分のダミー会計データを生成
// 月を跨ぐように、曜日による変動・月による変動を含む
function generateHistoricalBillings(): BillingRecord[] {
  const result: BillingRecord[] = []
  let id = 1
  const today = new Date()
  // 過去365日
  for (let daysAgo = 365; daysAgo >= 1; daysAgo--) {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    const dow = d.getDay()
    // 日曜はほぼ休業、月火は少なめ、金土は繁盛
    if (dow === 0) continue
    const base = dow === 5 || dow === 6 ? 8 : dow === 1 || dow === 2 ? 3 : 5
    // 月による変動 (12月は稼ぎ時、2月は閑散期)
    const m = d.getMonth() + 1
    const monthFactor = m === 12 ? 1.5 : m === 2 ? 0.7 : 1.0
    const tableCount = Math.max(1, Math.round(base * monthFactor + (id % 3)))
    const dateStr = d.toISOString().slice(0, 10)
    for (let t = 0; t < tableCount; t++) {
      const payType = (id + t) % 3
      const total = 30000 + ((id * 7 + t * 13) % 50) * 1000
      const method: BillingRecord['paymentMethod'] = payType === 0 ? 'cash' : payType === 1 ? 'card' : 'mixed'
      const cashAmount = method === 'cash' ? total : method === 'mixed' ? Math.floor(total * 0.6) : 0
      const cardAmount = method === 'card' ? total : method === 'mixed' ? total - cashAmount : 0
      const cardFee = method === 'card' || method === 'mixed' ? Math.floor(cardAmount * 0.1) : undefined
      // キャスト5人の売上を分散(一部は本指名扱い、残りはフリーだが担当は記録)
      const isShimei = (id + t) % 3 === 0
      const castName = ['あいり', 'みく', 'れな', 'ゆい', 'りさ'][(id + t) % 5]
      const nominatedCastId = isShimei ? ((id + t) % 5) + 1 : undefined
      const castsForTable = [castName]  // 本指名/フリー問わず担当を記録
      result.push({
        id: id++,
        tableNumber: String(((id + t) % 10) + 1),
        total,
        paymentMethod: method,
        cashAmount: method !== 'card' ? cashAmount : undefined,
        cardAmount: method !== 'cash' ? cardAmount : undefined,
        cardFee,
        timestamp: `${20 + Math.floor(t / 3)}:${String((t * 15) % 60).padStart(2, '0')}`,
        date: dateStr,
        nominatedCastId,
        subtotalBeforeTax: Math.floor(total / 1.2),  // TAX 20%相当を除いた推定小計
        castNamesSnapshot: castsForTable,
      })
    }
  }
  return result
}

export const initialBillingRecords: BillingRecord[] = generateHistoricalBillings()

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
  storeName: "CLUB GALAXY",
  storeAddress: '山形県山形市香澄町1-2-3',
  storePhone: '023-654-XXXX',
  invoiceNumber: 'T5390001005970',
}

// ─── 勤怠ダミーデータ ───

export const initialAttendanceRecords: AttendanceRecord[] = [
  { id: 1, staffId: 1, staffName: 'あいり', staffType: 'cast', date: '2026-04-14', clockIn: '20:00', clockOut: null, breakMinutes: 0, workHours: 0 },
  { id: 2, staffId: 3, staffName: 'れな', staffType: 'cast', date: '2026-04-14', clockIn: '20:30', clockOut: null, breakMinutes: 0, workHours: 0 },
]

// ─── 経費ダミーデータ ───

function generateHistoricalExpenses(): Expense[] {
  const result: Expense[] = []
  let id = 1
  const today = new Date()
  const categories: ExpenseCategory[] = ['仕入れ（酒等）', '税金', '雑費']
  for (let daysAgo = 365; daysAgo >= 1; daysAgo -= 3) {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    const dateStr = d.toISOString().slice(0, 10)
    const cat = categories[id % 3]
    const amount = cat === '仕入れ（酒等）' ? 15000 + (id % 5) * 3000 : cat === '税金' ? 80000 : 3000 + (id % 4) * 1000
    result.push({
      id: id++,
      amount,
      category: cat,
      note: cat === '仕入れ（酒等）' ? '酒類仕入れ' : cat === '税金' ? '消費税等' : '雑費',
      source: id % 2 === 0 ? 'register' : 'transfer',
      date: dateStr,
      timestamp: '18:30',
    })
  }
  return result
}

export const initialExpenses: Expense[] = generateHistoricalExpenses()

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
