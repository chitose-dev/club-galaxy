import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { MenuItem, CastMenuItem, BackType } from '../data/mock'

const HELP_BACK_ITEM: CastMenuItem = {
  id: 999,
  name: 'ヘルプ',
  price: 0,
  category: 'cast',
  subcategory: 'fd',
  backType: 'ヘルプ',
}

const drinkTabs = [
  { key: 'guest' as const, label: 'ゲスト用' },
  { key: 'cast' as const, label: 'キャスト用' },
  { key: 'bottle' as const, label: 'ボトル' },
]

export default function OrderPage() {
  const { tables, guestMenu, castMenu, addOrderToTable, removeOrderFromTable, bottleKeeps, addBottleKeep, updateBottleKeep, removeBottleKeep } = useStore()
  const [searchParams] = useSearchParams()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const initialTableId = Number(searchParams.get('table')) || occupiedTables[0]?.id || 0
  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId)
  const [activeTab, setActiveTab] = useState<'guest' | 'cast' | 'bottle'>('guest')

  // Bottle keep form
  const [showAddBottle, setShowAddBottle] = useState(false)
  const [bottleName, setBottleName] = useState('')
  const [bottleRemaining, setBottleRemaining] = useState(100)
  const [bottleStorage, setBottleStorage] = useState('')
  const [bottleCustomer, setBottleCustomer] = useState('')

  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const orders = selectedTable?.orders ?? []

  const menuItems: MenuItem[] = activeTab === 'guest' ? guestMenu : activeTab === 'cast' ? castMenu : []

  const handleAdd = (item: MenuItem) => {
    if (!selectedTableId) return
    addOrderToTable(selectedTableId, { menuItem: item, quantity: 1 })
  }

  const handleRemove = (itemId: number) => {
    if (!selectedTableId) return
    removeOrderFromTable(selectedTableId, itemId)
  }

  const handleDelete = (itemId: number) => {
    if (!selectedTableId || !selectedTable) return
    const order = orders.find((o) => o.menuItem.id === itemId)
    if (!order) return
    for (let i = 0; i < order.quantity; i++) {
      removeOrderFromTable(selectedTableId, itemId)
    }
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
    if (selectedTable?.nomination === 'douhan') {
      summary['同伴'] = (summary['同伴'] ?? 0) + 1
    } else if (selectedTable?.nomination === 'shimei') {
      summary['本指名'] = (summary['本指名'] ?? 0) + 1
    } else if (selectedTable?.nomination === 'banai') {
      summary['場内指名'] = (summary['場内指名'] ?? 0) + 1
    }
    return summary
  }, [orders, selectedTable?.nomination])

  // Bottle keeps sorted by remaining (lowest first)
  const sortedBottleKeeps = [...bottleKeeps].sort((a, b) => a.remaining - b.remaining)

  const handleAddBottleKeep = () => {
    if (!bottleName || !bottleCustomer) return
    addBottleKeep({
      id: Date.now(),
      bottleName,
      remaining: bottleRemaining,
      storageLocation: bottleStorage,
      customerName: bottleCustomer,
      tableNumber: selectedTable?.number,
      createdAt: new Date().toISOString().split('T')[0],
    })
    setBottleName('')
    setBottleRemaining(100)
    setBottleStorage('')
    setBottleCustomer('')
    setShowAddBottle(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 卓選択 */}
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

      {/* タブ */}
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

      {/* Bottle tab content */}
      {activeTab === 'bottle' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-300">ボトルキープ一覧</h3>
            <button onClick={() => setShowAddBottle(true)} className="text-xs bg-[#d4af37] text-black px-3 py-1.5 rounded font-bold">+ キープ登録</button>
          </div>

          {/* Current table's bottles */}
          {selectedTable && (() => {
            const tableBottles = bottleKeeps.filter((b) => b.tableNumber === selectedTable.number)
            if (tableBottles.length === 0) return null
            return (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 mb-4">
                <div className="text-xs text-amber-300 font-bold mb-2">この卓のキープボトル</div>
                {tableBottles.map((b) => (
                  <div key={b.id} className="flex justify-between text-sm mb-1">
                    <span>{b.bottleName} ({b.customerName})</span>
                    <span className={b.remaining <= 20 ? 'text-red-400 font-bold' : ''}>{b.remaining}%</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* All bottles sorted by remaining */}
          <div className="space-y-2">
            {sortedBottleKeeps.map((b) => (
              <div key={b.id} className={`bg-white/5 rounded-lg p-3 ${b.remaining <= 20 ? 'border border-red-700/50' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-sm">{b.bottleName}</div>
                    <div className="text-xs text-gray-400">{b.customerName} / {b.storageLocation || '場所未設定'}</div>
                    {b.tableNumber && <div className="text-xs text-gray-500">卓: {b.tableNumber}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${b.remaining <= 20 ? 'text-red-400' : b.remaining <= 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {b.remaining}%
                    </span>
                  </div>
                </div>
                {/* Remaining bar */}
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${b.remaining <= 20 ? 'bg-red-500' : b.remaining <= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${b.remaining}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={b.remaining}
                    onChange={(e) => updateBottleKeep(b.id, { remaining: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <button onClick={() => removeBottleKeep(b.id)} className="text-xs bg-red-900/50 px-2 py-1 rounded text-red-400">削除</button>
                </div>
              </div>
            ))}
          </div>

          {sortedBottleKeeps.length === 0 && (
            <p className="text-center text-gray-500 mt-8">ボトルキープはありません</p>
          )}

          {/* Add bottle modal */}
          {showAddBottle && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddBottle(false)}>
              <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-4">ボトルキープ登録</h2>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">ボトル名</label>
                    <input type="text" value={bottleName} onChange={(e) => setBottleName(e.target.value)} placeholder="例: 響 17年" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">残量: {bottleRemaining}%</label>
                    <input type="range" min="0" max="100" value={bottleRemaining} onChange={(e) => setBottleRemaining(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">保管場所</label>
                    <input type="text" value={bottleStorage} onChange={(e) => setBottleStorage(e.target.value)} placeholder="例: A-3" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">担当客名</label>
                    <input type="text" value={bottleCustomer} onChange={(e) => setBottleCustomer(e.target.value)} placeholder="例: 田中様" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddBottle(false)} className="flex-1 bg-white/10 py-3 rounded-lg font-bold text-gray-400">キャンセル</button>
                  <button onClick={handleAddBottleKeep} disabled={!bottleName || !bottleCustomer} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold disabled:opacity-50">登録</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* メニューグリッド */}
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
            {activeTab === 'cast' && (() => {
              const helpOrdered = orders.find((o) => o.menuItem.id === HELP_BACK_ITEM.id)
              return (
                <button
                  onClick={() => handleAdd(HELP_BACK_ITEM)}
                  className="bg-orange-900/30 border border-orange-700 rounded-lg p-3 text-left active:bg-orange-900/50 transition-colors relative"
                >
                  <div className="text-sm font-bold mb-1">ヘルプ</div>
                  <div className="text-orange-300 text-sm">バック記録</div>
                  <div className="text-xs text-gray-500 mt-0.5">Back: ヘルプ</div>
                  {helpOrdered && (
                    <span className="absolute -top-2 -right-2 bg-[#e94560] text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                      {helpOrdered.quantity}
                    </span>
                  )}
                </button>
              )
            })()}
          </div>

          {/* バック集計 */}
          {Object.keys(backSummary).length > 0 && (
            <div className="bg-purple-900/30 border-t border-purple-700 px-4 py-2">
              <div className="text-xs text-purple-300 mb-1">バック集計</div>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(backSummary) as [BackType, number][]).map(([type, count]) => (
                  <span key={type} className="bg-purple-800/50 text-purple-200 text-xs px-2 py-0.5 rounded">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 注文リスト */}
          {orders.length > 0 && (
            <div className="bg-[#16213e] border-t border-gray-700 p-4">
              <div className="max-h-40 overflow-y-auto mb-3 space-y-1">
                {orders.map((o) => (
                  <div key={o.menuItem.id} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate">{o.menuItem.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRemove(o.menuItem.id)} className="text-gray-300 bg-white/10 rounded w-7 h-7 flex items-center justify-center text-lg leading-none">-</button>
                      <span className="w-6 text-center font-bold">{o.quantity}</span>
                      <button onClick={() => handleAdd(o.menuItem)} className="text-gray-300 bg-white/10 rounded w-7 h-7 flex items-center justify-center text-lg leading-none">+</button>
                      <span className="w-20 text-right text-gray-300">
                        {o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}
                      </span>
                      <button onClick={() => handleDelete(o.menuItem.id)} className="text-red-400 bg-red-900/30 rounded px-2 py-1 text-xs ml-1">削除</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-gray-600 pt-3">
                <span className="text-lg font-bold">合計: ¥{total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
