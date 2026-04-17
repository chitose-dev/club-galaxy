import { useState } from 'react'
import { useStore } from '../store'
import { sampleDailyWork } from '../data/mock'
import type { Cast, BackType, GuestMenuItem, CastMenuItem, SetPrice, Table, StoreSettings, DailyWork, UserAccount } from '../data/mock'
import type { AttendanceRecord, Expense, ExpenseCategory, AdvancePayment, ArchivedData } from '../data/mock'
import { Pencil, Trash2, Plus, Save, Download, ChevronUp, ChevronDown, GripVertical, Clock, Printer } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { openPrintWindow } from '../utils/print'

type AdminTab = 'menu' | 'cast' | 'price' | 'tables' | 'settings' | 'export' | 'users' | 'attendance' | 'expense' | 'advance' | 'archive'

const backTypes: BackType[] = ['FD', '本D', 'Fカク', '本カク', '本カクW', '同伴', '本指名', '場内指名', 'ボトルバック', 'ヘルプ', 'その他']

export default function AdminPage() {
  const {
    guestMenu, castMenu, casts, setPrices, chargeItems, tables, storeSettings,
    billingRecords, dailyPayRequests, discountLogs,
    setGuestMenu, setCastMenu, setCasts, setSetPrices, setChargeItems, setTables, setStoreSettings,
    reorderTables, userAccounts, addUser, updateUser, deleteUser,
    attendanceRecords, addAttendance, updateAttendance,
    expenses, addExpense, removeExpense,
    advancePayments, addAdvancePayment,
    archivedData, archiveOldData,
    deductions,
  } = useStore()

  const [activeTab, setActiveTab] = useState<AdminTab>('menu')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'menu', label: 'メニュー' },
    { key: 'cast', label: 'キャスト' },
    { key: 'price', label: '料金' },
    { key: 'tables', label: '卓管理' },
    { key: 'attendance', label: '勤怠' },
    { key: 'expense', label: '経費' },
    { key: 'advance', label: '前借り' },
    { key: 'settings', label: '設定' },
    { key: 'export', label: '出力' },
    { key: 'archive', label: 'アーカイブ' },
    { key: 'users', label: 'ユーザー' },
  ]

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>管理メニュー</h2>

      {/* Scrollable horizontal tabs */}
      <div className="flex border-b border-white/10 mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-bold tracking-wide transition-colors relative whitespace-nowrap ${
              activeTab === tab.key ? 'text-white' : 'text-gray-500'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'menu' && <MenuManager guestMenu={guestMenu} castMenu={castMenu} setGuestMenu={setGuestMenu} setCastMenu={setCastMenu} />}
      {activeTab === 'cast' && <CastManager casts={casts} setCasts={setCasts} />}
      {activeTab === 'price' && <PriceManager setPrices={setPrices} chargeItems={chargeItems} setSetPrices={setSetPrices} setChargeItems={setChargeItems} />}
      {activeTab === 'tables' && <TableManager tables={tables} setTables={setTables} reorderTables={reorderTables} />}
      {activeTab === 'attendance' && <AttendanceManager attendanceRecords={attendanceRecords} addAttendance={addAttendance} updateAttendance={updateAttendance} casts={casts} />}
      {activeTab === 'expense' && <ExpenseManager expenses={expenses} addExpense={addExpense} removeExpense={removeExpense} />}
      {activeTab === 'advance' && <AdvanceManager advancePayments={advancePayments} addAdvancePayment={addAdvancePayment} casts={casts} storeSettings={storeSettings} />}
      {activeTab === 'settings' && <SettingsManager storeSettings={storeSettings} setStoreSettings={setStoreSettings} />}
      {activeTab === 'export' && <DataExport billingRecords={billingRecords} casts={casts} dailyPayRequests={dailyPayRequests} discountLogs={discountLogs} deductions={deductions} advancePayments={advancePayments} attendanceRecords={attendanceRecords} userAccounts={userAccounts} />}
      {activeTab === 'archive' && <ArchiveManager archivedData={archivedData} archiveOldData={archiveOldData} billingRecords={billingRecords} />}
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
  const [confirmTarget, setConfirmTarget] = useState<{ kind: 'guest' | 'cast'; id: number; name: string } | null>(null)

  const handleConfirmDelete = () => {
    if (!confirmTarget) return
    if (confirmTarget.kind === 'guest') {
      setGuestMenu((prev) => prev.filter((m) => m.id !== confirmTarget.id))
    } else {
      setCastMenu((prev) => prev.filter((m) => m.id !== confirmTarget.id))
    }
    setConfirmTarget(null)
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmTarget !== null}
        title="メニューを削除"
        message={`「${confirmTarget?.name ?? ''}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
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
                        <span className="text-xs text-gray-500 w-8">価格</span>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-8">原価</span>
                        <input type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                    </div>
                    <button onClick={() => { setGuestMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice), cost: Number(editCost) } : m)); setEditingId(null) }} className="text-white hover:text-gray-300">
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm tabular-nums">{item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}</span>
                      <span className="text-xs text-gray-500 ml-2">原価¥{item.cost.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)); setEditCost(String(item.cost)) }} className="text-gray-600 hover:text-white transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmTarget({ kind: 'guest', id: item.id, name: item.name })} className="text-gray-600 hover:text-red-400 transition-colors">
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
                        <span className="text-xs text-gray-500 w-8">価格</span>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-8">CB</span>
                        <input type="number" value={editCastBack} onChange={(e) => setEditCastBack(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                    </div>
                    <button onClick={() => { setCastMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice), castBack: Number(editCastBack) } : m)); setEditingId(null) }} className="text-white hover:text-gray-300">
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm tabular-nums">¥{item.price.toLocaleString()}</span>
                      <span className="text-xs text-gray-500 ml-2">CB¥{item.castBack.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)); setEditCastBack(String(item.castBack)) }} className="text-gray-600 hover:text-white transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmTarget({ kind: 'cast', id: item.id, name: item.name })} className="text-gray-600 hover:text-red-400 transition-colors">
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
  const [editRealName, setEditRealName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editGuarantee, setEditGuarantee] = useState('')
  const [editBackRates, setEditBackRates] = useState<Partial<Record<BackType, number>>>({})
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; name: string } | null>(null)
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
    setCasts((prev) => prev.map((c) => c.id === id ? { ...c, name: editName, realName: editRealName || undefined, address: editAddress || undefined, hourlyRate: Number(editRate), guaranteeRate: Number(editGuarantee) / 100, backRates: { ...editBackRates } } : c))
    setEditingId(null)
  }

  const startEdit = (cast: Cast) => {
    setEditingId(cast.id)
    setEditName(cast.name)
    setEditRealName(cast.realName ?? '')
    setEditAddress(cast.address ?? '')
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
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-600">¥</span>
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
      <ConfirmDialog
        open={confirmTarget !== null}
        title="キャストを削除"
        message={`「${confirmTarget?.name ?? ''}」を削除しますか？\n給与・出勤履歴の参照が不整合になる可能性があります。非アクティブ化を推奨します。`}
        onConfirm={() => {
          if (confirmTarget) setCasts((prev) => prev.filter((c) => c.id !== confirmTarget.id))
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
      {casts.map((cast) => (
        <div key={cast.id} className="bg-white/5 rounded-lg p-3">
          {editingId === cast.id ? (
            <div className="space-y-2">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="源氏名" />
              <div className="grid grid-cols-2 gap-2">
                <input value={editRealName} onChange={(e) => setEditRealName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs" placeholder="本名（税理士提出用）" />
                <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs" placeholder="住所（税理士提出用）" />
              </div>
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
                <button onClick={() => handleSave(cast.id)} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold">保存</button>
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
                <button onClick={() => setConfirmTarget({ id: cast.id, name: cast.name })} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
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
            <button onClick={handleAdd} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 transition-colors">
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
          <button onClick={() => handleSave(item.id, isCharge)} className="text-white hover:text-gray-300">
            <Save size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums">¥{item.price.toLocaleString()}</span>
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
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; name: string } | null>(null)

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

  const requestDelete = (id: number) => {
    const table = tables.find((t) => t.id === id)
    if (!table || table.status !== 'empty') return
    setConfirmTarget({ id, name: table.number })
  }

  const confirmDelete = () => {
    if (!confirmTarget) return
    setTables((prev) => prev.filter((t) => t.id !== confirmTarget.id))
    setConfirmTarget(null)
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
      <ConfirmDialog
        open={confirmTarget !== null}
        title="卓を削除"
        message={`卓「${confirmTarget?.name ?? ''}」を削除しますか？この操作は取り消せません。`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
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
          } ${dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-t-white' : ''}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 cursor-grab active:cursor-grabbing touch-none">
              <GripVertical size={14} />
            </span>
            <span className="font-bold text-sm">{table.number}</span>
            {table.number.includes('VIP') && <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded">VIP</span>}
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
              onClick={() => requestDelete(table.id)}
              disabled={table.status !== 'empty'}
              className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="卓番号 (例: 11)" />
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={newIsVip} onChange={(e) => setNewIsVip(e.target.checked)} className="rounded" />
            VIP卓
          </label>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 transition-colors">
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
  const [cardProcessingFeeRate, setCardProcessingFeeRate] = useState(String(storeSettings.cardProcessingFeeRate * 100))
  const [initialCash, setInitialCash] = useState(String(storeSettings.initialCash))
  const [closingDay, setClosingDay] = useState(String(storeSettings.closingDay))
  const [storeName, setStoreName] = useState(storeSettings.storeName)
  const [storeAddress, setStoreAddress] = useState(storeSettings.storeAddress)
  const [storePhone, setStorePhone] = useState(storeSettings.storePhone)
  const [invoiceNumber, setInvoiceNumber] = useState(storeSettings.invoiceNumber)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setStoreSettings({
      taxRate: Number(taxRate) / 100,
      cardFeeRate: Number(cardFeeRate) / 100,
      cardProcessingFeeRate: Number(cardProcessingFeeRate) / 100,
      initialCash: Number(initialCash),
      closingDay: Number(closingDay),
      storeName,
      storeAddress,
      storePhone,
      invoiceNumber,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">店舗設定</h3>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">店舗名</label>
        <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">店舗住所</label>
        <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="住所を入力" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">電話番号</label>
        <input type="text" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="電話番号を入力" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">インボイス登録番号</label>
        <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">TAX率 (%)</label>
        <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">客向けカード手数料率 (%)</label>
        <p className="text-[10px] text-gray-600 mb-1">会計時に客へ上乗せする手数料。</p>
        <input type="number" value={cardFeeRate} onChange={(e) => setCardFeeRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">カード会社決済手数料率 (%)</label>
        <p className="text-[10px] text-gray-600 mb-1">店舗がカード会社へ支払う手数料。経費としてFL計算に含まれます。</p>
        <input type="number" step="0.1" value={cardProcessingFeeRate} onChange={(e) => setCardProcessingFeeRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">レジ初期金額 (¥)</label>
        <input type="number" value={initialCash} onChange={(e) => setInitialCash(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">給与締め日</label>
        <input type="number" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} min="1" max="31" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <button onClick={handleSave} className={`w-full py-3 rounded-lg font-bold transition-colors ${saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-white text-black'}`}>
        {saved ? '保存しました' : '設定を保存'}
      </button>
    </div>
  )
}

