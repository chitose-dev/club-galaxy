import { useState } from 'react'
import { useStore } from '../store'
import { sampleDailyWork } from '../data/mock'
import type { Cast, BackType, GuestMenuItem, CastMenuItem, SetPrice, Table, StoreSettings, DailyWork, UserAccount } from '../data/mock'
import { Pencil, Trash2, Plus, Save, Download, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'

type AdminTab = 'menu' | 'cast' | 'price' | 'tables' | 'settings' | 'export' | 'users'

const backTypes: BackType[] = ['FD', '本D', 'Fカク', '本カク', '本カクW', '同伴', '本指名', '場内指名', 'ボトルバック', 'ヘルプ', 'その他']

export default function AdminPage() {
  const {
    guestMenu, castMenu, casts, setPrices, chargeItems, tables, storeSettings,
    billingRecords, dailyPayRequests, discountLogs,
    setGuestMenu, setCastMenu, setCasts, setSetPrices, setChargeItems, setTables, setStoreSettings,
    reorderTables, userAccounts, addUser, updateUser, deleteUser,
  } = useStore()

  const [activeTab, setActiveTab] = useState<AdminTab>('menu')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'menu', label: 'メニュー' },
    { key: 'cast', label: 'キャスト' },
    { key: 'price', label: '料金' },
    { key: 'tables', label: '卓管理' },
    { key: 'settings', label: '設定' },
    { key: 'export', label: '出力' },
    { key: 'users', label: 'ユーザー' },
  ]

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4 text-[#d4af37]" style={{ fontFamily: "var(--font-display)" }}>管理メニュー</h2>

      {/* Scrollable horizontal tabs */}
      <div className="flex border-b border-white/10 mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-bold tracking-wide transition-colors relative whitespace-nowrap ${
              activeTab === tab.key ? 'text-[#d4af37]' : 'text-gray-500'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#d4af37] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'menu' && <MenuManager guestMenu={guestMenu} castMenu={castMenu} setGuestMenu={setGuestMenu} setCastMenu={setCastMenu} />}
      {activeTab === 'cast' && <CastManager casts={casts} setCasts={setCasts} />}
      {activeTab === 'price' && <PriceManager setPrices={setPrices} chargeItems={chargeItems} setSetPrices={setSetPrices} setChargeItems={setChargeItems} />}
      {activeTab === 'tables' && <TableManager tables={tables} setTables={setTables} reorderTables={reorderTables} />}
      {activeTab === 'settings' && <SettingsManager storeSettings={storeSettings} setStoreSettings={setStoreSettings} />}
      {activeTab === 'export' && <DataExport billingRecords={billingRecords} casts={casts} dailyPayRequests={dailyPayRequests} discountLogs={discountLogs} />}
      {activeTab === 'users' && <UserManager userAccounts={userAccounts} addUser={addUser} updateUser={updateUser} deleteUser={deleteUser} casts={casts} />}
    </div>
  )
}

