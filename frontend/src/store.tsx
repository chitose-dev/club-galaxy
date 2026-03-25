import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import {
  initialTables,
  casts as initialCasts,
  guestMenuItems as initialGuestMenu,
  castMenuItems as initialCastMenu,
  setPrices as initialSetPrices,
  chargeItems as initialChargeItems,
  initialBillingRecords,
  initialDailyPayRequests,
  type Table,
  type Cast,
  type GuestMenuItem,
  type CastMenuItem,
  type SetPrice,
  type OrderItem,
  type DiscountLog,
  type BillingRecord,
  type DailyPayRequest,
} from './data/mock'

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
