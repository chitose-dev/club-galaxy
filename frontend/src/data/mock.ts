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
  /**
   * @deprecated 延長料金を紐付けたキャスト名（旧: 単一指名）。
   * 後方互換のため残置。新規書込みは nominatedCastNames[0] と同じ値が入る。
   */
  nominatedCastName?: string
  /** 延長時に指名した全キャスト（複数選択対応、空配列ならフリー） */
  nominatedCastNames?: string[]
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
  /** ボトルバック計算用の単価（円、税抜き）。未指定なら `price` を使う。
   *  G PR で導入する「販売価格0円・任意バック金額のボトル」を表現するため、
   *  本指名ボトルバックの基準額計算 (`calcChampagneSplit`) のみで参照される。
   *  通常メニューでは未指定。 */
  bottleBackBasePerUnit?: number
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
 * 追補02 R5-2/R5-3: メニューカテゴリのマスター。
 * 並び替え・非表示・追加を管理画面から制御するため、subcategory に対応する
 * ラベルと表示順序をデータとして保持する。
 *
 * 既存メニューの subcategory enum (固定) と独立して、追加カテゴリは
 * customSubcategoryId (任意) として扱う。新規追加メニューはこの ID を
 * subcategory に持つ仮想カテゴリとして OrderPage に表示される。
 */
export interface MenuCategory {
  /** kind が 'guest' なら GuestMenuItem.subcategory、'cast' なら CastMenuItem.subcategory に対応 */
  kind: 'guest' | 'cast'
  /** subcategory 値 (例: 'shochu', 'fdrink', 'custom-no-alcohol') */
  id: string
  /** 表示ラベル (例: '焼酎', 'Lドリンク(F)', 'ノンアルコール') */
  label: string
  /** 並び順 (昇順) */
  order: number
  /** true = 非表示 */
  hidden?: boolean
  /** ユーザーが追加したカテゴリは true (削除可能の判定用) */
  custom?: boolean
}

export const initialMenuCategories: MenuCategory[] = [
  // ゲスト
  { kind: 'guest', id: 'shochu', label: '焼酎', order: 1 },
  { kind: 'guest', id: 'whisky', label: 'ウイスキー', order: 2 },
  { kind: 'guest', id: 'brandy', label: 'ブランデー', order: 3 },
  { kind: 'guest', id: 'champagne', label: 'シャンパン', order: 4 },
  { kind: 'guest', id: 'wine', label: 'ワイン', order: 5 },
  { kind: 'guest', id: 'shot', label: 'ショット', order: 6 },
  { kind: 'guest', id: 'pitcher', label: 'ピッチャー', order: 7 },
  { kind: 'guest', id: 'beer', label: 'ビール', order: 8 },
  { kind: 'guest', id: 'warimono', label: '割り物', order: 9 },
  // キャスト
  { kind: 'cast', id: 'fdrink', label: 'Lドリンク(F)', order: 10 },
  { kind: 'cast', id: 'hondrink', label: 'Lドリンク(本)', order: 11 },
  { kind: 'cast', id: 'fkaku', label: 'Lカクテル(F)', order: 12 },
  { kind: 'cast', id: 'honkaku', label: 'Lカクテル(本)', order: 13 },
  { kind: 'cast', id: 'honkakuW', label: 'Lカクテル(本W)', order: 14 },
  { kind: 'cast', id: 'fshot', label: 'Lショット(F)', order: 15 },
  { kind: 'cast', id: 'honshot', label: 'Lショット(本)', order: 16 },
  { kind: 'cast', id: 'fpitcher', label: 'Lピッチャー(F)', order: 17 },
  { kind: 'cast', id: 'honpitcher', label: 'Lピッチャー(本)', order: 18 },
  { kind: 'cast', id: 'fbeer', label: 'Lビール(F)', order: 19 },
  { kind: 'cast', id: 'honbeer', label: 'Lビール(本)', order: 20 },
]

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
  /** APIから受け取る場合のみ存在（バック側でtx内連番採番） */
  id?: number
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
  /**
   * ISSUE-007: 直近の出勤打刻時刻 (active=false → true になった瞬間)。
   *  - ルーズタイム判定 (出勤後 15 分以内) に使用。
   *  - 14 分以内に退勤した場合、勤怠は給与計算対象外として扱う。
   */
  lastClockInAt?: string | null
}