function DataExport({ billingRecords, casts, dailyPayRequests, discountLogs, deductions, advancePayments, attendanceRecords, userAccounts }: {
  billingRecords: import('../data/mock').BillingRecord[]
  casts: Cast[]
  dailyPayRequests: import('../data/mock').DailyPayRequest[]
  discountLogs: import('../data/mock').DiscountLog[]
  deductions: import('../data/mock').Deduction[]
  advancePayments: AdvancePayment[]
  attendanceRecords: AttendanceRecord[]
  userAccounts: UserAccount[]
}) {
  const now = new Date()
  const [taxYear, setTaxYear] = useState(String(now.getFullYear()))
  const [taxMonth, setTaxMonth] = useState(String(now.getMonth() + 1))
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

  const handleMonthlyTaxReport = () => {
    const year = parseInt(taxYear, 10)
    const month = parseInt(taxMonth, 10)
    if (!year || !month) return
    const mm = String(month).padStart(2, '0')
    const prefix = `${year}-${mm}`

    // ボーイのstaffId生成: SalaryPageと同じハッシュ関数
    const boyStaffId = (username: string): number => {
      let h = 0
      for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0
      return -(Math.abs(h) || 1)
    }

    type Row = {
      date: string
      name: string
      kind: string
      hours: number
      gross: number
      deduction10: number
      withholdingTax: number
      storeDiff: number
      dailyPay: number
      advance: number
      deduction: number
      netPay: number
    }
    const rows: Row[] = []

    // キャスト: 月次の勤務ベースでは難しいので、日別の日払い・前借・天引を集計し、キャスト単位で1行
    for (const cast of casts.filter((c) => c.active)) {
      const work = (sampleDailyWork[cast.id] ?? []).filter((w) => w.date.startsWith(prefix))
      const totalHours = work.reduce((s, w) => s + w.hours, 0)
      const totalSales = work.reduce((s, w) => s + w.sales, 0)
      const hourlyTotal = Math.floor(cast.hourlyRate * totalHours)
      const gross = Math.max(hourlyTotal, Math.floor(totalSales * cast.guaranteeRate))

      const dailyPay = dailyPayRequests
        .filter((r) => (r.staffType ?? 'cast') === 'cast' && r.castId === cast.id)
        .filter((r) => {
          const d = r.date
          if (d.includes('-')) return d.startsWith(prefix)
          const [m] = d.split('/')
          return parseInt(m, 10) === month
        })
        .reduce((s, r) => s + r.amount, 0)

      const advance = advancePayments
        .filter((a) => a.castId === cast.id && a.date.startsWith(prefix))
        .reduce((s, a) => s + a.amount, 0)

      const deduction = deductions
        .filter((d) => (d.staffType ?? 'cast') === 'cast' && d.castId === cast.id)
        .reduce((s, d) => s + d.amount, 0)

      const deduction10 = Math.floor(gross * 0.1)
      // 法定源泉: 日給5,000円超過分の10.21%
      const withholdingTax = work.reduce((s, w) => {
        const daily = Math.floor(cast.hourlyRate * w.hours)
        const over = Math.max(0, daily - 5000)
        return s + Math.floor(over * 0.1021)
      }, 0)
      const storeDiff = deduction10 - withholdingTax
      const netPay = gross - deduction10 - dailyPay - advance - deduction

      if (gross === 0 && dailyPay === 0 && advance === 0 && deduction === 0) continue
      rows.push({
        date: prefix,
        name: cast.name,
        kind: 'キャスト',
        hours: totalHours,
        gross,
        deduction10,
        withholdingTax,
        storeDiff,
        dailyPay,
        advance,
        deduction,
        netPay,
      })
    }

    // ボーイ(黒服)
    for (const u of userAccounts.filter((u) => u.role === 'staff')) {
      const sid = boyStaffId(u.username)
      const work = attendanceRecords.filter(
        (r) => (r.staffType ?? 'boy') === 'boy' && r.staffName === u.displayName && r.date.startsWith(prefix),
      )
      const totalHours = work.reduce((s, r) => s + (r.workHours || 0), 0)
      const rate = u.hourlyRate ?? 0
      const gross = Math.floor(rate * totalHours)

      const dailyPay = dailyPayRequests
        .filter((r) => r.staffType === 'boy' && r.castId === sid)
        .filter((r) => {
          const d = r.date
          if (d.includes('-')) return d.startsWith(prefix)
          const [m] = d.split('/')
          return parseInt(m, 10) === month
        })
        .reduce((s, r) => s + r.amount, 0)

      const deduction = deductions
        .filter((d) => d.staffType === 'boy' && d.castId === sid)
        .reduce((s, d) => s + d.amount, 0)

      const deduction10 = Math.floor(gross * 0.1)
      const withholdingTax = work.reduce((s, w) => {
        const daily = Math.floor(rate * (w.workHours ?? 0))
        const over = Math.max(0, daily - 5000)
        return s + Math.floor(over * 0.1021)
      }, 0)
      const storeDiff = deduction10 - withholdingTax
      const netPay = gross - deduction10 - dailyPay - deduction

      if (gross === 0 && dailyPay === 0 && deduction === 0) continue
      rows.push({
        date: prefix,
        name: u.displayName,
        kind: 'ボーイ',
        hours: totalHours,
        gross,
        deduction10,
        withholdingTax,
        storeDiff,
        dailyPay,
        advance: 0,
        deduction,
        netPay,
      })
    }

    const headers = [
      '対象月', '氏名', '区分', '勤務時間', '総支給額',
      '独自控除10%', '法定源泉税10.21%', '店舗雑収入差額',
      '日払い合計', '前借り合計', '天引き合計', '振込額',
    ]
    const csvRows = rows.map((r) => [
      r.date, r.name, r.kind, String(r.hours),
      String(r.gross), String(r.deduction10), String(r.withholdingTax), String(r.storeDiff),
      String(r.dailyPay), String(r.advance), String(r.deduction), String(r.netPay),
    ])
    downloadCSV(`月次税務集計_${year}年${mm}月.csv`, headers, csvRows)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">データ出力 (CSV)</h3>
      <p className="text-xs text-gray-600">UTF-8 BOM付きCSV（Excelで文字化けしません）</p>

      <button onClick={handleSalesReport} className="w-full bg-white/5 rounded-lg p-4 text-left transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-white" />
          <span className="font-bold text-sm">売上日報</span>
        </div>
        <div className="text-xs text-gray-500">日付・卓・合計・支払方法</div>
        <div className="text-xs text-gray-600 mt-1">{billingRecords.length}件</div>
      </button>

      <button onClick={handleSalaryReport} className="w-full bg-white/5 rounded-lg p-4 text-left transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-white" />
          <span className="font-bold text-sm">キャスト給与一覧</span>
        </div>
        <div className="text-xs text-gray-500">名前・勤務時間・バック合計・給与</div>
        <div className="text-xs text-gray-600 mt-1">{casts.filter((c) => c.active).length}名</div>
      </button>

      <button onClick={handleDiscountReport} className="w-full bg-white/5 rounded-lg p-4 text-left transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <Download size={14} className="text-white" />
          <span className="font-bold text-sm">値引き監査ログ</span>
        </div>
        <div className="text-xs text-gray-500">正規料金・値引き額・理由・操作者</div>
        <div className="text-xs text-gray-600 mt-1">{discountLogs.length}件</div>
      </button>

      <div className="bg-white/5 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Download size={14} className="text-white" />
          <span className="font-bold text-sm">月次税務集計（税理士向け）</span>
        </div>
        <div className="text-xs text-gray-500 mb-3">給与・源泉税・店舗控除・前借り・日払い・天引きをまとめて出力</div>
        <div className="flex gap-2 mb-3">
          <select value={taxYear} onChange={(e) => setTaxYear(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select value={taxMonth} onChange={(e) => setTaxMonth(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
        <button onClick={handleMonthlyTaxReport} className="w-full bg-white text-black py-2 rounded-lg font-bold text-sm">
          {taxYear}年{taxMonth}月分をCSV出力
        </button>
      </div>
    </div>
  )
}

// ─── 勤怠管理 ───

function AttendanceManager({ attendanceRecords, addAttendance, updateAttendance, casts }: {
  attendanceRecords: AttendanceRecord[]
  addAttendance: (record: AttendanceRecord) => void
  updateAttendance: (id: number, patch: Partial<AttendanceRecord>) => void
  casts: Cast[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [staffId, setStaffId] = useState<number>(casts[0]?.id ?? 0)
  const [staffType, setStaffType] = useState<'cast' | 'boy'>('cast')

  const todayStr = new Date().toISOString().split('T')[0]
  const todayRecords = attendanceRecords.filter((r) => r.date === todayStr)

  const handleClockIn = () => {
    const cast = casts.find((c) => c.id === staffId)
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    addAttendance({
      id: Date.now(),
      staffId,
      staffName: cast?.name ?? `ボーイ${staffId}`,
      staffType,
      date: todayStr,
      clockIn: timeStr,
      clockOut: null,
      breakMinutes: 0,
      workHours: 0,
    })
    setShowAdd(false)
  }

  const handleClockOut = (record: AttendanceRecord) => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const [inH, inM] = (record.clockIn ?? '0:0').split(':').map(Number)
    const [outH, outM] = timeStr.split(':').map(Number)
    let totalMin = (outH * 60 + outM) - (inH * 60 + inM)
    if (totalMin < 0) totalMin += 24 * 60
    const workHours = Math.round((totalMin - record.breakMinutes) / 60 * 10) / 10
    updateAttendance(record.id, { clockOut: timeStr, workHours: Math.max(0, workHours) })
  }

  const handleBreakUpdate = (record: AttendanceRecord, minutes: number) => {
    updateAttendance(record.id, { breakMinutes: minutes })
    if (record.clockOut && record.clockIn) {
      const [inH, inM] = record.clockIn.split(':').map(Number)
      const [outH, outM] = record.clockOut.split(':').map(Number)
      let totalMin = (outH * 60 + outM) - (inH * 60 + inM)
      if (totalMin < 0) totalMin += 24 * 60
      const workHours = Math.round((totalMin - minutes) / 60 * 10) / 10
      updateAttendance(record.id, { breakMinutes: minutes, workHours: Math.max(0, workHours) })
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">本日の勤怠 ({todayStr})</h3>

      {todayRecords.length === 0 ? (
        <p className="text-sm text-gray-600">本日の出勤記録はありません</p>
      ) : (
        <div className="space-y-2">
          {todayRecords.map((r) => (
            <div key={r.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{r.staffName}</span>
                  <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{r.staffType === 'cast' ? 'キャスト' : 'ボーイ'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-gray-500" />
                  <span className="text-sm tabular-nums">{r.clockIn ?? '--:--'}</span>
                  <span className="text-gray-600">〜</span>
                  <span className="text-sm tabular-nums">{r.clockOut ?? '--:--'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">休憩:</span>
                  <input
                    type="number"
                    value={r.breakMinutes}
                    onChange={(e) => handleBreakUpdate(r, Number(e.target.value) || 0)}
                    className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-right tabular-nums"
                    min="0"
                  />
                  <span className="text-gray-500">分</span>
                </div>
                <span className="text-gray-500">勤務: <span className="text-white tabular-nums">{r.workHours}h</span></span>
                {!r.clockOut && (
                  <button onClick={() => handleClockOut(r)} className="ml-auto bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-bold">退勤</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <select value={staffType} onChange={(e) => setStaffType(e.target.value as 'cast' | 'boy')} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            <option value="cast">キャスト</option>
            <option value="boy">ボーイ</option>
          </select>
          {staffType === 'cast' ? (
            <select value={staffId} onChange={(e) => setStaffId(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
              {casts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="ボーイ名" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" onChange={() => setStaffId(Date.now())} />
          )}
          <div className="flex gap-2">
            <button onClick={handleClockIn} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold">出勤打刻</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5">
          <Plus size={14} /> 出勤打刻
        </button>
      )}

      {/* All records */}
      {attendanceRecords.filter((r) => r.date !== todayStr).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">過去の出勤記録</h3>
          <div className="space-y-1.5">
            {attendanceRecords.filter((r) => r.date !== todayStr).map((r) => (
              <div key={r.id} className="flex justify-between text-sm py-1.5 border-b border-white/5">
                <span className="text-gray-500">{r.date} {r.staffName}</span>
                <span className="tabular-nums">{r.clockIn}〜{r.clockOut ?? '?'} ({r.workHours}h)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 経費管理 ───

function ExpenseManager({ expenses, addExpense, removeExpense }: {
  expenses: Expense[]
  addExpense: (expense: Expense) => void
  removeExpense: (id: number) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('仕入れ（酒等）')
  const [note, setNote] = useState('')
  const [source, setSource] = useState<'register' | 'transfer'>('register')
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; label: string } | null>(null)

  const handleAdd = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    const now = new Date()
    addExpense({
      id: Date.now(),
      amount: amt,
      category,
      note,
      source,
      date: now.toISOString().split('T')[0],
      timestamp: now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    })
    setAmount('')
    setNote('')
    setShowAdd(false)
  }

  const categories: ExpenseCategory[] = ['仕入れ（酒等）', '税金', '雑費']
  const todayTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const registerTotal = expenses.filter((e) => e.source === 'register').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmTarget !== null}
        title="経費を削除"
        message={`「${confirmTarget?.label ?? ''}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (confirmTarget) removeExpense(confirmTarget.id)
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
      <h3 className="text-sm font-bold text-gray-400 mb-2">経費管理</h3>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">経費合計</div>
          <div className="font-bold text-red-400 tabular-nums">¥{todayTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">レジ現金支出</div>
          <div className="font-bold text-red-400 tabular-nums">¥{registerTotal.toLocaleString()}</div>
        </div>
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          {expenses.map((e) => (
            <div key={e.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold">¥{e.amount.toLocaleString()}</span>
                  <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{e.category}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.source === 'register' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {e.source === 'register' ? 'レジ現金' : '振込・立替'}
                  </span>
                </div>
                {e.note && <span className="text-xs text-gray-500">{e.note}</span>}
                <span className="text-xs text-gray-600 ml-2">{e.timestamp}</span>
              </div>
              <button onClick={() => setConfirmTarget({ id: e.id, label: `¥${e.amount.toLocaleString()} ${e.category}` })} className="text-gray-600 hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={() => setSource('register')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${source === 'register' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'border-white/10 text-gray-500'}`}>レジ現金</button>
            <button onClick={() => setSource('transfer')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${source === 'transfer' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'border-white/10 text-gray-500'}`}>振込・立替</button>
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!amount || Number(amount) <= 0} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold disabled:opacity-40">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5">
          <Plus size={14} /> 経費追加
        </button>
      )}
    </div>
  )
}

// ─── 前借り管理 ───

function AdvanceManager({ advancePayments, addAdvancePayment, casts, storeSettings }: {
  advancePayments: AdvancePayment[]
  addAdvancePayment: (payment: AdvancePayment) => void
  casts: Cast[]
  storeSettings: StoreSettings
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [castId, setCastId] = useState<number>(casts[0]?.id ?? 0)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [source, setSource] = useState<'register' | 'transfer'>('register')

  const handleAdd = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0 || !reason) return
    const cast = casts.find((c) => c.id === castId)
    const now = new Date()
    addAdvancePayment({
      id: Date.now(),
      castId,
      castName: cast?.name ?? '',
      amount: amt,
      source,
      reason,
      date: now.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
      timestamp: now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    })
    setAmount('')
    setReason('')
    setShowAdd(false)
  }

  const registerTotal = advancePayments.filter((p) => p.source === 'register').reduce((s, p) => s + p.amount, 0)

  const handlePrintReceipt = (p: AdvancePayment) => {
    const sourceLabel = p.source === 'register' ? 'レジ現金' : '振込・オーナー立替'
    const body = `
      <h2>前借り受領書</h2>
      <p class="center muted">${storeSettings.storeName}</p>
      <table>
        <tr><th>日付</th><td>${p.date} ${p.timestamp}</td></tr>
        <tr><th>お名前</th><td>${p.castName} 様</td></tr>
        <tr><th>金額</th><td class="bold">¥${p.amount.toLocaleString()}</td></tr>
        <tr><th>出金元</th><td>${sourceLabel}</td></tr>
        <tr><th>理由</th><td>${p.reason}</td></tr>
      </table>
      <p class="muted">上記金額を前借り金として確かに受領いたしました。</p>
      <p class="muted">給与支払時に天引きによる精算とすることに同意いたします。</p>
      <div class="sign">受領サイン</div>
    `
    openPrintWindow(body, `前借り受領書_${p.castName}`, { width: 420, height: 600 })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">前借り管理</h3>

      <div className="bg-white/5 rounded-lg p-3 text-center">
        <div className="text-xs text-gray-500">レジ現金からの前借り合計</div>
        <div className="font-bold text-red-400 tabular-nums">¥{registerTotal.toLocaleString()}</div>
      </div>

      {advancePayments.length > 0 && (
        <div className="space-y-2">
          {advancePayments.map((p) => (
            <div key={p.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{p.castName}</span>
                  <span className="text-sm text-red-400 tabular-nums">¥{p.amount.toLocaleString()}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${p.source === 'register' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {p.source === 'register' ? 'レジ現金' : '振込・立替'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{p.date}</span>
                  <button onClick={() => handlePrintReceipt(p)} className="text-gray-500 hover:text-white transition-colors" title="受領書印刷">
                    <Printer size={13} />
                  </button>
                </div>
              </div>
              <span className="text-xs text-gray-500">{p.reason}</span>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <select value={castId} onChange={(e) => setCastId(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm">
            {casts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（必須）" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setSource('register')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${source === 'register' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'border-white/10 text-gray-500'}`}>レジ現金</button>
            <button onClick={() => setSource('transfer')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${source === 'transfer' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'border-white/10 text-gray-500'}`}>振込・立替</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!amount || Number(amount) <= 0 || !reason} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold disabled:opacity-40">記録</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5">
          <Plus size={14} /> 前借り記録
        </button>
      )}
    </div>
  )
}

// ─── アーカイブ ───

function ArchiveManager({ archivedData, archiveOldData, billingRecords }: {
  archivedData: ArchivedData[]
  archiveOldData: (beforeDate: string) => void
  billingRecords: import('../data/mock').BillingRecord[]
}) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">データアーカイブ</h3>
      <p className="text-xs text-gray-600">古いデータを退避して動作遅延を防止します</p>

      <div className="bg-white/5 rounded-lg p-3 text-center">
        <div className="text-xs text-gray-500">現在の会計レコード数</div>
        <div className="font-bold tabular-nums">{billingRecords.length}件</div>
      </div>

      {billingRecords.length > 10 && (
        <>
          {showConfirm ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400 mb-3">古い会計データをアーカイブしますか？この操作は元に戻せません。</p>
              <div className="flex gap-2">
                <button onClick={() => { archiveOldData(new Date().toISOString().split('T')[0]); setShowConfirm(false) }} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold">実行</button>
                <button onClick={() => setShowConfirm(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowConfirm(true)} className="w-full bg-white/5 border border-white/10 py-3 rounded-lg text-sm text-gray-400 font-bold">古いデータをアーカイブ</button>
          )}
        </>
      )}

      {archivedData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-400 mb-2">アーカイブ済み</h4>
          {archivedData.map((a) => (
            <div key={a.id} className="bg-white/5 rounded-lg p-3 mb-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{a.dateRange}</span>
                <span className="tabular-nums">{a.billingCount}件 / ¥{a.totalSales.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{new Date(a.archivedAt).toLocaleString('ja-JP')}</div>
            </div>
          ))}
        </div>
      )}
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
  const [formHourlyRate, setFormHourlyRate] = useState('1500')
  const [confirmTarget, setConfirmTarget] = useState<{ username: string; label: string } | null>(null)

  const startEdit = (u: UserAccount) => {
    setEditingUsername(u.username)
    setFormDisplay(u.displayName)
    setFormPin(u.pin)
    setFormRole(u.role)
    setFormCastId(u.castId)
    setFormHourlyRate(String(u.hourlyRate ?? 1500))
  }

  const handleSaveEdit = (username: string) => {
    updateUser(username, {
      displayName: formDisplay,
      pin: formPin,
      role: formRole,
      castId: formRole === 'cast' ? formCastId : undefined,
      hourlyRate: formRole === 'staff' ? Number(formHourlyRate) : undefined,
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
      hourlyRate: formRole === 'staff' ? Number(formHourlyRate) : undefined,
    })
    setFormName('')
    setFormDisplay('')
    setFormPin('')
    setFormRole('staff')
    setFormCastId(undefined)
    setFormHourlyRate('1500')
    setShowAdd(false)
  }

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={confirmTarget !== null}
        title="ユーザーを削除"
        message={`「${confirmTarget?.label ?? ''}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (confirmTarget) deleteUser(confirmTarget.username)
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
      <h3 className="text-sm font-bold text-gray-400 mb-2">ユーザー一覧</h3>

      {userAccounts.map((u) => (
        <div key={u.username} className="bg-white/5 rounded-lg p-3">
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
              {formRole === 'staff' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">時給（給与計算用）</label>
                  <input type="number" value={formHourlyRate} onChange={(e) => setFormHourlyRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="時給" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleSaveEdit(u.username)} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold">保存</button>
                <button onClick={() => setEditingUsername(null)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{u.displayName}</span>
                <span className="text-xs text-gray-600">@{u.username}</span>
                <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{roleLabels[u.role]}</span>
                {u.role === 'cast' && u.castId && (
                  <span className="text-xs text-purple-400/70">#{casts.find((c) => c.id === u.castId)?.name ?? u.castId}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => startEdit(u)} className="text-gray-600 hover:text-white transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setConfirmTarget({ username: u.username, label: u.displayName })}
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
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
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
          {formRole === 'staff' && (
            <input type="number" value={formHourlyRate} onChange={(e) => setFormHourlyRate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="時給（給与計算用）" />
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowAdd(true); setFormName(''); setFormDisplay(''); setFormPin(''); setFormRole('staff'); setFormCastId(undefined) }} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 transition-colors">
          <Plus size={14} /> ユーザー追加
        </button>
      )}
    </div>
  )
}
