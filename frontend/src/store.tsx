import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { tablesApi } from './api/tables'
import { castsApi } from './api/casts'
import { billingApi } from './api/billing'
import { payrollApi } from './api/payroll'
import { menuApi } from './api/menu'
import { settingsApi } from './api/settings'
import { authApi } from './api/auth'
import { dailyReportsApi } from './api/dailyReports'
import { attendanceApi } from './api/attendance'
import { expensesApi } from './api/expenses'
import { advancesApi } from './api/advances'
import { archiveApi } from './api/archive'
import { ApiError } from './api/client'
import {
  guestMenuItems as initialGuestMenu,
  castMenuItems as initialCastMenu,
  setPrices as initialSetPrices,
  chargeItems as initialChargeItems,
  initialMenuCategories,
  type MenuCategory,
  defaultStoreSettings,
  type Table,
  type Cast,
  type GuestMenuItem,
  type CastMenuItem,
  type SetPrice,
  type OrderItem,
  type DiscountLog,
  type AttendanceEditLog,
  type IssuedReceipt,
  type BillingRecord,
  type DailyPayRequest,
  type BottleKeep,
  type Deduction,
  type StoreSettings,
  type UserAccount,
  type AttendanceRecord,
  type AttendanceSchedule,
  type Expense,
  type AdvancePayment,
  type ArchivedData,
  type DailyReport,
} from './data/mock'

export interface FLMetrics {
  todaySales: number
  foodCost: number
  laborCost: number
  /** カード会社への決済手数料 (店舗経費) */
  cardProcessingCost: number
  flRate: number
  todayProfit: number
  monthlyProfit: number
  monthlyFlRate: number
}