function MenuManager({ guestMenu, castMenu, setGuestMenu, setCastMenu }: {
  guestMenu: GuestMenuItem[]; castMenu: CastMenuItem[]
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editCastBack, setEditCastBack] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">ゲスト用ドリンク</h3>
        <div className="divide-y divide-white/5">
          {guestMenu.map((item) => (
            <div key={item.id} className="py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.name}</span>
                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-8">価格</span>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-8">原価</span>
                        <input type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                    </div>
                    <button onClick={() => { setGuestMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice), cost: Number(editCost) } : m)); setEditingId(null) }} className="text-[#d4af37] hover:text-[#e8c952]">
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm text-[#d4af37] tabular-nums">{item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}</span>
                      <span className="text-[10px] text-gray-500 ml-2">原価¥{item.cost.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)); setEditCost(String(item.cost)) }} className="text-gray-600 hover:text-white transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setGuestMenu((prev) => prev.filter((m) => m.id !== item.id))} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">キャスト用ドリンク</h3>
        <div className="divide-y divide-white/5">
          {castMenu.map((item) => (
            <div key={item.id} className="py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{item.name}</span>
                  <span className="text-xs text-purple-400/70 ml-2">Back: {item.backType}</span>
                </div>
                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-8">価格</span>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-8">CB</span>
                        <input type="number" value={editCastBack} onChange={(e) => setEditCastBack(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                    </div>
                    <button onClick={() => { setCastMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice), castBack: Number(editCastBack) } : m)); setEditingId(null) }} className="text-[#d4af37] hover:text-[#e8c952]">
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm text-[#d4af37] tabular-nums">¥{item.price.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-500 ml-2">CB¥{item.castBack.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)); setEditCastBack(String(item.castBack)) }} className="text-gray-600 hover:text-white transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setCastMenu((prev) => prev.filter((m) => m.id !== item.id))} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CastManager({ casts, setCasts }: { casts: Cast[]; setCasts: React.Dispatch<React.SetStateAction<Cast[]>> }) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editGuarantee, setEditGuarantee] = useState('')
  const [editBackRates, setEditBackRates] = useState<Partial<Record<BackType, number>>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('2000')
  const [newGuarantee, setNewGuarantee] = useState('45')
  const [newBackRates, setNewBackRates] = useState<Partial<Record<BackType, number>>>(() => {
    const rates: Partial<Record<BackType, number>> = {}
    backTypes.forEach((bt) => { rates[bt] = 0 })
    return rates
  })

  const handleSave = (id: number) => {
    setCasts((prev) => prev.map((c) => c.id === id ? { ...c, name: editName, hourlyRate: Number(editRate), guaranteeRate: Number(editGuarantee) / 100, backRates: { ...editBackRates } } : c))
    setEditingId(null)
  }

  const startEdit = (cast: Cast) => {
    setEditingId(cast.id)
    setEditName(cast.name)
    setEditRate(String(cast.hourlyRate))
    setEditGuarantee(String(Math.round(cast.guaranteeRate * 100)))
    setEditBackRates({ ...cast.backRates })
  }

  const handleAdd = () => {
    if (!newName) return
    const maxId = Math.max(...casts.map((c) => c.id), 0)
    setCasts((prev) => [...prev, { id: maxId + 1, name: newName, hourlyRate: Number(newRate), backRates: { ...newBackRates }, guaranteeRate: Number(newGuarantee) / 100, active: true }])
    setNewName('')
    setNewRate('2000')
    setNewGuarantee('45')
    const resetRates: Partial<Record<BackType, number>> = {}
    backTypes.forEach((bt) => { resetRates[bt] = 0 })
    setNewBackRates(resetRates)
    setShowAdd(false)
  }

  const backRateInputs = (rates: Partial<Record<BackType, number>>, setRates: (r: Partial<Record<BackType, number>>) => void) => (
    <div>
      <label className="text-xs text-gray-500 block mb-1.5">バック単価</label>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {backTypes.map((bt) => (
          <div key={bt} className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 w-16 shrink-0 truncate">{bt}</span>
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">¥</span>
              <input
                type="number"
                value={rates[bt] ?? 0}
                onChange={(e) => setRates({ ...rates, [bt]: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded pl-5 pr-2 py-1 text-xs text-right tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {casts.map((cast) => (
        <div key={cast.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          {editingId === cast.id ? (
            <div className="space-y-2">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="名前" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">時給</label>
                  <input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="時給" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">売上保証率 (%)</label>
                  <input type="number" value={editGuarantee} onChange={(e) => setEditGuarantee(e.target.value)} min="0" max="100" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="%" />
                </div>
              </div>
              {backRateInputs(editBackRates, setEditBackRates)}
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleSave(cast.id)} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">保存</button>
                <button onClick={() => setEditingId(null)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm">{cast.name}</span>
                <span className="text-sm text-gray-500 ml-2 tabular-nums">¥{cast.hourlyRate.toLocaleString()}/h</span>
                <span className="text-xs text-purple-400/70 ml-2">保証{Math.round(cast.guaranteeRate * 100)}%</span>
                {!cast.active && <span className="text-xs text-red-400/70 ml-2">非アクティブ</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(cast)} className="text-gray-600 hover:text-white transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => setCasts((prev) => prev.map((c) => c.id === cast.id ? { ...c, active: !c.active } : c))} className="text-xs bg-white/5 border border-white/10 px-2 py-1 rounded text-gray-500 hover:text-white transition-colors">{cast.active ? '無効化' : '有効化'}</button>
                <button onClick={() => setCasts((prev) => prev.filter((c) => c.id !== cast.id))} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="キャスト名" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">時給</label>
              <input type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="時給" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">売上保証率 (%)</label>
              <input type="number" value={newGuarantee} onChange={(e) => setNewGuarantee(e.target.value)} min="0" max="100" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="%" />
            </div>
          </div>
          {backRateInputs(newBackRates, setNewBackRates)}
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 hover:border-[#d4af37]/30 transition-colors">
          <Plus size={14} /> キャスト追加
        </button>
      )}
    </div>
  )
}

function PriceManager({ setPrices, chargeItems, setSetPrices, setChargeItems }: {
  setPrices: SetPrice[]
  chargeItems: SetPrice[]
  setSetPrices: React.Dispatch<React.SetStateAction<SetPrice[]>>
  setChargeItems: React.Dispatch<React.SetStateAction<SetPrice[]>>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')

  const handleSave = (id: string, isCharge: boolean) => {
    const setter = isCharge ? setChargeItems : setSetPrices
    setter((prev) => prev.map((p) => p.id === id ? { ...p, price: Number(editPrice) } : p))
    setEditingId(null)
  }

  const renderRow = (item: { id: string; label: string; price: number }, isCharge: boolean) => (
    <div key={item.id} className="flex items-center justify-between py-2.5">
      <span className="text-sm">{item.label}</span>
      {editingId === item.id ? (
        <div className="flex items-center gap-2">
          <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
          <button onClick={() => handleSave(item.id, isCharge)} className="text-[#d4af37] hover:text-[#e8c952]">
            <Save size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#d4af37] tabular-nums">¥{item.price.toLocaleString()}</span>
          <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)) }} className="text-gray-600 hover:text-white transition-colors">
            <Pencil size={13} />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">セット料金（時間帯別）</h3>
        <div className="divide-y divide-white/5">{setPrices.map((item) => renderRow(item, false))}</div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">チャージ・指名料</h3>
        <div className="divide-y divide-white/5">{chargeItems.map((item) => renderRow(item, true))}</div>
      </div>
    </div>
  )
}

function TableManager({ tables, setTables, reorderTables }: {
  tables: Table[]
  setTables: React.Dispatch<React.SetStateAction<Table[]>>
  reorderTables: (fromIndex: number, toIndex: number) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIsVip, setNewIsVip] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleAdd = () => {
    if (!newName) return
    const maxId = Math.max(...tables.map((t) => t.id), 0)
    setTables((prev) => [...prev, {
      id: maxId + 1,
      number: newIsVip ? `VIP${newName}` : newName,
      status: 'empty' as const,
      guestCount: 0,
      startTime: null,
      castNames: [],
      nomination: null,
      setCount: 0,
      orders: [],
    }])
    setNewName('')
    setNewIsVip(false)
    setShowAdd(false)
  }

  const handleDelete = (id: number) => {
    const table = tables.find((t) => t.id === id)
    if (table && table.status !== 'empty') return
    setTables((prev) => prev.filter((t) => t.id !== id))
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderTables(dragIndex, toIndex)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 mb-2">卓一覧</h3>
      {tables.map((table, index) => (
        <div
          key={table.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`flex items-center justify-between py-2.5 border-b border-white/5 transition-colors ${
            dragIndex === index ? 'opacity-40' : ''
          } ${dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-t-[#d4af37]' : ''}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 cursor-grab active:cursor-grabbing touch-none">
              <GripVertical size={14} />
            </span>
            <span className="font-bold text-sm">{table.number}</span>
            {table.number.includes('VIP') && <span className="text-[10px] bg-[#d4af37]/10 text-[#d4af37] px-1.5 py-0.5 rounded">VIP</span>}
            <span className={`text-xs ${table.status === 'empty' ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>
              ({table.status === 'empty' ? '空き' : '使用中'})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => index > 0 && reorderTables(index, index - 1)}
              disabled={index === 0}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => index < tables.length - 1 && reorderTables(index, index + 1)}
              disabled={index === tables.length - 1}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => handleDelete(table.id)}
              disabled={table.status !== 'empty'}
              className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="卓番号 (例: 11)" />
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={newIsVip} onChange={(e) => setNewIsVip(e.target.checked)} className="rounded" />
            VIP卓
          </label>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 hover:border-[#d4af37]/30 transition-colors">
          <Plus size={14} /> 卓追加
        </button>
      )}
    </div>
  )
}

function SettingsManager({ storeSettings, setStoreSettings }: {
  storeSettings: StoreSettings
  setStoreSettings: React.Dispatch<React.SetStateAction<StoreSettings>>
}) {
  const [taxRate, setTaxRate] = useState(String(storeSettings.taxRate * 100))
  const [cardFeeRate, setCardFeeRate] = useState(String(storeSettings.cardFeeRate * 100))
  const [initialCash, setInitialCash] = useState(String(storeSettings.initialCash))
  const [closingDay, setClosingDay] = useState(String(storeSettings.closingDay))
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setStoreSettings({
      taxRate: Number(taxRate) / 100,
      cardFeeRate: Number(cardFeeRate) / 100,
      initialCash: Number(initialCash),
      closingDay: Number(closingDay),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">店舗設定</h3>

      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">TAX率 (%)</label>
        <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
        <p className="text-xs text-gray-600 mt-1">デフォルト: 20%</p>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">カード手数料率 (%)</label>
        <input type="number" value={cardFeeRate} onChange={(e) => setCardFeeRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
        <p className="text-xs text-gray-600 mt-1">デフォルト: 10%</p>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">レジ初期金額 (¥)</label>
        <input type="number" value={initialCash} onChange={(e) => setInitialCash(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
        <p className="text-xs text-gray-600 mt-1">デフォルト: ¥100,000</p>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">給与締め日</label>
        <input type="number" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} min="1" max="31" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
        <p className="text-xs text-gray-600 mt-1">デフォルト: 15日</p>
      </div>

      <button onClick={handleSave} className={`w-full py-3 rounded-lg font-bold transition-colors ${saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-[#d4af37] text-black'}`}>
        {saved ? '保存しました' : '設定を保存'}
      </button>
    </div>
  )
}

function DataExport({ billingRecords, casts, dailyPayRequests, discountLogs }: {
  billingRecords: import('../data/mock').BillingRecord[]
  casts: Cast[]
  dailyPayRequests: import('../data/mock').DailyPayRequest[]
  discountLogs: import('../data/mock').DiscountLog[]
}) {
  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSalesReport = () => {
    const headers = ['日時', '卓番号', '合計金額', '支払方法', '現金', 'カード', 'カード手数料']
    const rows = billingRecords.map((r) => [
      r.timestamp,
      r.tableNumber,
      String(r.total),
      r.paymentMethod === 'cash' ? '現金' : r.paymentMethod === 'card' ? 'カード' : '現金+カード',
      String(r.cashAmount ?? ''),
      String(r.cardAmount ?? ''),
      String(r.cardFee ?? ''),
    ])
    downloadCSV(`売上日報_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
  }

  const handleSalaryReport = () => {
    const headers = ['キャスト名', '時給', '保証率', '勤務時間合計', 'バック合計', '売上合計', '日払い合計']
    const rows = casts.filter((c) => c.active).map((c) => {
      const work: DailyWork[] = sampleDailyWork[c.id] ?? []
      const totalHours = work.reduce((s, w) => s + w.hours, 0)
      const totalSales = work.reduce((s, w) => s + w.sales, 0)
      const dailyPayTotal = dailyPayRequests.filter((r) => r.castId === c.id).reduce((s, r) => s + r.amount, 0)
      return [
        c.name,
        String(c.hourlyRate),
        `${(c.guaranteeRate * 100).toFixed(0)}%`,
        `${totalHours}h`,
        '',
        String(totalSales),
        String(dailyPayTotal),
      ]
    })
    downloadCSV(`キャスト給与一覧_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
  }

  const handleDiscountReport = () => {
    const headers = ['日時', '卓番号', '正規料金', '値引き額', '理由', '操作者']
    const rows = discountLogs.map((l) => [
      l.timestamp,
      l.tableNumber,
      String(l.originalTotal),
      String(l.discountAmount),
      `"${l.reason}"`,
      l.operator,
    ])
    downloadCSV(`値引き監査ログ_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">データ出力 (CSV)</h3>
      <p className="text-xs text-gray-600">UTF-8 BOM付きCSV（Excelで文字化けしません）</p>

      <button onClick={handleSalesReport} className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-4 text-left hover:border-[#d4af37]/30 transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-[#d4af37]" />
          <span className="font-bold text-sm">売上日報</span>
        </div>
        <div className="text-xs text-gray-500">日付・卓・合計・支払方法</div>
        <div className="text-xs text-gray-600 mt-1">{billingRecords.length}件</div>
      </button>

      <button onClick={handleSalaryReport} className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-4 text-left hover:border-[#d4af37]/30 transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-[#d4af37]" />
          <span className="font-bold text-sm">キャスト給与一覧</span>
        </div>
        <div className="text-xs text-gray-500">名前・勤務時間・バック合計・給与</div>
        <div className="text-xs text-gray-600 mt-1">{casts.filter((c) => c.active).length}名</div>
      </button>

      <button onClick={handleDiscountReport} className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-4 text-left hover:border-[#d4af37]/30 transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-[#d4af37]" />
          <span className="font-bold text-sm">値引き監査ログ</span>
        </div>
        <div className="text-xs text-gray-500">正規料金・値引き額・理由・操作者</div>
        <div className="text-xs text-gray-600 mt-1">{discountLogs.length}件</div>
      </button>
    </div>
  )
}

const roleLabels: Record<UserAccount['role'], string> = { owner: 'オーナー', staff: '黒服', cast: 'キャスト' }

function UserManager({ userAccounts, addUser, updateUser, deleteUser, casts }: {
  userAccounts: UserAccount[]
  addUser: (user: UserAccount) => void
  updateUser: (username: string, patch: Partial<UserAccount>) => void
  deleteUser: (username: string) => void
  casts: Cast[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDisplay, setFormDisplay] = useState('')
  const [formPin, setFormPin] = useState('')
  const [formRole, setFormRole] = useState<UserAccount['role']>('staff')
  const [formCastId, setFormCastId] = useState<number | undefined>(undefined)

  const startEdit = (u: UserAccount) => {
    setEditingUsername(u.username)
    setFormDisplay(u.displayName)
    setFormPin(u.pin)
    setFormRole(u.role)
    setFormCastId(u.castId)
  }

  const handleSaveEdit = (username: string) => {
    updateUser(username, {
      displayName: formDisplay,
      pin: formPin,
      role: formRole,
      castId: formRole === 'cast' ? formCastId : undefined,
    })
    setEditingUsername(null)
  }

  const handleAdd = () => {
    if (!formName || !formPin) return
    addUser({
      username: formName,
      displayName: formDisplay || formName,
      pin: formPin,
      role: formRole,
      castId: formRole === 'cast' ? formCastId : undefined,
    })
    setFormName('')
    setFormDisplay('')
    setFormPin('')
    setFormRole('staff')
    setFormCastId(undefined)
    setShowAdd(false)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 mb-2">ユーザー一覧</h3>

      {userAccounts.map((u) => (
        <div key={u.username} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          {editingUsername === u.username ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">ユーザー名: {u.username}</div>
              <input value={formDisplay} onChange={(e) => setFormDisplay(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="表示名" />
              <input value={formPin} onChange={(e) => setFormPin(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="PIN" maxLength={8} />
              <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserAccount['role'])} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
                <option value="owner">オーナー</option>
                <option value="staff">黒服</option>
                <option value="cast">キャスト</option>
              </select>
              {formRole === 'cast' && (
                <select value={formCastId ?? ''} onChange={(e) => setFormCastId(e.target.value ? Number(e.target.value) : undefined)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
                  <option value="">-- キャスト紐付け --</option>
                  {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleSaveEdit(u.username)} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">保存</button>
                <button onClick={() => setEditingUsername(null)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{u.displayName}</span>
                <span className="text-xs text-gray-600">@{u.username}</span>
                <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{roleLabels[u.role]}</span>
                {u.role === 'cast' && u.castId && (
                  <span className="text-xs text-purple-400/70">#{casts.find((c) => c.id === u.castId)?.name ?? u.castId}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => startEdit(u)} className="text-gray-600 hover:text-white transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => deleteUser(u.username)}
                  disabled={u.role === 'owner'}
                  className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="ユーザー名" />
          <input value={formDisplay} onChange={(e) => setFormDisplay(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="表示名" />
          <input value={formPin} onChange={(e) => setFormPin(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="PIN" maxLength={8} />
          <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserAccount['role'])} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            <option value="owner">オーナー</option>
            <option value="staff">黒服</option>
            <option value="cast">キャスト</option>
          </select>
          {formRole === 'cast' && (
            <select value={formCastId ?? ''} onChange={(e) => setFormCastId(e.target.value ? Number(e.target.value) : undefined)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
              <option value="">-- キャスト紐付け --</option>
              {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowAdd(true); setFormName(''); setFormDisplay(''); setFormPin(''); setFormRole('staff'); setFormCastId(undefined) }} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 hover:border-[#d4af37]/30 transition-colors">
          <Plus size={14} /> ユーザー追加
        </button>
      )}
    </div>
  )
}
