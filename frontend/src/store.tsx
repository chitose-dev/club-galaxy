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
} from './data/mock'

export interface FLMetrics {
  todaySales: number
  foodCost: number
  laborCost: number
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
          ? { ...t, status: 'empty' as const, guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] }
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

    const flRate = todaySales > 0 ? (foodCost + laborCost) / todaySales * 100 : 0
    const todayProfit = todaySales - foodCost - laborCost

    const monthlyDummyProfit = 380000
    const monthlyProfit = todayProfit + monthlyDummyProfit
    const monthlyDummySales = 1200000
    const monthlyDummyFoodCost = 180000
    const monthlyDummyLaborCost = 420000
    const totalMonthlySales = todaySales + monthlyDummySales
    const totalMonthlyFoodCost = foodCost + monthlyDummyFoodCost
    const totalMonthlyLaborCost = laborCost + monthlyDummyLaborCost
    const monthlyFlRate = totalMonthlySales > 0 ? (totalMonthlyFoodCost + totalMonthlyLaborCost) / totalMonthlySales * 100 : 0

    return { todaySales, foodCost, laborCost, flRate, todayProfit, monthlyProfit, monthlyFlRate }
  }, [billingRecords, tables])

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