export interface SetPrice {
  id: string
  label: string
  price: number
  cost: number
}

// ─── 会計関連 ───

/**
 * PDF C: 領収書の任意分割発行記録。
 *
 * 1 つの会計（BillingRecord）から人数分まで複数枚の領収書を発行できる仕様。
 * 各領収書は金額・宛名・但し書きが独立で、発行金額の合計が会計総額と
 * 一致しないケース（一部の客だけ領収書をもらう等）も許容する。
 *
 * 発行履歴は監査・再印刷の両方を見据えて完全スナップショットで保存:
 * - 金額/宛名/但し書き/発行日時/発行者/元会計ID/枝番
 * - 店舗情報（storeName/Address/Phone）も発行時の値を固定で残す
 */
export interface IssuedReceipt {
  /** 一意 ID（タイムスタンプベース、または UUID 相当） */
  id: string
  /** 元の BillingRecord.id への参照 */
  billingRecordId: string
  /** 元の会計に紐付く卓番（表示用、検索容易化のため重複保持） */
  tableNumber: string
  /** 1 つの会計内での枝番（1..N, N=guestCount まで）。表示順保持。 */
  sequenceIndex: number
  /** 発行金額（円、自由入力） */
  amount: number
  /** 宛名（空欄なら「上様」相当） */
  recipientName: string
  /** 但し書き（空欄なら「飲食代として」相当） */
  purpose: string
  /** 発行日時（ISO 8601） */
  issuedAt: string
  /** 発行者（ログインユーザー displayName ?? 'スタッフ'） */
  issuedBy: string
  /** 発行時の店舗情報スナップショット（PDF: 店舗情報は設定変更可、
   *  記録時点の値を残しておく方が監査・再印刷で安全）。 */
  storeSettingsSnapshot: {
    storeName: string
    storeAddress: string
    storePhone: string
  }
}

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
  id: string
  tableNumber: string
  total: number
  paymentMethod: 'cash' | 'card' | 'mixed'
  cashAmount?: number
  cardAmount?: number
  cardFee?: number
  /** ISO 8601 会計完了日時 */
  completedAt: string
  date?: string               // YYYY-MM-DD (月年別集計用、省略時は今日扱い)
  /** YYYY-MM-DD 形式の JST 営業日。バックエンドが nowJstIso ベースで付与。
   *  集計時は businessDate を優先参照することで、UTC 起点の date が前日付に
   *  なる JST 深夜 0〜9 時の問題を回避する。 */
  businessDate?: string
  /** 本指名卓の場合の担当キャストID (指示書§5.2: 売上重畳のため、後方互換で先頭1名) */
  nominatedCastId?: number
  /** spec.md §5.5: 本指名キャスト全員分の ID（複数本指名対応）。
   *  会計確定時に Table.mainNominationCastNames から resolve したスナップショット。 */
  nominatedCastIdsSnapshot?: number[]
  /** TAX前の小計(保証計算・売上重畳に使用) */
  subtotalBeforeTax?: number
  /** 担当キャスト名(集計表示用) */
  castNamesSnapshot?: string[]
  /** spec.md §5.5 売上帰属スナップショット（会計時計算）。
   *  会計時の Table.mainNominationCastNames で subtotalBeforeTax を均等按分した結果。
   *  キー = キャスト名、値 = そのキャストへの帰属売上（円）。
   *  本指名がいない卓（フリー）は空オブジェクト or 未設定（誰にも帰属しない）。
   *  集計時は salesAttributionByCast[castName] を優先参照。 */
  salesAttributionByCast?: Record<string, number>
  /** 会計履歴からの再印刷用スナップショット */
  receiptSnapshot?: ReceiptSnapshot
  /** 未収（代金未収受）フラグ。誤開卓・トラブル等で代金回収できず退卓した場合に true */
  isUncollected?: boolean
  /** 未収ステータス（オーナーが管理画面で更新）。
   *  - pending: 未収発生直後、判定待ち
   *  - written_off: 確定未収（事由を記録）
   *  - recovered: 後日回収完了（通常会計として処理） */
  uncollectedStatus?: 'pending' | 'written_off' | 'recovered'
  /** 確定未収（written_off）時の事由。例: 客が支払わず逃走、誤開卓、等 */
  uncollectedReason?: string
  /** 確定未収にした日時（ISO） */
  writtenOffAt?: string
  /** レジ締め時に相殺済みかどうか（締め処理で参照） */
  settledOff?: boolean
  /** 取消（void）情報 — 設計書 §3.1.1 / §6。
   *  voidedAt が立っている記録は売上集計から除外される。
   *  レジ締め後の取消は禁止（reopen 必須）。 */
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  /** 延長履歴のスナップショット（バック按分集計用）。
   *  会計確定時に Table.extensionHistory をコピーして保存する。
   *  computeDailyWork が nominatedCastNames を参照して本指名バックを
   *  キャスト均等割り（端数切り捨て）で extensionBackAmount に集計する。
   *  nominatedCastNames が空（フリー延長）の entry はバック付与なし。 */
  extensionHistorySnapshot?: ExtensionEntry[]
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
  /**
   * 各注文の menuItem スナップショット。再印刷だけでなく、後段の
   * ボトルバック計算（A2）でも参照するため、subcategory / backType /
   * bottleBackBasePerUnit も保存する。古いレコードは subcategory が
   * undefined のため、参照側で安全に空判定を行うこと。
   */
  orders: {
    menuItem: {
      id: number
      name: string
      price: number
      /** ボトル/カクテル等のサブカテゴリ。bottle 系の判定に使う。 */
      subcategory?: string
      /** バック種別。'ボトルバック' のとき本指名割勘ボトルバックの対象。 */
      backType?: BackType
      /** ボトルバック計算用の単価上書き（0円ボトル用、G PR で使用）。 */
      bottleBackBasePerUnit?: number
    }
    quantity: number
    castName?: string
  }[]
  startTime: string | null
  nominationLabel: string
  /** 会計日時 (新規会計時に保存。古いレコードは再印刷不可) */
  completedAt: string
  /** 会計確定時点の本指名キャスト名スナップショット。
   *  ボトルバック配分（本指名のみ対象）の集計元として A2 で導入。
   *  Table.mainNominationCastNames を会計時にディープコピーして保存し、
   *  以後のキャスト名変更に影響されないようにする。
   *  未指定（旧レコード）はフリー卓扱い = ボトルバック対象なし。 */
  mainNominationCastNamesSnapshot?: string[]
}