interface Store {
  /** 起動時 API fetch で主要 endpoint がすべて失敗したフラグ（接続断/サーバ停止検知用） */
  fetchFailed: boolean
  /** 起動時 fetch が完了するまで true。loading 中はキャッシュ値があれば使う */
  loading: boolean
  tables: Table[]
  casts: Cast[]
  guestMenu: GuestMenuItem[]
  castMenu: CastMenuItem[]
  setPrices: SetPrice[]
  chargeItems: SetPrice[]
  discountLogs: DiscountLog[]
  /** PDF C: 分割発行された領収書履歴。新→古順で蓄積。 */
  issuedReceipts: IssuedReceipt[]
  /** 勤怠 (AttendanceRecord) 修正履歴。新→古順で蓄積。 */
  attendanceEditLogs: AttendanceEditLog[]
  billingRecords: BillingRecord[]
  dailyPayRequests: DailyPayRequest[]
  bottleKeeps: BottleKeep[]
  deductions: Deduction[]
  storeSettings: StoreSettings
  updateTable: (id: number, patch: Partial<Table>) => void
  /**
   * キャストを卓間/待機とで排他的に移動させる (追補02 R2, R10)。
   * toTableId = null で待機 (どの卓からも外す)。
   * 本指名担当のマークは元の卓に残る (R10-4)。
   */
  moveCast: (castName: string, toTableId: number | null) => void
  addOrderToTable: (tableId: number, order: OrderItem) => void
  removeOrderFromTable: (tableId: number, menuItemId: number, castName?: string) => void
  /**
   * 追補03 R18: 注文行にボーナス情報をセット / 解除する。
   * bonusCastName / bonusAmount を undefined にすると解除。
   */
  setOrderBonus: (tableId: number, menuItemId: number, castName: string | undefined, bonus: { bonusCastName?: string; bonusAmount?: number }) => void
  resetTable: (id: number) => void
  addDiscountLog: (log: DiscountLog) => void
  /** PDF C: 分割発行された領収書を 1 件記録する。 */
  addIssuedReceipt: (receipt: IssuedReceipt) => void
  /** 勤怠修正監査ログを 1 件記録する。 */
  addAttendanceEditLog: (log: AttendanceEditLog) => void
  addBillingRecord: (record: BillingRecord) => void
  /** 未収管理用の部分更新。owner only。楽観的に local state に反映してから API。 */
  updateBillingRecord: (id: string, patch: Partial<Pick<BillingRecord,
    'uncollectedStatus' | 'uncollectedReason' | 'writtenOffAt' | 'settledOff'
  >>) => void
  /** 取消（void）。owner only、設計書 §3.1.1 / §6。
   *  reason は必須。締め後 (DailyReport.closedAt) は 422 ALREADY_CLOSED で reject。 */
  voidBillingRecord: (id: string, reason: string) => Promise<void>
  addDailyPayRequest: (req: DailyPayRequest) => void
  setCasts: React.Dispatch<React.SetStateAction<Cast[]>>
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
  /** 追補02 R5-2/R5-3: メニューカテゴリ管理 */
  menuCategories: MenuCategory[]
  setMenuCategories: React.Dispatch<React.SetStateAction<MenuCategory[]>>
  setSetPrices: React.Dispatch<React.SetStateAction<SetPrice[]>>
  setChargeItems: React.Dispatch<React.SetStateAction<SetPrice[]>>
  setTables: React.Dispatch<React.SetStateAction<Table[]>>
  addBottleKeep: (keep: BottleKeep) => void
  updateBottleKeep: (id: number, patch: Partial<BottleKeep>) => void
  removeBottleKeep: (id: number) => void
  setDeductions: React.Dispatch<React.SetStateAction<Deduction[]>>
  reorderTables: (fromIndex: number, toIndex: number) => void
  setStoreSettings: React.Dispatch<React.SetStateAction<StoreSettings>>
  userAccounts: UserAccount[]
  /**
   * userAccount を作成する。楽観的に local state に追加した後、
   * authApi.createUser を await。失敗時は楽観追加を rollback して throw。
   * 呼び出し元は await して try/catch でエラーをハンドリングできる。
   */
  addUser: (user: UserAccount) => Promise<void>
  updateUser: (username: string, patch: Partial<UserAccount>) => void
  deleteUser: (username: string) => void
  flMetrics: FLMetrics
  // 勤怠管理
  attendanceRecords: AttendanceRecord[]
  addAttendance: (record: AttendanceRecord) => void
  updateAttendance: (id: number, patch: Partial<AttendanceRecord>) => void
  // 追補02 R4: 事前出勤予定
  attendanceSchedules: AttendanceSchedule[]
  addAttendanceSchedule: (s: AttendanceSchedule) => void
  removeAttendanceSchedule: (id: number) => void
  markScheduleProcessed: (id: number) => void
  // 経費管理
  expenses: Expense[]
  addExpense: (expense: Expense) => void
  removeExpense: (id: number) => void
  // 前借り管理
  advancePayments: AdvancePayment[]
  addAdvancePayment: (payment: AdvancePayment) => void
  // アーカイブ
  archivedData: ArchivedData[]
  archiveOldData: (beforeDate: string) => void
  // 日報
  dailyReports: DailyReport[]
  addDailyReport: (report: DailyReport) => void
  removeDailyReport: (id: number) => void
  /** reopen 後など local state を直接更新したい場合に使う raw setter。
   *  AdminPage > 日報・レジ締めタブから利用。 */
  setDailyReports: React.Dispatch<React.SetStateAction<DailyReport[]>>
  // 伝票番号カウンター
  nextReceiptNumber: number
  getNextReceiptNumber: () => number
}

const StoreContext = createContext<Store | null>(null)

/**
 * localStorage キャッシュ
 * Firestore は読み込みが遅いため、起動時にキャッシュから即時表示 → fetch 完了後に上書き。
 * 対象は変動が緩やかなマスター系 (tables/casts/menu/settings)。
 */
const CACHE_KEY = 'galaxy_cache_v1'

interface CacheShape {
  tables?: Table[]
  casts?: Cast[]
  guestMenu?: GuestMenuItem[]
  castMenu?: CastMenuItem[]
  menuCategories?: MenuCategory[]
  setPrices?: SetPrice[]
  chargeItems?: SetPrice[]
  storeSettings?: StoreSettings
}

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CacheShape
  } catch {
    return {}
  }
}

