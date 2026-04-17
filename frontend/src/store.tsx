import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  initialTables,
  casts as initialCasts,
  guestMenuItems as initialGuestMenu,
  castMenuItems as initialCastMenu,
  setPrices as initialSetPrices,
  chargeItems as initialChargeItems,
  initialBillingRecords,
  initialDailyPayRequests,
  initialBottleKeeps,
  defaultStoreSettings,
  dummyAccounts,
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
  addOrderToTable: (tableId: number, order: OrderItem) => void
  removeOrderFromTable: (tableId: number, menuItemId: number) => void
  resetTable: (id: number) => void
  addDiscountLog: (log: DiscountLog) => void
  addBillingRecord: (record: BillingRecord) => void
  addDailyPayRequest: (req: DailyPayRequest) => void
  setCasts: React.Dispatch<React.SetStateAction<Cast[]>>
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
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
  const [tables, setTables] = useState<Table[]>(initialTables)
  const [casts, setCasts] = useState<Cast[]>(initialCasts)
  const [guestMenu, setGuestMenu] = useState<GuestMenuItem[]>(initialGuestMenu)
  const [castMenu, setCastMenu] = useState<CastMenuItem[]>(initialCastMenu)
  const [setPricesState, setSetPrices] = useState<SetPrice[]>(initialSetPrices)
  const [chargeItemsState, setChargeItems] = useState<SetPrice[]>(initialChargeItems)
  const [discountLogs, setDiscountLogs] = useState<DiscountLog[]>([])
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>(initialBillingRecords)
  const [dailyPayRequests, setDailyPayRequests] = useState<DailyPayRequest[]>(initialDailyPayRequests)
  const [bottleKeeps, setBottleKeeps] = useState<BottleKeep[]>(initialBottleKeeps)
  const [deductions, setDeductions] = useState<Deduction[]>([])
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(dummyAccounts)
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(initialAttendanceRecords)
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>(initialAdvancePayments)
  const [archivedData, setArchivedData] = useState<ArchivedData[]>([])
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [nextReceiptNumber, setNextReceiptNumber] = useState(1001)

  const updateTable = useCallback((id: number, patch: Partial<Table>) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const addOrderToTable = useCallback((tableId: number, order: OrderItem) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        const existing = t.orders.find((o) => o.menuItem.id === order.menuItem.id)
        if (existing) {
          return {
            ...t,
            orders: t.orders.map((o) =>
              o.menuItem.id === order.menuItem.id
                ? { ...o, quantity: o.quantity + order.quantity }
                : o,
            ),
          }
        }
        return { ...t, orders: [...t.orders, order] }
      }),
    )
  }, [])

  const removeOrderFromTable = useCallback((tableId: number, menuItemId: number) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t
        return {
          ...t,
          orders: t.orders
            .map((o) =>
              o.menuItem.id === menuItemId ? { ...o, quantity: o.quantity - 1 } : o,
            )
            .filter((o) => o.quantity > 0),
        }
      }),
    )
  }, [])

  const resetTable = useCallback((id: number) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'empty' as const, guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [], checkTicketPrintedAt: null }
          : t,
      ),
    )
  }, [])

  const addDiscountLog = useCallback((log: DiscountLog) => {
    setDiscountLogs((prev) => [...prev, log])
  }, [])

  const addBillingRecord = useCallback((record: BillingRecord) => {
    setBillingRecords((prev) => [...prev, record])
  }, [])

  const addDailyPayRequest = useCallback((req: DailyPayRequest) => {
    setDailyPayRequests((prev) => [...prev, req])
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
  }, [])

  const updateUser = useCallback((username: string, patch: Partial<UserAccount>) => {
    setUserAccounts((prev) => prev.map((u) => (u.username === username ? { ...u, ...patch } : u)))
  }, [])

  const deleteUser = useCallback((username: string) => {
    setUserAccounts((prev) => prev.filter((u) => u.username !== username))
  }, [])

  const addAttendance = useCallback((record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [...prev, record])
  }, [])

  const updateAttendance = useCallback((id: number, patch: Partial<AttendanceRecord>) => {
    setAttendanceRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const addExpense = useCallback((expense: Expense) => {
    setExpenses((prev) => [...prev, expense])
  }, [])

  const removeExpense = useCallback((id: number) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const addAdvancePayment = useCallback((payment: AdvancePayment) => {
    setAdvancePayments((prev) => [...prev, payment])
  }, [])

  const archiveOldData = useCallback((beforeDate: string) => {
    const toArchive = billingRecords.filter((r) => r.timestamp < beforeDate)
    if (toArchive.length === 0) return
    const archived: ArchivedData = {
      id: Date.now(),
      archivedAt: new Date().toISOString(),
      dateRange: `〜${beforeDate}`,
      billingCount: toArchive.length,
      totalSales: toArchive.reduce((s, r) => s + r.total, 0),
    }
    setArchivedData((prev) => [...prev, archived])
    setBillingRecords((prev) => prev.filter((r) => r.timestamp >= beforeDate))
  }, [billingRecords])

  const addDailyReport = useCallback((report: DailyReport) => {
    setDailyReports((prev) => [...prev, report])
  }, [])

  const removeDailyReport = useCallback((id: number) => {
    setDailyReports((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const getNextReceiptNumber = useCallback(() => {
    const num = nextReceiptNumber
    setNextReceiptNumber((prev) => prev + 1)
    return num
  }, [nextReceiptNumber])

  const flMetrics = useMemo<FLMetrics>(() => {
    const todaySales = billingRecords.reduce((sum, r) => sum + r.total, 0)

    // Food cost: sum of (menuItem.cost * quantity) across all occupied tables' orders
    // plus costs from billing records (approximated from current table orders)
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

    // Card processing fee (store expense paid to card company)
    let cardSalesTotal = 0
    for (const r of billingRecords) {
      if (r.paymentMethod === 'card') {
        cardSalesTotal += r.total
      } else if (r.paymentMethod === 'mixed') {
        cardSalesTotal += r.cardAmount ?? 0
      }
    }
    const cardProcessingCost = Math.round(cardSalesTotal * storeSettings.cardProcessingFeeRate)

    const totalCost = foodCost + laborCost + cardProcessingCost
    const flRate = todaySales > 0 ? totalCost / todaySales * 100 : 0
    const todayProfit = todaySales - totalCost

    const monthlyDummyProfit = 380000
    const monthlyProfit = todayProfit + monthlyDummyProfit
    const monthlyDummySales = 1200000
    const monthlyDummyFoodCost = 180000
    const monthlyDummyLaborCost = 420000
    const totalMonthlySales = todaySales + monthlyDummySales
    const totalMonthlyFoodCost = foodCost + monthlyDummyFoodCost
    const totalMonthlyLaborCost = laborCost + monthlyDummyLaborCost
    const monthlyFlRate = totalMonthlySales > 0 ? (totalMonthlyFoodCost + totalMonthlyLaborCost + cardProcessingCost) / totalMonthlySales * 100 : 0

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
        addOrderToTable,
        removeOrderFromTable,
        resetTable,
        addDiscountLog,
        addBillingRecord,
        addDailyPayRequest,
        setCasts,
        setGuestMenu,
        setCastMenu,
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