// ─── 給与関連 ───

export interface DailyWork {
  date: string
  hours: number
  backs: Partial<Record<BackType, number>>
  sales: number // その日の個人売上小計
  /** 延長指名のバック合計（円）。computeDailyWork が
   *  billingRecords[i].extensionHistorySnapshot から
   *  cast.backRates['本指名'] を nominatedCastNames.length で均等割り
   *  （端数切り捨て）して集計する。フリー延長（nominatedCastNames=[]）は加算しない。 */
  extensionBackAmount?: number
  /** 本指名ボトルバックの合計（円、A2）。
   *  computeDailyWork が receiptSnapshot.mainNominationCastNamesSnapshot に
   *  当該キャストが含まれるレシートを抽出し、bottle系の orders の小計を
   *  `calcChampagneSplit` で配分した結果（当該キャスト分）を加算する。
   *  `backs['ボトルバック']` は表示用にカウントは残すが金額計算には使わない
   *  （旧 `count × rate` 算出は廃止、bottleBackAmount が正本）。 */
  bottleBackAmount?: number
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
  /** 1日あたり固定人件費 (ボーイ等) default 28800。FL計算の労務費に加算 */
  staffFixedCost: number
  /** spec.md §5.2.2: 延長 30 分料金（人数 × 単価ではなく1セット分の延長料金として扱う）。
   *  default ¥3,000。半額固定（¥2,000）はやめる。 */
  extensionPrice30Min: number
  /** spec.md §5.2.2: 延長 60 分料金。デフォルトは時間帯別セット料金と同額の運用想定。
   *  ここでは固定値で持つ（時間帯別はオープン課題、初期値は 22:00〜 の ¥5,000）。 */
  extensionPrice60Min: number
}

