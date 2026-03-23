import { useState, useMemo } from 'react'
import { useStore } from '../store'
import type { MenuItem, CastMenuItem, BackType } from '../data/mock'

const drinkTabs = [
  { key: 'guest' as const, label: 'ゲスト用' },
  { key: 'cast' as const, label: 'キャスト用' },
]

export default function OrderPage() {
  const { tables, guestMenu, castMenu, addOrderToTable, removeOrderFromTable } = useStore()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const [selectedTableId, setSelectedTableId] = useState<number>(occupiedTables[0]?.id ?? 0)
  const [activeTab, setActiveTab] = useState<'guest' | 'cast'>('guest')

  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const orders = selectedTable?.orders ?? []

  const menuItems: MenuItem[] = activeTab === 'guest' ? guestMenu : castMenu

  const handleAdd = (item: MenuItem) => {
    if (!selectedTableId) return
    addOrderToTable(selectedTableId, { menuItem: item, quantity: 1 })
  }

  const handleRemove = (itemId: number) => {
    if (!selectedTableId) return
    removeOrderFromTable(selectedTableId, itemId)
  }

  const total = orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)

  const backSummary = useMemo(() => {
    const summary: Partial<Record<BackType, number>> = {}
    for (const order of orders) {
      if (order.menuItem.category === 'cast') {
        const castItem = order.menuItem as CastMenuItem
        summary[castItem.backType] = (summary[castItem.backType] ?? 0) + order.quantity
      }
    }
    return summary
  }, [orders])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-sm text-gray-400">卓:</span>
        <select
          value={selectedTableId}
          onChange={(e) => setSelectedTableId(Number(e.target.value))}
          className="bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm"
        >
          {occupiedTables.length === 0 && <option value={0}>卓なし</option>}
          {occupiedTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.number} ({t.castNames.join(',')})
            </option>
          ))}
        </select>
      </div>

      <div className="flex border-b border-gray-700">
        {drinkTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === tab.key
                ? 'text-[#d4af37] border-b-2 border-[#d4af37]'
                : 'text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
        {menuItems.map((item) => {
          const ordered = orders.find((o) => o.menuItem.id === item.id)
          return (
            <button
              key={item.id}
              onClick={() => handleAdd(item)}
              className="bg-white/5 border border-gray-700 rounded-lg p-3 text-left active:bg-white/10 transition-colors relative"
            >
              <div className="text-sm font-bold mb-1">{item.name}</div>
              <div className="text-[#d4af37] text-sm">
                {item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}
              </div>
              {item.category === 'cast' && (
                <div className="text-xs text-gray-500 mt-0.5">Back: {(item as CastMenuItem).backType}</div>
              )}
              {ordered && (
                <span className="absolute -top-2 -right-2 bg-[#e94560] text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                  {ordered.quantity}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {Object.keys(backSummary).length > 0 && (
        <div className="bg-purple-900/30 border-t border-purple-700 px-4 py-2">
          <div className="text-xs text-purple-300 mb-1">バック集計</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(backSummary) as [BackType, number][]).map(([type, count]) => (
              <span key={type} className="bg-purple-800/50 text-purple-200 text-xs px-2 py-0.5 rounded">
                {type}: {count}杯
              </span>
            ))}
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div className="bg-[#16213e] border-t border-gray-700 p-4">
          <div className="max-h-32 overflow-y-auto mb-3 space-y-1">
            {orders.map((o) => (
              <div key={o.menuItem.id} className="flex items-center justify-between text-sm">
                <span>{o.menuItem.name} x{o.quantity}</span>
                <div className="flex items-center gap-2">
                  <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                  <button onClick={() => handleRemove(o.menuItem.id)} className="text-red-400 text-xs bg-white/10 rounded px-1.5 py-0.5">-1</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">合計: ¥{total.toLocaleString()}</span>
            <button className="bg-[#e94560] px-6 py-2.5 rounded-lg font-bold">注文確定</button>
          </div>
        </div>
      )}
    </div>
  )
}
