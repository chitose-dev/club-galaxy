import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { MenuItem, CastMenuItem, BackType } from '../data/mock'
import { displayOrderName } from '../data/mock'
import { Minus, Plus, Trash2, Wine, X } from 'lucide-react'

const HELP_BACK_ITEM: CastMenuItem = {
  id: 999,
  name: 'ヘルプ',
  price: 0,
  cost: 0,
  castBack: 0,
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

  const [showAddBottle, setShowAddBottle] = useState(false)
  const [bottleName, setBottleName] = useState('')
  const [bottleRemaining, setBottleRemaining] = useState(100)
  const [bottleStorage, setBottleStorage] = useState('')
  const [bottleCustomer, setBottleCustomer] = useState('')

  // キャスト選択モーダル(本カク等、cast系メニュー選択時に誰に紐付けるか選ぶ)
  const [castSelectTarget, setCastSelectTarget] = useState<CastMenuItem | null>(null)

  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const orders = selectedTable?.orders ?? []

  const menuItems: MenuItem[] = activeTab === 'guest' ? guestMenu : activeTab === 'cast' ? castMenu : []

  const handleAdd = (item: MenuItem) => {
    if (!selectedTableId) return
    // 指示書§2.3: cast系メニューはキャスト選択モーダルで担当を選ぶ
    if (item.category === 'cast' && selectedTable && selectedTable.castNames.length > 0) {
      setCastSelectTarget(item as CastMenuItem)
      return
    }
    addOrderToTable(selectedTableId, { menuItem: item, quantity: 1 })
  }

  const handleAddForCast = (item: CastMenuItem, castName: string) => {
    if (!selectedTableId) return
    addOrderToTable(selectedTableId, { menuItem: item, quantity: 1, castName })
    setCastSelectTarget(null)
  }

  const handleRemove = (itemId: number, castName?: string) => {
    if (!selectedTableId) return
    removeOrderFromTable(selectedTableId, itemId, castName)
  }

  const handleDelete = (itemId: number, castName?: string) => {
    if (!selectedTableId || !selectedTable) return
    const order = orders.find((o) => o.menuItem.id === itemId && o.castName === castName)
    if (!order) return
    for (let i = 0; i < order.quantity; i++) {
      removeOrderFromTable(selectedTableId, itemId, castName)
    }
  }

  const total = orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)

  // 指名料・同伴は自動追加オーダーに含まれているので、ここでは castMenu のバックだけ集計
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
      {/* Table selector */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-xs text-gray-500">卓:</span>
        <select
          value={selectedTableId}
          onChange={(e) => setSelectedTableId(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
        >
          {occupiedTables.length === 0 && <option value={0}>卓なし</option>}
          {occupiedTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.number} ({t.castNames.join(',')})
            </option>
          ))}
        </select>
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-white/10">
        {drinkTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-bold tracking-wide transition-colors relative ${
              activeTab === tab.key
                ? 'text-white'
                : 'text-gray-500'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Bottle tab content */}
      {activeTab === 'bottle' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-400">ボトルキープ一覧</h3>
            <button onClick={() => setShowAddBottle(true)} className="text-xs bg-white text-black px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
              <Plus size={12} /> キープ登録
            </button>
          </div>

          {/* Current table's bottles */}
          {selectedTable && (() => {
            const tableBottles = bottleKeeps.filter((b) => b.tableNumber === selectedTable.number)
            if (tableBottles.length === 0) return null
            return (
              <div className="bg-amber-900/10 border border-amber-700/30 rounded-lg p-3 mb-4">
                <div className="text-xs text-amber-400 font-bold mb-2">この卓のキープボトル</div>
                {tableBottles.map((b) => (
                  <div key={b.id} className="flex justify-between text-sm mb-1">
                    <span>{b.bottleName} ({b.customerName})</span>
                    <span className={b.remaining <= 20 ? 'text-red-400 font-bold' : ''}>{b.remaining}%</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* All bottles */}
          <div className="space-y-2">
            {sortedBottleKeeps.map((b) => (
              <div key={b.id} className={`bg-white/5 rounded-lg p-3 ${b.remaining <= 20 ? 'border border-red-500/30' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-sm">{b.bottleName}</div>
                    <div className="text-xs text-gray-500">{b.customerName} / {b.storageLocation || '場所未設定'}</div>
                    {b.tableNumber && <div className="text-xs text-gray-600">卓: {b.tableNumber}</div>}
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${b.remaining <= 20 ? 'text-red-400' : b.remaining <= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {b.remaining}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 mb-2">
                  <div
                    className={`h-1.5 rounded-full transition-all ${b.remaining <= 20 ? 'bg-red-500' : b.remaining <= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${b.remaining}%` }}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={b.remaining}
                    onChange={(e) => updateBottleKeep(b.id, { remaining: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <button onClick={() => removeBottleKeep(b.id)} className="text-xs bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {sortedBottleKeeps.length === 0 && (
            <div className="text-center text-gray-600 mt-12">
              <Wine size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">ボトルキープはありません</p>
            </div>
          )}

          {/* Add bottle modal */}
          {showAddBottle && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddBottle(false)}>
              <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">ボトルキープ登録</h2>
                  <button onClick={() => setShowAddBottle(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                </div>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ボトル名</label>
                    <input type="text" value={bottleName} onChange={(e) => setBottleName(e.target.value)} placeholder="例: 響 17年" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">残量: {bottleRemaining}%</label>
                    <input type="range" min="0" max="100" value={bottleRemaining} onChange={(e) => setBottleRemaining(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">保管場所</label>
                    <input type="text" value={bottleStorage} onChange={(e) => setBottleStorage(e.target.value)} placeholder="例: A-3" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">担当客名</label>
                    <input type="text" value={bottleCustomer} onChange={(e) => setBottleCustomer(e.target.value)} placeholder="例: 田中様" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddBottle(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
                  <button onClick={handleAddBottleKeep} disabled={!bottleName || !bottleCustomer} className="flex-1 bg-white text-black py-3 rounded-lg font-bold disabled:opacity-40">登録</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
            {menuItems.map((item) => {
              // 同じメニューがキャスト別に複数あっても合計で表示
              const orderedQty = orders.filter((o) => o.menuItem.id === item.id).reduce((s, o) => s + o.quantity, 0)
              const ordered = orderedQty > 0 ? { quantity: orderedQty } : null
              return (
                <button
                  key={item.id}
                  onClick={() => handleAdd(item)}
                  className="bg-white/5 rounded-lg p-3 text-left active:bg-white/[0.08] transition-colors relative"
                >
                  <div className="text-sm font-medium mb-1">{item.name}</div>
                  <div className="text-sm tabular-nums">
                    {item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}
                  </div>
                  {item.category === 'cast' && (
                    <div className="text-xs text-gray-600 mt-0.5">Back: {(item as CastMenuItem).backType}</div>
                  )}
                  {ordered && (
                    <span className="absolute -top-2 -right-2 bg-white text-black text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                      {ordered.quantity}
                    </span>
                  )}
                </button>
              )
            })}
            {activeTab === 'cast' && (() => {
              const helpQty = orders.filter((o) => o.menuItem.id === HELP_BACK_ITEM.id).reduce((s, o) => s + o.quantity, 0)
              const helpOrdered = helpQty > 0 ? { quantity: helpQty } : null
              return (
                <button
                  onClick={() => handleAdd(HELP_BACK_ITEM)}
                  className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 text-left active:bg-orange-500/10 transition-colors relative"
                >
                  <div className="text-sm font-medium mb-1">ヘルプ</div>
                  <div className="text-orange-300 text-sm">バック記録</div>
                  <div className="text-xs text-gray-600 mt-0.5">Back: ヘルプ</div>
                  {helpOrdered && (
                    <span className="absolute -top-2 -right-2 bg-white text-black text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                      {helpOrdered.quantity}
                    </span>
                  )}
                </button>
              )
            })()}
          </div>

          {/* Back summary */}
          {Object.keys(backSummary).length > 0 && (
            <div className="bg-purple-500/5 border-t border-purple-500/20 px-4 py-2">
              <div className="text-xs text-purple-400 mb-1">バック集計</div>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(backSummary) as [BackType, number][]).map(([type, count]) => (
                  <span key={type} className="bg-purple-500/10 text-purple-300 text-xs px-2 py-0.5 rounded">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Order list */}
          {orders.length > 0 && (
            <div className="bg-[#1a1a2e] border-t border-white/10 p-4">
              <div className="max-h-40 overflow-y-auto mb-3 space-y-1.5">
                {orders.map((o, idx) => (
                  <div key={`${o.menuItem.id}-${o.castName ?? ''}-${idx}`} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate text-gray-300">{displayOrderName(o)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRemove(o.menuItem.id, o.castName)} className="text-gray-400 bg-white/5 border border-white/10 rounded w-7 h-7 flex items-center justify-center">
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-bold tabular-nums">{o.quantity}</span>
                      <button onClick={() => {
                        if (o.castName) addOrderToTable(selectedTableId, { menuItem: o.menuItem, quantity: 1, castName: o.castName })
                        else handleAdd(o.menuItem)
                      }} className="text-gray-400 bg-white/5 border border-white/10 rounded w-7 h-7 flex items-center justify-center">
                        <Plus size={14} />
                      </button>
                      <span className="w-20 text-right text-gray-400 tabular-nums">
                        {o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}
                      </span>
                      <button onClick={() => handleDelete(o.menuItem.id, o.castName)} className="text-red-400 bg-red-500/10 border border-red-500/20 rounded p-1 ml-1">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-lg font-bold">合計</span>
                <span className="text-lg font-bold text-[#d4af37] tabular-nums">¥{total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cast 選択モーダル(cast系メニューを誰の紐付けにするか) */}
      {castSelectTarget && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setCastSelectTarget(null)}>
          <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-bold">「{castSelectTarget.name}」を誰に?</h2>
              <button onClick={() => setCastSelectTarget(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">指示書§2.3: バック付与の担当キャストを選択してください</p>
            <div className="space-y-2">
              {selectedTable.castNames.map((name) => (
                <button
                  key={name}
                  onClick={() => handleAddForCast(castSelectTarget, name)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-3 px-4 text-left font-bold transition-colors"
                >
                  {name}
                </button>
              ))}
              {/* キャスト紐付けなしで追加 */}
              <button
                onClick={() => { addOrderToTable(selectedTableId, { menuItem: castSelectTarget, quantity: 1 }); setCastSelectTarget(null) }}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 text-xs text-gray-500"
              >
                担当なしで追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
