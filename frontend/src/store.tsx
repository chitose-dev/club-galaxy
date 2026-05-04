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
import {
  guestMenuItems as initialGuestMenu,
  castMenuItems as initialCastMenu,
  setPrices as initialSetPrices,
  chargeItems as initialChargeItems,
  initialMenuCategories,
  type MenuCategory,
  initialDailyPayRequests,
  initialBottleKeeps,
  defaultStoreSettings,
  initialAttendanceRecords,
  initialExpenses,
  initialAdvancePayments,
  type Table,
  type Cast,
  type GuestMenuItem,
  type CastMenuItem,
  type SetPrice,
  type OrderItem,
  type DiscountLog,
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
  tables: Table[]
  casts: Cast[]
  guestMenu: GuestMenuItem[]
  castMenu: CastMenuItem[]
  setPrices: SetPrice[]
  chargeItems: SetPrice[]
  discountLogs: DiscountLog[]
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
  addBillingRecord: (record: BillingRecord) => void
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
  addUser: (user: UserAccount) => void
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
  // 伝票番号カウンター
  nextReceiptNumber: number
  getNextReceiptNumber: () => number
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  // クロウ指示: モック初期値を空配列に変更（起動時 API fetch 完了前のダミー表示を回避）
  const [tables, setTables] = useState<Table[]>([])
  // Day 2: PUT sync wrap のため raw state setter は ...Raw 名で受ける
  const [casts, setCastsRaw] = useState<Cast[]>([])
  const [guestMenu, setGuestMenuRaw] = useState<GuestMenuItem[]>(initialGuestMenu)
  const [castMenu, setCastMenuRaw] = useState<CastMenuItem[]>(initialCastMenu)
  const [menuCategories, setMenuCategoriesRaw] = useState<MenuCategory[]>(initialMenuCategories)
  const [setPricesState, setSetPricesRaw] = useState<SetPrice[]>(initialSetPrices)
  const [chargeItemsState, setChargeItemsRaw] = useState<SetPrice[]>(initialChargeItems)
  const [discountLogs, setDiscountLogs] = useState<DiscountLog[]>([])
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([])
  const [dailyPayRequests, setDailyPayRequests] = useState<DailyPayRequest[]>(initialDailyPayRequests)
  const [bottleKeeps, setBottleKeeps] = useState<BottleKeep[]>(initialBottleKeeps)
  const [deductions, setDeductionsRaw] = useState<Deduction[]>([])
  const [storeSettings, setStoreSettingsRaw] = useState<StoreSettings>(defaultStoreSettings)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(initialAttendanceRecords)
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>(initialAdvancePayments)
  const [archivedData, setArchivedData] = useState<ArchivedData[]>([])
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [nextReceiptNumber, setNextReceiptNumber] = useState(1001)

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
  // authToken があれば backend からデータを並行 fetch、失敗時は initial mock を維持。
  // 担当ページ（ProfitPage / SalaryPage / AdminPage）が必要とする全データを GET。
  // 未実装 endpoint（attendance / expenses / advances / archive / dailyReports）は
  // 当面 mock 維持（Rev.4.1 §16.4 Phase D で別途対応）。
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    // クロウレビュー対応: 起動時 GET は wrap 版（PUT sync 付き）ではなく Raw setter を使う
    // 旧実装だと取得直後に全件 PUT replace-all が走り、不要な API 往復 + 上書きが発生していた
    void Promise.all([
      tablesApi.list().then(setTables).catch(() => undefined),
      castsApi.list().then(setCastsRaw).catch(() => undefined),
      billingApi.list({ limit: 1000 }).then(setBillingRecords).catch(() => undefined),
      payrollApi.listDailyPayments().then(setDailyPayRequests).catch(() => undefined),
      payrollApi.listDeductions().then(setDeductionsRaw).catch(() => undefined),
      menuApi.listGuest().then(setGuestMenuRaw).catch(() => undefined),
      menuApi.listCast().then(setCastMenuRaw).catch(() => undefined),
      menuApi.listSetPrices().then(setSetPricesRaw).catch(() => undefined),
      menuApi.listCharges().then(setChargeItemsRaw).catch(() => undefined),
      menuApi.listCategories().then(setMenuCategoriesRaw).catch(() => undefined),
      settingsApi.get().then(setStoreSettingsRaw).catch(() => undefined),
      // attendance はページネーションレスポンス { data, nextCursor } 形式
      attendanceApi.list().then((res) => setAttendanceRecords(res.data)).catch(() => undefined),
      expensesApi.list().then(setExpenses).catch(() => undefined),
      advancesApi.list().then(setAdvancePayments).catch(() => undefined),
      dailyReportsApi.list().then(setDailyReports).catch(() => undefined),
      authApi.listUsers().then(setUserAccounts).catch(() => undefined),
    ])
  }, [])

  const updateTable = useCallback((id: number, patch: Partial<Table>) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
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

  const addOrderToTable = useCallback((tableId: number, order: OrderItem) => {
    let syncOrders: OrderItem[] = []
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        const existing = t.orders.find((o) => o.menuItem.id === order.menuItem.id && o.castName === order.castName)
        syncOrders = existing
          ? t.orders.map((o) =>
              o.menuItem.id === order.menuItem.id && o.castName === order.castName
                ? { ...o, quantity: o.quantity + order.quantity }
                : o,
            )
          : [...t.orders, order]
        return { ...t, orders: syncOrders }
      }),
    )
    tablesApi.update(tableId, { orders: syncOrders }).catch(console.error)
  }, [])

  const removeOrderFromTable = useCallback((tableId: number, menuItemId: number, castName?: string) => {
    let syncOrders: OrderItem[] = []
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        syncOrders = t.orders
          .map((o) =>
            o.menuItem.id === menuItemId && o.castName === castName ? { ...o, quantity: o.quantity - 1 } : o,
          )
          .filter((o) => o.quantity > 0)
        return { ...t, orders: syncOrders }
      }),
    )
    tablesApi.update(tableId, { orders: syncOrders }).catch(console.error)
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
  }, [])

  const addBillingRecord = useCallback((record: BillingRecord) => {
    setBillingRecords((prev) => [...prev, record])
    billingApi.create(record).catch(console.error)
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

  const addUser = useCallback((user: UserAccount) => {
    setUserAccounts((prev) => [...prev, user])
    // Day 2: POST /api/auth/users — pin は UserAccount に含まれてる前提（type 上は必須）
    const payload = user as UserAccount & { pin?: string }
    if (payload.pin) {
      authApi.createUser({
        username: user.username,
        pin: payload.pin,
        role: user.role,
        displayName: user.displayName,
        ...(user.castId !== undefined ? { castId: user.castId } : {}),
        ...(user.hourlyRate !== undefined ? { hourlyRate: user.hourlyRate } : {}),
      }).catch(console.error)
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
    const todayStr = new Date().toISOString().slice(0, 10)
    const monthPrefix = todayStr.slice(0, 7)
    const dateOf = (r: typeof billingRecords[number]) => r.date ?? todayStr

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
    const staffFixedCost = 28800
    const laborCost = castBackTotal + staffFixedCost

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
  }, [billingRecords, tables, storeSettings.cardProcessingFeeRate])

  return (
    <StoreContext.Provider
      value={{
        tables,
        casts,
        guestMenu,
        castMenu,
        setPrices: setPricesState,
        chargeItems: chargeItemsState,
        discountLogs,
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
        addBillingRecord,
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