function saveCache(patch: CacheShape) {
  try {
    const current = loadCache()
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {
    // localStorage 書き込み失敗は無視（容量超過等）
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const cache = loadCache()
  // 初期値: キャッシュがあれば使う、なければ空 / mock 初期値（モック初期値は menu 系のみ残置）
  const [tables, setTables] = useState<Table[]>(cache.tables ?? [])
  // Day 2: PUT sync wrap のため raw state setter は ...Raw 名で受ける
  const [casts, setCastsRaw] = useState<Cast[]>(cache.casts ?? [])
  const [guestMenu, setGuestMenuRaw] = useState<GuestMenuItem[]>(cache.guestMenu ?? initialGuestMenu)
  const [castMenu, setCastMenuRaw] = useState<CastMenuItem[]>(cache.castMenu ?? initialCastMenu)
  const [menuCategories, setMenuCategoriesRaw] = useState<MenuCategory[]>(cache.menuCategories ?? initialMenuCategories)
  const [setPricesState, setSetPricesRaw] = useState<SetPrice[]>(cache.setPrices ?? initialSetPrices)
  const [chargeItemsState, setChargeItemsRaw] = useState<SetPrice[]>(cache.chargeItems ?? initialChargeItems)
  const [discountLogs, setDiscountLogs] = useState<DiscountLog[]>([])
  // PDF C: 分割発行領収書履歴。最新を先頭に push する（履歴表示時に降順で出すため）。
  const [issuedReceipts, setIssuedReceipts] = useState<IssuedReceipt[]>([])
  // 勤怠修正監査ログ。新→古順。
  const [attendanceEditLogs, setAttendanceEditLogs] = useState<AttendanceEditLog[]>([])
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([])
  const [dailyPayRequests, setDailyPayRequests] = useState<DailyPayRequest[]>([])
  const [bottleKeeps, setBottleKeeps] = useState<BottleKeep[]>([])
  const [deductions, setDeductionsRaw] = useState<Deduction[]>([])
  const [storeSettings, setStoreSettingsRaw] = useState<StoreSettings>(cache.storeSettings ?? defaultStoreSettings)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>([])
  const [archivedData, setArchivedData] = useState<ArchivedData[]>([])
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [nextReceiptNumber, setNextReceiptNumber] = useState(1001)
  const [fetchFailed, setFetchFailed] = useState(false)
  // キャッシュがある場合は loading=false で即座にキャッシュ値を表示し、
  // バックグラウンドで fetch して完了次第データ更新する。
  // キャッシュなしの初回起動のみ「読み込み中...」を表示。
  const hasCache = Object.keys(cache).length > 0
  const [loading, setLoading] = useState(!hasCache)

  // ── Day 2: PUT sync 付き setter ────────────────────────────────────
  // AdminPage / SalaryPage が `setX(arr)` or `setX((prev) => updated)` で更新した時点で
  // 自動的にバック側へ PUT replace-all を投げる。失敗時は console.error（state は更新済み）。
  // moveCast 等の内部呼び出しでも sync が走るが、cast/menu マスター更新頻度は低く許容。
  const setCasts = useCallback<React.Dispatch<React.SetStateAction<Cast[]>>>((value) => {
    setCastsRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: Cast[]) => Cast[])(prev) : value
      castsApi.replaceAll(next).catch(console.error)
      return next
    })
  }, [])
  const setGuestMenu = useCallback<React.Dispatch<React.SetStateAction<GuestMenuItem[]>>>((value) => {
    setGuestMenuRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: GuestMenuItem[]) => GuestMenuItem[])(prev) : value
      menuApi.replaceGuest(next).catch(console.error)
      return next
    })
  }, [])
  const setCastMenu = useCallback<React.Dispatch<React.SetStateAction<CastMenuItem[]>>>((value) => {
    setCastMenuRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: CastMenuItem[]) => CastMenuItem[])(prev) : value
      menuApi.replaceCast(next).catch(console.error)
      return next
    })
  }, [])
  const setMenuCategories = useCallback<React.Dispatch<React.SetStateAction<MenuCategory[]>>>((value) => {
    setMenuCategoriesRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: MenuCategory[]) => MenuCategory[])(prev) : value
      menuApi.replaceCategories(next).catch(console.error)
      return next
    })
  }, [])
  const setSetPrices = useCallback<React.Dispatch<React.SetStateAction<SetPrice[]>>>((value) => {
    setSetPricesRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: SetPrice[]) => SetPrice[])(prev) : value
      menuApi.replaceSetPrices(next).catch(console.error)
      return next
    })
  }, [])
  const setChargeItems = useCallback<React.Dispatch<React.SetStateAction<SetPrice[]>>>((value) => {
    setChargeItemsRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: SetPrice[]) => SetPrice[])(prev) : value
      menuApi.replaceCharges(next).catch(console.error)
      return next
    })
  }, [])
  const setDeductions = useCallback<React.Dispatch<React.SetStateAction<Deduction[]>>>((value) => {
    setDeductionsRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: Deduction[]) => Deduction[])(prev) : value
      payrollApi.replaceDeductions(next).catch(console.error)
      return next
    })
  }, [])
  const setStoreSettings = useCallback<React.Dispatch<React.SetStateAction<StoreSettings>>>((value) => {
    setStoreSettingsRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: StoreSettings) => StoreSettings)(prev) : value
      settingsApi.update(next).catch(console.error)
      return next
    })
  }, [])

  // ── 起動時 API fetch ──────────────────────────────────────────────────
  // authToken があれば backend からデータを並行 fetch。
  // 主要 endpoint (tables/casts/billing/menu系/settings) が「全件失敗」した場合のみ
  // fetchFailed=true を立て、ルートでフルスクリーンエラー画面に切替える。
  // 個別 fetch 失敗は state 空のまま（モックフォールバックなし）。
  // fetch 完了後は setLoading(false) を呼び、キャッシュを更新。
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      // 未ログインの場合は fetch 不要、loading も解除
      setLoading(false)
      return
    }
    // 起動時 GET は wrap 版（PUT sync 付き）ではなく Raw setter を使う
    // wrap 版だと取得直後に全件 PUT replace-all が走り、不要な API 往復 + 上書きが発生する
    // 同時に fetch 成功分はキャッシュへ保存。次回起動時はキャッシュを初期値として使用。
    const criticalFetches: Promise<unknown>[] = [
      tablesApi.list().then((v) => { setTables(v); saveCache({ tables: v }) }),
      castsApi.list().then((v) => { setCastsRaw(v); saveCache({ casts: v }) }),
      billingApi.list({ limit: 1000 }).then(setBillingRecords),
      menuApi.listGuest().then((v) => { setGuestMenuRaw(v); saveCache({ guestMenu: v }) }),
      menuApi.listCast().then((v) => { setCastMenuRaw(v); saveCache({ castMenu: v }) }),
      menuApi.listSetPrices().then((v) => { setSetPricesRaw(v); saveCache({ setPrices: v }) }),
      menuApi.listCharges().then((v) => { setChargeItemsRaw(v); saveCache({ chargeItems: v }) }),
      menuApi.listCategories().then((v) => { setMenuCategoriesRaw(v); saveCache({ menuCategories: v }) }),
      settingsApi.get().then((v) => { setStoreSettingsRaw(v); saveCache({ storeSettings: v }) }),
    ]
    const otherFetches: Promise<unknown>[] = [
      payrollApi.listDailyPayments().then(setDailyPayRequests),
      payrollApi.listDeductions().then(setDeductionsRaw),
      attendanceApi.list().then((res) => setAttendanceRecords(res.data)),
      expensesApi.list().then(setExpenses),
      advancesApi.list().then(setAdvancePayments),
      dailyReportsApi.list().then(setDailyReports),
      authApi.listUsers().then(setUserAccounts),
      billingApi.listDiscounts().then(setDiscountLogs),
    ]
    void Promise.allSettled([...criticalFetches, ...otherFetches]).then((results) => {
      const criticalResults = results.slice(0, criticalFetches.length)
      const allCriticalFailed = criticalResults.every((r) => r.status === 'rejected')
      if (allCriticalFailed) {
        // 全件失敗が「token 期限切れ (401)」なら fetchFailed エラー画面ではなく
        // /login へリダイレクト。ネットワーク障害等の他失敗は従来どおり fetchFailed=true。
        const all401 = criticalResults.every(
          (r) => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401,
        )
        if (all401) {
          localStorage.removeItem('authToken')
          localStorage.removeItem('club-galaxy-auth')
          window.location.href = '/login'
          return
        }
        setFetchFailed(true)
      }
      setLoading(false)
    })
  }, [])

  // Fix D (ふうや指摘): 旧実装は local state のみ更新で backend に保存して
  //   いなかった。卓詳細から本指名・同伴・場内指名・assignedCasts 等を変更
  //   しても backend に反映されず、リロードや別端末で消える + 会計時に
  //   Fix B の独立計算が古い状態で行われる問題があった。
  //   updateTable 経由の変更は全て tablesApi.update(PATCH) で backend へ同期。
  // Fix E (task ③ 反映バグ対策): 楽観的更新を localStorage キャッシュにも反映する。
  //   そうしないと「タブレットで本指名トグル → そのままアプリ再起動」した場合、
  //   起動時に古いキャッシュ→ API fetch の順で復元され、ごく短時間だが
  //   旧状態が画面に出る上、API fetch 失敗時には旧状態のまま固定されてしまう。
  const updateTable = useCallback((id: number, patch: Partial<Table>) => {
    setTables((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      saveCache({ tables: next })
      return next
    })
    tablesApi.update(id, patch).catch(console.error)
  }, [])

  /**
   * 追補02 R2/R10: キャストを卓間で排他的に移動。
   * 全ての卓の assignedCasts から対象を除外した後、移動先に追加する。
   * 本指名担当の紐付け (mainNominationCastNames) は変更しない (R10-4)。
   */
  const moveCast = useCallback((castName: string, toTableId: number | null) => {
    setTables((prev) =>
      prev.map((t) => {
        const filtered = t.assignedCasts.filter((n) => n !== castName)
        if (t.id === toTableId) {
          // 移動先: 担当に追加 (重複回避)
          return { ...t, assignedCasts: filtered.includes(castName) ? filtered : [...filtered, castName] }
        }
        // それ以外の卓: assignedCasts から除外
        if (filtered.length !== t.assignedCasts.length) {
          return { ...t, assignedCasts: filtered }
        }
        return t
      }),
    )
    if (toTableId !== null) {
      // castsApi sync を避けるため setCastsRaw（ラップ前の setter）を直接使用
      setCastsRaw((prev) => prev.map((c) => (c.name === castName ? { ...c, lastAssignedAt: new Date().toISOString() } : c)))
    }
    tablesApi.moveCast(castName, null, toTableId).catch(console.error)
  }, [])

  // Fix C (ふうや指摘): 旧実装は `tablesApi.update(tableId, { orders: syncOrders })`
  //   で orders 配列全体を PATCH していたため、複数端末で同卓を同時編集すると
  //   後勝ちで先の更新が消える問題があった。atomic な append/decrement API
  //   (`POST /api/tables/:id/orders` (merge 機能付き) と
  //    `POST /api/tables/:id/orders/decrement`) に切替。
  //   楽観的 local 更新は維持し、UI の即時反応を保つ。
  const addOrderToTable = useCallback((tableId: number, order: OrderItem) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        const existing = t.orders.find((o) => o.menuItem.id === order.menuItem.id && o.castName === order.castName)
        const nextOrders = existing
          ? t.orders.map((o) =>
              o.menuItem.id === order.menuItem.id && o.castName === order.castName
                ? { ...o, quantity: o.quantity + order.quantity }
                : o,
            )
          : [...t.orders, order]
        return { ...t, orders: nextOrders }
      }),
    )
    // atomic append (backend 側で同 menuItem.id + castName をマージ)
    const { id: _omitId, ...rest } = order as OrderItem & { id?: number }
    tablesApi.addOrder(tableId, rest).catch(console.error)
  }, [])

  const removeOrderFromTable = useCallback((tableId: number, menuItemId: number, castName?: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        const nextOrders = t.orders
          .map((o) =>
            o.menuItem.id === menuItemId && o.castName === castName ? { ...o, quantity: o.quantity - 1 } : o,
          )
          .filter((o) => o.quantity > 0)
        return { ...t, orders: nextOrders }
      }),
    )
    // atomic decrement (backend 側で quantity-1、1以下なら order 削除)
    tablesApi.decrementOrder(tableId, menuItemId, castName).catch(console.error)
  }, [])

  const resetTable = useCallback((id: number) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'empty' as const,
              guestCount: 0,
              startTime: null,
              assignedCasts: [],
              mainNominationCastNames: [],
              isDouhan: undefined,
              isBanaiShimei: undefined,
              setCount: 0,
              orders: [],
              checkTicketPrintedAt: null,
              extensionHistory: [],
              setDiscountPerSet: 0,
              timeAdjustmentMinutes: 0,
            }
          : t,
      ),
    )
    tablesApi.reset(id).catch(console.error)
  }, [])

  // 追補03 R18: 注文行のボーナスを設定 / 解除
  const setOrderBonus = useCallback(
    (tableId: number, menuItemId: number, castName: string | undefined, bonus: { bonusCastName?: string; bonusAmount?: number }) => {
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t
          return {
            ...t,
            orders: t.orders.map((o) =>
              o.menuItem.id === menuItemId && o.castName === castName
                ? { ...o, bonusCastName: bonus.bonusCastName, bonusAmount: bonus.bonusAmount }
                : o,
            ),
          }
        }),
      )
    },
    [],
  )

  const addDiscountLog = useCallback((log: DiscountLog) => {
    setDiscountLogs((prev) => [...prev, log])
    billingApi.createDiscount(log).catch(console.error)
  }, [])

  // PDF C: 分割発行された領収書を記録。新→古順にしたいので unshift。
  // バックエンド API は別 PR で追加する想定（現状はローカルのみ）。
  const addIssuedReceipt = useCallback((receipt: IssuedReceipt) => {
    setIssuedReceipts((prev) => [receipt, ...prev])
  }, [])

  // 勤怠修正監査ログを 1 件記録。新→古順。
  const addAttendanceEditLog = useCallback((log: AttendanceEditLog) => {
    setAttendanceEditLogs((prev) => [log, ...prev])
  }, [])

  const addBillingRecord = useCallback((record: BillingRecord) => {
    setBillingRecords((prev) => [...prev, record])
    billingApi.create(record).catch(console.error)
  }, [])

  const updateBillingRecord = useCallback((
    id: string,
    patch: Partial<Pick<BillingRecord, 'uncollectedStatus' | 'uncollectedReason' | 'writtenOffAt' | 'settledOff'>>,
  ) => {
    // 楽観的更新
    setBillingRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    billingApi.updateRecord(id, patch).catch(console.error)
  }, [])

  // 取消は楽観的更新せず、API 成功後にサーバーが返した記録で置き換える。
  // 締め後の取消は 422 で弾かれるため、ローカルだけ取消扱いにすると整合が崩れる。
  const voidBillingRecord = useCallback(async (id: string, reason: string) => {
    const updated = await billingApi.voidRecord(id, reason)
    setBillingRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)))
  }, [])

  const addDailyPayRequest = useCallback((req: DailyPayRequest) => {
    setDailyPayRequests((prev) => [...prev, req])
    // Day 2: POST /api/payroll/daily-payments
    payrollApi.createDailyPayment(req).catch(console.error)
  }, [])

  const addBottleKeep = useCallback((keep: BottleKeep) => {
    setBottleKeeps((prev) => [...prev, keep])
  }, [])

  const updateBottleKeep = useCallback((id: number, patch: Partial<BottleKeep>) => {
    setBottleKeeps((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const removeBottleKeep = useCallback((id: number) => {
    setBottleKeeps((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const reorderTables = useCallback((fromIndex: number, toIndex: number) => {
    setTables((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const addUser = useCallback(async (user: UserAccount): Promise<void> => {
    // 楽観的に local state に追加
    setUserAccounts((prev) => [...prev, user])
    const payload = user as UserAccount & { pin?: string }
    if (!payload.pin) return
    try {
      await authApi.createUser({
        username: user.username,
        pin: payload.pin,
        role: user.role,
        displayName: user.displayName,
        ...(user.castId !== undefined ? { castId: user.castId } : {}),
        ...(user.hourlyRate !== undefined ? { hourlyRate: user.hourlyRate } : {}),
      })
    } catch (e) {
      // 失敗時は楽観追加を rollback してから throw
      setUserAccounts((prev) => prev.filter((u) => u.username !== user.username))
      throw e
    }
  }, [])

  const updateUser = useCallback((username: string, patch: Partial<UserAccount>) => {
    setUserAccounts((prev) => prev.map((u) => (u.username === username ? { ...u, ...patch } : u)))
    // Day 2: PATCH /api/auth/users/:username
    authApi.updateUser(username, patch).catch(console.error)
  }, [])

  const deleteUser = useCallback((username: string) => {
    setUserAccounts((prev) => prev.filter((u) => u.username !== username))
    // Day 2: DELETE /api/auth/users/:username (バック側で soft-delete)
    authApi.deleteUser(username).catch(console.error)
  }, [])

  const addAttendance = useCallback((record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [...prev, record])
    attendanceApi.create(record).catch(console.error)
  }, [])

  const updateAttendance = useCallback((id: number, patch: Partial<AttendanceRecord>) => {
    setAttendanceRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    attendanceApi.update(id, patch).catch(console.error)
  }, [])

  // 追補02 R4: 事前出勤予定
  const [attendanceSchedules, setAttendanceSchedules] = useState<AttendanceSchedule[]>([])
  const addAttendanceSchedule = useCallback((s: AttendanceSchedule) => {
    setAttendanceSchedules((prev) => [...prev, s])
  }, [])
  const removeAttendanceSchedule = useCallback((id: number) => {
    setAttendanceSchedules((prev) => prev.filter((s) => s.id !== id))
  }, [])
  const markScheduleProcessed = useCallback((id: number) => {
    setAttendanceSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, processed: true } : s)))
  }, [])

  const addExpense = useCallback((expense: Expense) => {
    setExpenses((prev) => [...prev, expense])
    expensesApi.create(expense).catch(console.error)
  }, [])

  const removeExpense = useCallback((id: number) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    expensesApi.softDelete(id).catch(console.error)
  }, [])

  const addAdvancePayment = useCallback((payment: AdvancePayment) => {
    setAdvancePayments((prev) => [...prev, payment])
    advancesApi.create(payment).catch(console.error)
  }, [])

  const archiveOldData = useCallback((beforeDate: string) => {
    const toArchive = billingRecords.filter((r) => r.completedAt < beforeDate)
    if (toArchive.length === 0) return
    const archived: ArchivedData = {
      id: Date.now(),
      archivedAt: new Date().toISOString(),
      dateRange: `〜${beforeDate}`,
      billingCount: toArchive.length,
      totalSales: toArchive.reduce((s, r) => s + r.total, 0),
    }
    setArchivedData((prev) => [...prev, archived])
    setBillingRecords((prev) => prev.filter((r) => (r.date ?? new Date().toISOString().slice(0, 10)) >= beforeDate))
    archiveApi.archive(beforeDate).catch(console.error)
  }, [billingRecords])

  const addDailyReport = useCallback((report: DailyReport) => {
    setDailyReports((prev) => [...prev, report])
    dailyReportsApi.create(report).catch(console.error)
  }, [])

  const removeDailyReport = useCallback((id: number) => {
    setDailyReports((prev) => {
      const target = prev.find((r) => r.id === id)
      if (target?.date) dailyReportsApi.delete(target.date).catch(console.error)
      return prev.filter((r) => r.id !== id)
    })
  }, [])

  const getNextReceiptNumber = useCallback(() => {
    const num = nextReceiptNumber
    setNextReceiptNumber((prev) => prev + 1)
    return num
  }, [nextReceiptNumber])

  const flMetrics = useMemo<FLMetrics>(() => {
    // JST 基準で today を算出。businessDate (backend 付与) を優先し、
    // 旧 date (UTC ベース) や未設定時のフォールバック順で参照する。
    const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const monthPrefix = todayStr.slice(0, 7)
    const dateOf = (r: typeof billingRecords[number]) => r.businessDate ?? r.date ?? todayStr

    const todayBillings = billingRecords.filter((r) => dateOf(r) === todayStr)
    const monthBillings = billingRecords.filter((r) => dateOf(r).startsWith(monthPrefix))

    const todaySales = todayBillings.reduce((s, r) => s + r.total, 0)
    const monthSales = monthBillings.reduce((s, r) => s + r.total, 0)

    // Food cost: 本日は現在稼働中の卓の原価合計(会計未確定)
    let foodCost = 0
    for (const table of tables) {
      for (const order of table.orders) {
        foodCost += order.menuItem.cost * order.quantity
      }
    }

    // Labor cost: cast back totals from orders + fixed staff cost
    let castBackTotal = 0
    for (const table of tables) {
      for (const order of table.orders) {
        castBackTotal += order.menuItem.castBack * order.quantity
      }
    }
    const laborCost = castBackTotal + storeSettings.staffFixedCost

    // 月次の F・L 概算 (本日分 + 月次売上から逆算)
    // 本来は会計時の商品原価を BillingRecord に保存すべきだが、現状は概算で処理
    const monthlyFoodCost = Math.round(monthSales * 0.12)   // 原価率約12%想定
    const monthlyLaborCost = Math.round(monthSales * 0.30)  // 人件費率約30%想定

    // Card processing fee
    const todayCardSales = todayBillings.reduce((s, r) => {
      if (r.paymentMethod === 'card') return s + r.total
      if (r.paymentMethod === 'mixed') return s + (r.cardAmount ?? 0)
      return s
    }, 0)
    const monthCardSales = monthBillings.reduce((s, r) => {
      if (r.paymentMethod === 'card') return s + r.total
      if (r.paymentMethod === 'mixed') return s + (r.cardAmount ?? 0)
      return s
    }, 0)
    const cardProcessingCost = Math.round(todayCardSales * storeSettings.cardProcessingFeeRate)
    const monthCardProcessingCost = Math.round(monthCardSales * storeSettings.cardProcessingFeeRate)

    const totalCost = foodCost + laborCost + cardProcessingCost
    const flRate = todaySales > 0 ? totalCost / todaySales * 100 : 0
    const todayProfit = todaySales - totalCost

    const monthlyProfit = monthSales - monthlyFoodCost - monthlyLaborCost - monthCardProcessingCost
    const monthlyFlRate = monthSales > 0 ? (monthlyFoodCost + monthlyLaborCost + monthCardProcessingCost) / monthSales * 100 : 0

    return { todaySales, foodCost, laborCost, cardProcessingCost, flRate, todayProfit, monthlyProfit, monthlyFlRate }
  }, [billingRecords, tables, storeSettings.cardProcessingFeeRate, storeSettings.staffFixedCost])

  return (
    <StoreContext.Provider
      value={{
        fetchFailed,
        loading,
        tables,
        casts,
        guestMenu,
        castMenu,
        setPrices: setPricesState,
        chargeItems: chargeItemsState,
        discountLogs,
        issuedReceipts,
        attendanceEditLogs,
        billingRecords,
        dailyPayRequests,
        bottleKeeps,
        deductions,
        storeSettings,
        updateTable,
        moveCast,
        addOrderToTable,
        removeOrderFromTable,
        setOrderBonus,
        resetTable,
        addDiscountLog,
        addIssuedReceipt,
        addAttendanceEditLog,
        addBillingRecord,
        updateBillingRecord,
        voidBillingRecord,
        addDailyPayRequest,
        setCasts,
        setGuestMenu,
        setCastMenu,
        menuCategories,
        setMenuCategories,
        setSetPrices,
        setChargeItems,
        setTables,
        addBottleKeep,
        updateBottleKeep,
        removeBottleKeep,
        reorderTables,
        setDeductions,
        setStoreSettings,
        userAccounts,
        addUser,
        updateUser,
        deleteUser,
        flMetrics,
        attendanceRecords,
        addAttendance,
        updateAttendance,
        attendanceSchedules,
        addAttendanceSchedule,
        removeAttendanceSchedule,
        markScheduleProcessed,
        expenses,
        addExpense,
        removeExpense,
        advancePayments,
        addAdvancePayment,
        archivedData,
        archiveOldData,
        dailyReports,
        addDailyReport,
        removeDailyReport,
        setDailyReports,
        nextReceiptNumber,
        getNextReceiptNumber,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