// ─── 日報 ───

export interface DailyReport {
  id: number
  date: string               // YYYY-MM-DD
  /** 設計書 §6: businessDate（バックエンドの doc ID）。
   *  既存データは date と同値として扱える。reopen API は businessDate を URL に取る。 */
  businessDate?: string
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
  /** 締めた時刻。reopen 後は null。設計書 §6 */
  closedAt?: string | null
  reopenedAt?: string
  reopenedBy?: string
  reopenReason?: string
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

/** spec.md §2.2.1: 卓詳細モーダル内の「注文（n品）」表示で除外する charge/指名系の品名集合。
 *  注文画面で chargeItems を OrderItem 化する際は menuItem.name = label、
 *  ヘルプ専用 HELP_GUEST_ITEM は name = 'ヘルプ' で追加されるため、name で判定する。 */
const CHARGE_AND_NOMINATION_NAMES: ReadonlySet<string> = new Set([
  'シングルチャージ', '同伴', '本指名', '場内指名', 'Help(1名)', 'ヘルプ',
])

/** 卓詳細モーダルで指名情報を二重表示しないためのフィルタ判定。
 *  true = 指名/同伴/Help/ヘルプ系（ホール画面で別途表示済）→ 注文一覧からは隠す。 */
export function isChargeOrNominationOrder(item: { menuItem: { name: string } }): boolean {
  return CHARGE_AND_NOMINATION_NAMES.has(item.menuItem.name)
}

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
  // ビデオレビュー D1: 「キティ・ミッフィ・コカボム・クライナー」はカテゴリ違い (ショット系) のため削除済
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
  {
    id: 6, name: 'まな', hourlyRate: 2200, guaranteeRate: 0.45, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 7, name: 'ひな', hourlyRate: 2000, guaranteeRate: 0.4, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800, 'Fショ': 300, '本ショ': 500, 'FP': 300, '本P': 500, 'FB': 300, '本B': 500, '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 10, 'ヘルプ': 4000 },
  },
  {
    id: 8, name: 'ゆずき', hourlyRate: 2500, guaranteeRate: 0.5, active: true,
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
      const hour = 20 + Math.floor(t / 3)
      const minute = String((t * 15) % 60).padStart(2, '0')
      result.push({
        id: String(id++),
        tableNumber: String(((id + t) % 10) + 1),
        total,
        paymentMethod: method,
        cashAmount: method !== 'card' ? cashAmount : undefined,
        cardAmount: method !== 'cash' ? cardAmount : undefined,
        cardFee,
        completedAt: `${dateStr}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`,
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
  staffFixedCost: 28800,
  // spec.md §5.2.2: 延長料金デフォルト
  extensionPrice30Min: 3000,
  extensionPrice60Min: 5000,
}

// ─── アカウント型 ───

export interface UserAccount {
  username: string
  pin: string
  role: 'owner' | 'staff' | 'cast'
  castId?: number
  displayName: string
  /** ボーイ(staff)の時給。給与計算に使用 */
  hourlyRate?: number
}
