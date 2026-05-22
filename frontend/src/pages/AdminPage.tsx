import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store'
import { castsApi } from '../api/casts'
import { dailyReportsApi } from '../api/dailyReports'
import { isPercentBackType } from '../data/mock'
import { computeDailyWork } from '../utils/dailyWork'
import { calcHourlyPay } from '../utils/payroll'
import type { Cast, BackType, GuestMenuItem, CastMenuItem, SetPrice, Table, StoreSettings, DailyWork, UserAccount, BillingRecord } from '../data/mock'
import type { AttendanceRecord, Expense, ExpenseCategory, AdvancePayment, ArchivedData, DailyReport } from '../data/mock'
import React from 'react'
import { Pencil, Trash2, Plus, Save, Download, ChevronUp, ChevronDown, GripVertical, Clock, Printer, FileText, Wallet } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { openPrintWindow } from '../utils/print'
import ContextualHeader from '../components/ContextualHeader'
import Tabs, { type TabItem } from '../components/Tabs'
import NumberInput from '../components/NumberInput'
import { getTodayBusinessDay, formatBusinessDay } from '../utils/businessDay'
// PDF E: 勤怠 UI 拡張用
import Modal from '../components/Modal'
import { Input, Field } from '../components/Input'
import { GoldButton, GhostButton } from '../components/Buttons'
import PayslipPopup from '../components/PayslipPopup'
import { formatRealtimeWorkRange, roundClockInHHMM, roundClockOutHHMM, calcWorkHours } from '../utils/quarterHour'
import { useAuth } from '../auth'

type AdminTab =
  | 'menu' | 'cast' | 'price' | 'tables' | 'settings' | 'export' | 'users'
  | 'attendance' | 'expense' | 'advance' | 'archive'
  | 'dailypay' | 'prepay' | 'uncollected' | 'dailyreport'

const backTypes: BackType[] = [
  'FD', '本D',
  'Fカク', '本カク', '本カクW',
  'Fショ', '本ショ',
  'FP', '本P',
  'FB', '本B',
  '同伴', '本指名', '場内指名',
  'ボトルバック', 'ヘルプ', 'その他',
]

export default function AdminPage() {
  const {
    guestMenu, castMenu, casts, setPrices, chargeItems, tables, storeSettings,
    billingRecords, dailyPayRequests, discountLogs,
    setGuestMenu, setCastMenu, setCasts, setSetPrices, setChargeItems, setTables, setStoreSettings,
    reorderTables, userAccounts, addUser, updateUser, deleteUser,
    attendanceRecords, addAttendance, updateAttendance,
    attendanceSchedules, addAttendanceSchedule, removeAttendanceSchedule, markScheduleProcessed,
    expenses, addExpense, removeExpense,
    advancePayments, addAdvancePayment,
    archivedData, archiveOldData,
    deductions, addDailyPayRequest,
    menuCategories, setMenuCategories,
    updateBillingRecord,
    dailyReports, setDailyReports,
  } = useStore()

  // ?tab=<key> クエリで初期タブを指定可能（未収回収後に navigate('/admin?tab=uncollected') 等）
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as AdminTab | null
  const validTabs: AdminTab[] = [
    'menu', 'cast', 'price', 'tables', 'attendance', 'dailypay', 'advance',
    'prepay', 'expense', 'uncollected', 'dailyreport', 'settings', 'export', 'archive', 'users',
  ]
  const [activeTab, setActiveTab] = useState<AdminTab>(
    tabParam && validTabs.includes(tabParam) ? tabParam : 'menu',
  )

  const tabs: TabItem<AdminTab>[] = [
    { key: 'menu', label: 'メニュー' },
    { key: 'cast', label: 'キャスト' },
    { key: 'price', label: '料金' },
    { key: 'tables', label: '卓管理' },
    { key: 'attendance', label: '勤怠' },
    { key: 'dailypay', label: '日払い' }, // 追補02 R11-1: 基本運用は日払い
    { key: 'advance', label: '前借り' },
    { key: 'prepay', label: '前払い' },   // 追補02 R11-5: 出勤未出勤問わず
    { key: 'expense', label: '経費' },
    { key: 'uncollected', label: '未収管理' },
    { key: 'dailyreport', label: '日報・レジ締め' },
    { key: 'settings', label: '設定' },
    { key: 'export', label: '出力' },
    { key: 'archive', label: 'アーカイブ' },
    { key: 'users', label: 'ユーザー' },
  ]

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader accent="admin" title="管理メニュー" backTo="/top" />
      <div className="p-4 flex-1">

      <div className="-mx-4 px-4 mb-4">
        <Tabs<AdminTab> value={activeTab} onChange={setActiveTab} items={tabs} scrollable />
      </div>

      {activeTab === 'menu' && <MenuManager guestMenu={guestMenu} castMenu={castMenu} setGuestMenu={setGuestMenu} setCastMenu={setCastMenu} menuCategories={menuCategories} setMenuCategories={setMenuCategories} />}
      {activeTab === 'cast' && <CastManager casts={casts} setCasts={setCasts} addUser={addUser} />}
      {activeTab === 'price' && <PriceManager setPrices={setPrices} chargeItems={chargeItems} setSetPrices={setSetPrices} setChargeItems={setChargeItems} />}
      {activeTab === 'tables' && <TableManager tables={tables} setTables={setTables} reorderTables={reorderTables} />}
      {activeTab === 'attendance' && <AttendanceManager attendanceRecords={attendanceRecords} addAttendance={addAttendance} updateAttendance={updateAttendance} casts={casts} attendanceSchedules={attendanceSchedules} addAttendanceSchedule={addAttendanceSchedule} removeAttendanceSchedule={removeAttendanceSchedule} markScheduleProcessed={markScheduleProcessed} />}
      {activeTab === 'expense' && <ExpenseManager expenses={expenses} addExpense={addExpense} removeExpense={removeExpense} />}
      {activeTab === 'uncollected' && <UncollectedManager billingRecords={billingRecords} updateBillingRecord={updateBillingRecord} />}
      {activeTab === 'dailyreport' && <DailyReportManager dailyReports={dailyReports} setDailyReports={setDailyReports} billingRecords={billingRecords} />}
      {activeTab === 'advance' && <AdvanceManager advancePayments={advancePayments} addAdvancePayment={addAdvancePayment} casts={casts} storeSettings={storeSettings} />}
      {activeTab === 'dailypay' && <DailyPayManager casts={casts} attendanceRecords={attendanceRecords} dailyPayRequests={dailyPayRequests} addDailyPayRequest={addDailyPayRequest} />}
      {activeTab === 'prepay' && <PrepayManager casts={casts} advancePayments={advancePayments} addAdvancePayment={addAdvancePayment} />}
      {activeTab === 'settings' && <SettingsManager storeSettings={storeSettings} setStoreSettings={setStoreSettings} />}
      {activeTab === 'export' && <DataExport billingRecords={billingRecords} casts={casts} dailyPayRequests={dailyPayRequests} discountLogs={discountLogs} deductions={deductions} advancePayments={advancePayments} attendanceRecords={attendanceRecords} userAccounts={userAccounts} />}
      {activeTab === 'archive' && <ArchiveManager archivedData={archivedData} archiveOldData={archiveOldData} billingRecords={billingRecords} />}
      {activeTab === 'users' && <UserManager userAccounts={userAccounts} addUser={addUser} updateUser={updateUser} deleteUser={deleteUser} casts={casts} />}
      </div>
    </div>
  )
}

// ISSUE-008: ハードコードの subcategory 配列・ラベルマップは廃止
// → メニュー登録フォームの select は menuCategories（store 管理）から動的生成。
//    カテゴリ追加が即時反映される。

function MenuManager({ guestMenu, castMenu, setGuestMenu, setCastMenu, menuCategories, setMenuCategories }: {
  guestMenu: GuestMenuItem[]; castMenu: CastMenuItem[]
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
  menuCategories: import('../data/mock').MenuCategory[]
  setMenuCategories: React.Dispatch<React.SetStateAction<import('../data/mock').MenuCategory[]>>
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editCastBack, setEditCastBack] = useState('')
  // PDF G: ゼロ円ボトルメニュー用。bottleBackBasePerUnit を編集できるようにする。
  const [editBottleBackBase, setEditBottleBackBase] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<{ kind: 'guest' | 'cast'; id: number; name: string } | null>(null)

  // ─── 新規追加フォーム (追補02 R5-1) ───
  const [addKind, setAddKind] = useState<'guest' | 'cast' | null>(null)
  const [addName, setAddName] = useState('')
  const [addPrice, setAddPrice] = useState(0)
  const [addCost, setAddCost] = useState(0)
  const [addCastBack, setAddCastBack] = useState(0)
  const [addGuestSub, setAddGuestSub] = useState<GuestMenuItem['subcategory']>('shot')
  // PDF G: 0 円ボトル用バック基準額。空文字なら未指定 (= price を使う)。
  const [addBottleBackBase, setAddBottleBackBase] = useState('')
  const [addCastSub, setAddCastSub] = useState<CastMenuItem['subcategory']>('fdrink')
  const [addBackType, setAddBackType] = useState<BackType>('FD')
  // ISSUE-001: 商品名の prefix で指名種別 (F / 本) を自動判定。
  //   不一致時はユーザーに二択を促すヒントを表示。
  const [nominationHint, setNominationHint] = useState<'free' | 'honshimei' | 'unknown' | null>(null)

  const resetAddForm = () => {
    setAddKind(null)
    setAddName('')
    setAddPrice(0)
    setAddCost(0)
    setAddCastBack(0)
    setAddGuestSub('shot')
    setAddCastSub('fdrink')
    setAddBackType('FD')
    setNominationHint(null)
    setAddBottleBackBase('')
  }

  // PDF G: ゼロ円ボトル系。subcategory が bottle 系（champagne / whisky /
  // shochu / brandy / wine）のとき、bottleBackBasePerUnit を入力できる。
  const isBottleSubcategory = (sub: GuestMenuItem['subcategory']): boolean =>
    sub === 'champagne' || sub === 'whisky' || sub === 'shochu' || sub === 'brandy' || sub === 'wine'

  /** PDF G: bottleBackBasePerUnit 入力文字列をデータ保存値に正規化する。
   *  - 空欄 → undefined（保存時にフィールド自体を持たせない=未設定扱い）
   *  - NaN / 非数 → undefined（誤入力で 0 やゴミ値を保存させない）
   *  - 負値 → 0 に丸め（input min=0 で通常入らないが防御的に）
   *  - 小数 → 整数に切り捨て */
  const parseBottleBackBase = (value: string): number | undefined => {
    if (value.trim() === '') return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.floor(n))
  }

  /**
   * ISSUE-001: 商品名 prefix から指名種別 (free/honshimei) を自動判定し、
   *  cast メニュー登録時の subcategory + backType をデフォルトセット。
   *
   *  - 'F' 始まり → free（subcategory='fdrink' / backType='FD'）
   *  - '本' 始まり → honshimei（subcategory='hondrink' / backType='本D'）
   *  - それ以外 → unknown（手動選択を促す）
   */
  const handleAddNameChange = (name: string) => {
    setAddName(name)
    if (addKind !== 'cast' || name.length === 0) {
      setNominationHint(null)
      return
    }
    if (name.startsWith('F')) {
      setAddCastSub('fdrink')
      setAddBackType('FD')
      setNominationHint('free')
    } else if (name.startsWith('本')) {
      setAddCastSub('hondrink')
      setAddBackType('本D')
      setNominationHint('honshimei')
    } else {
      setNominationHint('unknown')
    }
  }

  const handleConfirmAdd = () => {
    if (!addName.trim()) return
    const existingIds = [...guestMenu.map((m) => m.id), ...castMenu.map((m) => m.id)]
    const nextId = Math.max(...existingIds, 0) + 1
    if (addKind === 'guest') {
      // PDF G: bottle 系のサブカテゴリでのみ bottleBackBasePerUnit を保存。
      // 入力文字列は parseBottleBackBase で NaN / 空欄を吸収する。
      const bottleBase = isBottleSubcategory(addGuestSub)
        ? parseBottleBackBase(addBottleBackBase)
        : undefined
      setGuestMenu((prev) => [
        ...prev,
        {
          id: nextId,
          name: addName.trim(),
          price: addPrice,
          cost: addCost,
          castBack: 0, // ゲスト用はバックなし
          category: 'guest',
          subcategory: addGuestSub,
          ...(bottleBase !== undefined ? { bottleBackBasePerUnit: bottleBase } : {}),
        },
      ])
    } else if (addKind === 'cast') {
      setCastMenu((prev) => [
        ...prev,
        {
          id: nextId,
          name: addName.trim(),
          price: addPrice,
          cost: addCost,
          castBack: addCastBack,
          category: 'cast',
          subcategory: addCastSub,
          backType: addBackType,
        },
      ])
    }
    resetAddForm()
  }

  const handleConfirmDelete = () => {
    if (!confirmTarget) return
    if (confirmTarget.kind === 'guest') {
      setGuestMenu((prev) => prev.filter((m) => m.id !== confirmTarget.id))
    } else {
      setCastMenu((prev) => prev.filter((m) => m.id !== confirmTarget.id))
    }
    setConfirmTarget(null)
  }

  // ─── 追補02 R5-2/R5-3: カテゴリ管理 ───
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatKind, setNewCatKind] = useState<'guest' | 'cast'>('guest')

  const handleAddCategory = () => {
    if (!newCatLabel.trim()) return
    const id = 'custom-' + Date.now()
    const maxOrder = Math.max(...menuCategories.map((c) => c.order), 0)
    setMenuCategories((prev) => [
      ...prev,
      { kind: newCatKind, id, label: newCatLabel.trim(), order: maxOrder + 1, custom: true },
    ])
    setNewCatLabel('')
    setShowAddCategory(false)
  }

  const moveCategory = (id: string, delta: number) => {
    setMenuCategories((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const i = sorted.findIndex((c) => c.id === id)
      if (i < 0) return prev
      const j = i + delta
      if (j < 0 || j >= sorted.length) return prev
      const tmp = sorted[i].order
      sorted[i].order = sorted[j].order
      sorted[j].order = tmp
      return [...sorted]
    })
  }

  const toggleCategoryHidden = (id: string) => {
    setMenuCategories((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)))
  }

  const deleteCategory = (id: string) => {
    setMenuCategories((prev) => prev.filter((c) => c.id !== id))
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

      {/* ─── 追補02 R5-2/R5-3: カテゴリ管理 ─── */}
      <div className="panel p-3 border border-gold/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gold">カテゴリ管理</h3>
          {showAddCategory ? (
            <button onClick={() => { setShowAddCategory(false); setNewCatLabel('') }} className="text-xs text-gray-400">キャンセル</button>
          ) : (
            <button onClick={() => setShowAddCategory(true)} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12}/>カテゴリ追加</button>
          )}
        </div>
        {showAddCategory && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select value={newCatKind} onChange={(e) => setNewCatKind(e.target.value as 'guest' | 'cast')} className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
              <option value="guest">ゲスト用</option>
              <option value="cast">キャスト用</option>
            </select>
            <input value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} placeholder="例: ノンアルコール" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm col-span-2" />
            <button onClick={handleAddCategory} disabled={!newCatLabel.trim()} className="btn-gold text-xs px-3 py-1 col-span-3 disabled:opacity-40">追加</button>
          </div>
        )}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {[...menuCategories].sort((a, b) => a.order - b.order).map((c) => (
            <div key={c.id} className={`flex items-center gap-2 text-xs bg-white/5 px-2 py-1.5 rounded ${c.hidden ? 'opacity-40' : ''}`}>
              <span className="text-[10px] text-gray-500 w-12">{c.kind === 'guest' ? 'ゲスト' : 'キャスト'}</span>
              <span className="flex-1 truncate">{c.label}</span>
              {c.custom && <span className="text-[9px] text-gold/70 bg-gold/10 px-1.5 py-0.5 rounded">カスタム</span>}
              <button onClick={() => moveCategory(c.id, -1)} className="text-gray-400 hover:text-white" title="上に移動">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => moveCategory(c.id, +1)} className="text-gray-400 hover:text-white" title="下に移動">
                <ChevronDown size={12} />
              </button>
              <button onClick={() => toggleCategoryHidden(c.id)} className={`text-xs px-2 py-0.5 rounded ${c.hidden ? 'bg-white/10 text-gray-400' : 'bg-emerald-500/20 text-emerald-300'}`}>
                {c.hidden ? '非表示' : '表示中'}
              </button>
              {c.custom && (
                <button onClick={() => deleteCategory(c.id)} className="text-red-400 hover:bg-red-500/20 p-0.5 rounded">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 mt-2">
          ※ カスタムカテゴリは削除可能。既定カテゴリは非表示にして並び替えできます。
          OrderPage の表示順・表示/非表示はこの設定が反映されます。
        </div>
      </div>

      {/* ─── 新規メニュー追加 (追補02 R5-1) ─── */}
      <div className="panel p-3 border border-gold/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gold">新規メニュー追加</h3>
          {addKind === null ? (
            <div className="flex gap-2">
              <button onClick={() => setAddKind('guest')} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12}/>ゲスト用</button>
              <button onClick={() => setAddKind('cast')} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12}/>キャスト用</button>
            </div>
          ) : (
            <button onClick={resetAddForm} className="text-xs text-gray-400 hover:text-white">キャンセル</button>
          )}
        </div>
        {addKind && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">商品名</label>
                <input value={addName} onChange={(e) => handleAddNameChange(e.target.value)} placeholder="例: 山崎18年" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                {/* ISSUE-001: prefix 自動判定の結果ヒント（cast のみ） */}
                {addKind === 'cast' && nominationHint === 'free' && (
                  <div className="text-[11px] text-blue-300 mt-1">
                    自動判定: F（フリー）系として subcategory / backType を設定しました
                  </div>
                )}
                {addKind === 'cast' && nominationHint === 'honshimei' && (
                  <div className="text-[11px] text-amber-300 mt-1">
                    自動判定: 本（本指名）系として subcategory / backType を設定しました
                  </div>
                )}
                {addKind === 'cast' && nominationHint === 'unknown' && (
                  <div className="text-[11px] text-amber-400 mt-1 space-y-1">
                    <div>※ 商品名が F または 本 で始まらないため、指名種別を選択してください</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddCastSub('fdrink')
                          setAddBackType('FD')
                          setNominationHint('free')
                        }}
                        className="px-2 py-0.5 rounded border border-blue-400/40 text-blue-300 text-[11px] hover:bg-blue-400/10"
                      >
                        F（フリー）として登録
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddCastSub('hondrink')
                          setAddBackType('本D')
                          setNominationHint('honshimei')
                        }}
                        className="px-2 py-0.5 rounded border border-amber-400/40 text-amber-300 text-[11px] hover:bg-amber-400/10"
                      >
                        本（本指名）として登録
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">カテゴリ</label>
                {addKind === 'guest' ? (
                  // ISSUE-008: ハードコード配列ではなく menuCategories から動的生成
                  // → カテゴリ追加が即時反映される（リロード不要）
                  <select value={addGuestSub} onChange={(e) => setAddGuestSub(e.target.value as GuestMenuItem['subcategory'])} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
                    {menuCategories
                      .filter((c) => c.kind === 'guest' && !c.hidden)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                  </select>
                ) : (
                  <select value={addCastSub} onChange={(e) => setAddCastSub(e.target.value as CastMenuItem['subcategory'])} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
                    {menuCategories
                      .filter((c) => c.kind === 'cast' && !c.hidden)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                  </select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">販売価格 (円)</label>
                <NumberInput value={addPrice} onChange={setAddPrice} step={100} min={0} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">原価 (円)</label>
                <NumberInput value={addCost} onChange={setAddCost} step={100} min={0} />
              </div>
              {addKind === 'cast' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">キャストバック (円)</label>
                  <NumberInput value={addCastBack} onChange={setAddCastBack} step={100} min={0} />
                </div>
              )}
            </div>
            {addKind === 'cast' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">バック種別</label>
                <select value={addBackType} onChange={(e) => setAddBackType(e.target.value as BackType)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
                  {backTypes.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </div>
            )}
            {/* PDF G: bottle 系サブカテゴリのとき、ボトルバック計算用の基準額を
                任意入力できる。販売価格0円のキャストプレゼント用ボトルでも
                バック金額を発生させたいケースで使う（未入力なら price を使う）。 */}
            {addKind === 'guest' && isBottleSubcategory(addGuestSub) && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  ボトルバック計算用 基準額 (円、任意)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={500}
                  value={addBottleBackBase}
                  onChange={(e) => setAddBottleBackBase(e.target.value)}
                  placeholder={addPrice === 0 ? '例: 5000（0円ボトル用）' : '空欄なら価格を使用'}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                />
                <div className="text-[10px] text-gray-500 mt-1">
                  0円ボトル（キャストプレゼント）に「想定単価」を持たせると、
                  本指名キャストのボトルバック計算で {`{基準額}÷本指名人数×個別率`} が
                  発生する。一般メニューは空欄でOK。
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={handleConfirmAdd} disabled={!addName.trim()} className="btn-gold text-xs px-4 py-1.5 disabled:opacity-40">追加する</button>
            </div>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">ゲスト用ドリンク</h3>
        <div className="divide-y divide-white/5">
          {guestMenu.map((item) => {
            const editable = editingId === item.id
            const bottleSub = isBottleSubcategory(item.subcategory)
            return (
            <div key={item.id} className="py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm truncate">{item.name}</span>
                  {/* PDF G: 0円ボトル & 基準額付き商品が分かるバッジ。 */}
                  {item.price === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">0円</span>
                  )}
                  {item.bottleBackBasePerUnit !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 tabular-nums">
                      バック基準 ¥{item.bottleBackBasePerUnit.toLocaleString()}
                    </span>
                  )}
                </div>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-12">価格</span>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-12">原価</span>
                        <input type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
                      </div>
                      {bottleSub && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-12">バック基準</span>
                          <input
                            type="number"
                            value={editBottleBackBase}
                            onChange={(e) => setEditBottleBackBase(e.target.value)}
                            placeholder="空=価格"
                            className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        // PDF G: 編集側も parseBottleBackBase で NaN / 空欄を吸収。
                        const newBase = parseBottleBackBase(editBottleBackBase)
                        setGuestMenu((prev) => prev.map((m) => {
                          if (m.id !== item.id) return m
                          const next: GuestMenuItem = { ...m, price: Number(editPrice), cost: Number(editCost) }
                          if (bottleSub) {
                            if (newBase !== undefined) {
                              next.bottleBackBasePerUnit = newBase
                            } else {
                              delete next.bottleBackBasePerUnit
                            }
                          }
                          return next
                        }))
                        setEditingId(null)
                      }}
                      className="text-white hover:text-gray-300"
                    >
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm tabular-nums">{item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}</span>
                      <span className="text-xs text-gray-500 ml-2">原価¥{item.cost.toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingId(item.id)
                        setEditPrice(String(item.price))
                        setEditCost(String(item.cost))
                        setEditBottleBackBase(item.bottleBackBasePerUnit !== undefined ? String(item.bottleBackBasePerUnit) : '')
                      }}
                      className="text-gray-600 hover:text-white transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmTarget({ kind: 'guest', id: item.id, name: item.name })} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            )
          })}
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
                  <span className="text-xs text-gold/80 ml-2">Back: {item.backType}</span>
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

function CastManager({ casts, setCasts, addUser }: {
  casts: Cast[]
  setCasts: React.Dispatch<React.SetStateAction<Cast[]>>
  addUser: (user: UserAccount) => void
}) {
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
  const [newRealName, setNewRealName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newRate, setNewRate] = useState('2000')
  const [newGuarantee, setNewGuarantee] = useState('45')
  // ログイン情報（cast + userAccount を同時作成）
  const [newUsername, setNewUsername] = useState('')
  const [newPin, setNewPin] = useState('')
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

  // 案 B 改: castsApi.create + addUser を 2 発叩き、cast と userAccount を同時作成
  // - cast 作成失敗: そのまま alert (cast も userAccount も未作成)
  // - cast 作成成功 + userAccount 作成失敗: alert で「孤児 cast」を明示し手動修復を促す
  const handleAdd = async () => {
    if (!newName.trim() || !newUsername.trim() || !newPin.trim()) return
    const hourlyRate = Number(newRate)
    if (Number.isNaN(hourlyRate) || hourlyRate <= 0) return
    const guaranteeRate = Number(newGuarantee) / 100
    if (Number.isNaN(guaranteeRate) || guaranteeRate < 0 || guaranteeRate > 1) return
    if (casts.some((c) => c.name === newName.trim())) {
      alert('同名のキャストが既に存在します')
      return
    }
    const realName = newRealName.trim()
    const address = newAddress.trim()
    let created: Cast
    try {
      created = await castsApi.create({
        name: newName.trim(),
        hourlyRate,
        guaranteeRate,
        backRates: { ...newBackRates },
        ...(realName ? { realName } : {}),
        ...(address ? { address } : {}),
      })
      setCasts((prev) => [...prev, created])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`キャスト追加に失敗しました: ${msg}`)
      return
    }
    try {
      await addUser({
        username: newUsername.trim(),
        displayName: created.name,
        pin: newPin.trim(),
        role: 'cast',
        castId: created.id,
      })
    } catch {
      alert('ユーザーアカウントの作成に失敗しました。キャストは追加されましたが、ログインアカウントが作成できませんでした。手動で対応してください。')
      return
    }
    setNewName('')
    setNewRealName('')
    setNewAddress('')
    setNewRate('2000')
    setNewGuarantee('45')
    setNewUsername('')
    setNewPin('')
    const resetRates: Partial<Record<BackType, number>> = {}
    backTypes.forEach((bt) => { resetRates[bt] = 0 })
    setNewBackRates(resetRates)
    setShowAdd(false)
  }

  const backRateInputs = (rates: Partial<Record<BackType, number>>, setRates: (r: Partial<Record<BackType, number>>) => void) => (
    <div>
      <label className="text-xs text-gray-500 block mb-1.5">バック単価</label>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {backTypes.map((bt) => {
          // 追補03 R19: ボトルバックのみ % 単位 (それ以外は円)
          const isPercent = isPercentBackType(bt)
          return (
            <div key={bt} className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 w-16 shrink-0 truncate">{bt}</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-600">
                  {isPercent ? '' : '¥'}
                </span>
                <NumberInput
                  value={rates[bt] ?? 0}
                  onChange={(v) => setRates({ ...rates, [bt]: v })}
                  step={isPercent ? 1 : 100}
                  min={0}
                  max={isPercent ? 100 : undefined}
                  unit={isPercent ? '%' : undefined}
                  inputClassName={`${isPercent ? '!pl-2' : '!pl-5'} !pr-2 !py-1 !text-xs text-right`}
                  className="w-full"
                />
              </div>
            </div>
          )
        })}
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
                <span className="text-xs text-gold/80 ml-2">保証{Math.round(cast.guaranteeRate * 100)}%</span>
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
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="源氏名（必須）" />
          <div className="grid grid-cols-2 gap-2">
            <input value={newRealName} onChange={(e) => setNewRealName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs" placeholder="本名（税理士提出用・任意）" />
            <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs" placeholder="住所（税理士提出用・任意）" />
          </div>
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
          <div className="border-t border-white/10 pt-2 mt-1">
            <p className="text-xs text-gold/80 mb-1.5">ログイン情報（同時に userAccount を作成します）</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="ユーザーID（必須）" />
              <input value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" placeholder="初期PIN（必須）" maxLength={8} />
            </div>
          </div>
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
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; name: string } | null>(null)

  // ISSUE-007: PointerSensor で長押し（250ms / 5px tolerance）→ ドラッグ開始。
  //   Galaxy Tab S10 FE+ (Android) でもタッチで動作するよう @dnd-kit を採用。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const handleAdd = () => {
    if (!newName) return
    const maxId = Math.max(...tables.map((t) => t.id), 0)
    setTables((prev) => [...prev, {
      id: maxId + 1,
      number: newIsVip ? `VIP${newName}` : newName,
      status: 'empty' as const,
      guestCount: 0,
      startTime: null,
      assignedCasts: [],
      mainNominationCastNames: [],
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tables.findIndex((t) => t.id === active.id)
    const newIndex = tables.findIndex((t) => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTables(oldIndex, newIndex)
    }
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tables.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tables.map((table, index) => (
            <SortableTableRow
              key={table.id}
              table={table}
              index={index}
              total={tables.length}
              onMoveUp={() => index > 0 && reorderTables(index, index - 1)}
              onMoveDown={() => index < tables.length - 1 && reorderTables(index, index + 1)}
              onDelete={() => requestDelete(table.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

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

/** ISSUE-007: useSortable でドラッグ可能化した卓行。GripVertical ハンドルだけが drag listener を受ける。 */
function SortableTableRow({ table, index, total, onMoveUp, onMoveDown, onDelete }: {
  table: Table
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: table.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-2.5 border-b border-white/5"
    >
      <div className="flex items-center gap-2">
        <span
          {...attributes}
          {...listeners}
          className="text-gray-400 cursor-grab active:cursor-grabbing touch-none select-none"
          aria-label="長押しで並び替え"
        >
          <GripVertical size={14} />
        </span>
        <span className="font-bold text-sm">{table.number}</span>
        {table.number.includes('VIP') && <span className="text-xs bg-gold/15 text-gold border border-gold/30 px-1.5 py-0.5 rounded">VIP</span>}
        <span className={`text-xs ${table.status === 'empty' ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>
          ({table.status === 'empty' ? '空き' : '使用中'})
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={table.status !== 'empty'}
          className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>
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
  const [staffFixedCost, setStaffFixedCost] = useState(String(storeSettings.staffFixedCost))
  // spec.md §5.2.2: 延長料金（30 分 / 60 分）を店舗設定で管理
  const [extensionPrice30Min, setExtensionPrice30Min] = useState(String(storeSettings.extensionPrice30Min))
  const [extensionPrice60Min, setExtensionPrice60Min] = useState(String(storeSettings.extensionPrice60Min))
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
      staffFixedCost: Number(staffFixedCost),
      extensionPrice30Min: Number(extensionPrice30Min),
      extensionPrice60Min: Number(extensionPrice60Min),
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

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">1日あたり固定人件費 (¥)</label>
        <p className="text-[10px] text-gray-600 mb-1">ボーイ等の固定人件費。FL計算の労務費に加算されます。</p>
        <input type="number" value={staffFixedCost} onChange={(e) => setStaffFixedCost(e.target.value)} min="0" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      {/* spec.md §5.2.2: 延長料金（30分 / 60分）の店舗設定 */}
      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">延長 30 分料金 (¥)</label>
        <p className="text-[10px] text-gray-600 mb-1">継承選択モーダルで「30分」を選んだ際の料金。デフォルト ¥3,000。</p>
        <input type="number" value={extensionPrice30Min} onChange={(e) => setExtensionPrice30Min(e.target.value)} min="0" step="100" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white/5 rounded-lg p-3">
        <label className="text-xs text-gray-500 block mb-1.5">延長 60 分料金 (¥)</label>
        <p className="text-[10px] text-gray-600 mb-1">継承選択モーダルで「60分」を選んだ際の料金。通常セット料金と同額の運用想定。</p>
        <input type="number" value={extensionPrice60Min} onChange={(e) => setExtensionPrice60Min(e.target.value)} min="0" step="100" className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm" />
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
      r.completedAt,
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
      const work: DailyWork[] = computeDailyWork(c.id, c.name, attendanceRecords, billingRecords)
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
      const work = computeDailyWork(cast.id, cast.name, attendanceRecords, billingRecords).filter((w) => w.date.startsWith(prefix))
      const totalHours = work.reduce((s, w) => s + w.hours, 0)
      const totalSales = work.reduce((s, w) => s + w.sales, 0)
      // 追補03 R25: 15 分単位 + ルーズタイム 15 分
      const hourlyTotal = calcHourlyPay(cast.hourlyRate, totalHours)
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
        const daily = calcHourlyPay(cast.hourlyRate, w.hours)
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

function AttendanceManager({
  attendanceRecords, addAttendance, updateAttendance, casts,
  attendanceSchedules, addAttendanceSchedule, removeAttendanceSchedule, markScheduleProcessed,
}: {
  attendanceRecords: AttendanceRecord[]
  addAttendance: (record: AttendanceRecord) => void
  updateAttendance: (id: number, patch: Partial<AttendanceRecord>) => void
  casts: Cast[]
  attendanceSchedules: import('../data/mock').AttendanceSchedule[]
  addAttendanceSchedule: (s: import('../data/mock').AttendanceSchedule) => void
  removeAttendanceSchedule: (id: number) => void
  markScheduleProcessed: (id: number) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [staffId, setStaffId] = useState<number>(casts[0]?.id ?? 0)
  const [staffType, setStaffType] = useState<'cast' | 'boy'>('cast')
  // PDF E: 給与明細ポップアップ / 日払い入力 / 15分リアルタイム再描画 / 監査ログ
  const [payslipCast, setPayslipCast] = useState<Cast | null>(null)
  const [dailyPayCast, setDailyPayCast] = useState<Cast | null>(null)
  const [dailyPayAmount, setDailyPayAmount] = useState('')
  const { addDailyPayRequest, addAttendanceEditLog, attendanceEditLogs } = useStore()
  const { user } = useAuth()
  // 1 分ごとに再描画して 15 分枠の境界更新を反映
  const [, setNowTick] = useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // PDF E: 出勤時刻を修正。15 分単位で丸め + workHours 再計算 + 監査ログ。
  const handleClockInEdit = (record: AttendanceRecord, rawClockIn: string) => {
    if (!rawClockIn || !/^\d{2}:\d{2}$/.test(rawClockIn)) return
    const newClockIn = roundClockInHHMM(rawClockIn)
    const oldClockIn = record.clockIn ?? null
    if (oldClockIn === newClockIn) return  // 変化なしは何もしない
    let patch: Partial<AttendanceRecord> = { clockIn: newClockIn }
    if (record.clockOut) {
      patch = { ...patch, workHours: calcWorkHours(newClockIn, record.clockOut, record.breakMinutes ?? 0) }
    }
    updateAttendance(record.id, patch)
    addAttendanceEditLog({
      id: Date.now(),
      recordId: record.id,
      castId: record.staffId,
      castName: record.staffName,
      field: 'clockIn',
      before: oldClockIn,
      after: newClockIn,
      editedAt: new Date().toISOString(),
      editedBy: user?.displayName ?? 'スタッフ',
    })
  }

  // PDF E: 退勤時刻も同様に修正可能（過去レコード復活）。
  const handleClockOutEdit = (record: AttendanceRecord, rawClockOut: string) => {
    if (!rawClockOut || !/^\d{2}:\d{2}$/.test(rawClockOut)) return
    const newClockOut = roundClockOutHHMM(rawClockOut)
    const oldClockOut = record.clockOut ?? null
    if (oldClockOut === newClockOut) return
    const inHHMM = record.clockIn ?? newClockOut
    const workHours = calcWorkHours(inHHMM, newClockOut, record.breakMinutes ?? 0)
    updateAttendance(record.id, { clockOut: newClockOut, workHours })
    addAttendanceEditLog({
      id: Date.now(),
      recordId: record.id,
      castId: record.staffId,
      castName: record.staffName,
      field: 'clockOut',
      before: oldClockOut,
      after: newClockOut,
      editedAt: new Date().toISOString(),
      editedBy: user?.displayName ?? 'スタッフ',
    })
  }

  const handleDailyPaySubmit = () => {
    if (!dailyPayCast) return
    const amount = Number(dailyPayAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    addDailyPayRequest({
      id: Date.now(),
      castId: dailyPayCast.id,
      castName: dailyPayCast.name,
      amount,
      date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
    })
    setDailyPayCast(null)
    setDailyPayAmount('')
  }

  // 追補02 R4: 事前予定登録フォーム用
  const [showSchedule, setShowSchedule] = useState(false)
  const [schCastId, setSchCastId] = useState<number>(casts[0]?.id ?? 0)
  const [schDate, setSchDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [schTime, setSchTime] = useState<string>('20:00')

  const todayStr = new Date().toISOString().split('T')[0]
  const todayRecords = attendanceRecords.filter((r) => r.date === todayStr)
  const pendingSchedules = attendanceSchedules.filter((s) => !s.processed)

  // 追補02 R4-1: 1 分おきに予定時刻を監視 → 自動打刻
  // 予定時刻 ≤ 現在時刻 かつ当日の場合、AttendanceRecord を自動生成
  React.useEffect(() => {
    const check = () => {
      const now = new Date()
      const nowDate = now.toISOString().slice(0, 10)
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      for (const s of pendingSchedules) {
        if (s.date !== nowDate) continue
        if (s.scheduledClockIn > nowTime) continue
        // 実打刻 (R4-3: 実時刻を優先、scheduledClockIn は記録用に残す)
        // PDF E: clockIn は 15 分単位で「切り上げ」
        addAttendance({
          id: Date.now() + s.id,
          staffId: s.staffId,
          staffName: s.staffName,
          staffType: s.staffType,
          date: s.date,
          clockIn: roundClockInHHMM(nowTime),
          clockOut: null,
          breakMinutes: 0,
          workHours: 0,
          scheduledClockIn: s.scheduledClockIn,
        })
        markScheduleProcessed(s.id)
      }
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [pendingSchedules, addAttendance, markScheduleProcessed])

  const handleClockIn = () => {
    const cast = casts.find((c) => c.id === staffId)
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    // PDF E: 出勤時刻は 15 分単位で「切り上げ」
    addAttendance({
      id: Date.now(),
      staffId,
      staffName: cast?.name ?? `ボーイ${staffId}`,
      staffType,
      date: todayStr,
      clockIn: roundClockInHHMM(timeStr),
      clockOut: null,
      breakMinutes: 0,
      workHours: 0,
    })
    setShowAdd(false)
  }

  const handleClockOut = (record: AttendanceRecord) => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    // PDF E: 退勤時刻は 15 分単位で「切り捨て」、workHours も丸め後で再計算
    const clockOut = roundClockOutHHMM(timeStr)
    const inHHMM = record.clockIn ?? clockOut
    const workHours = calcWorkHours(inHHMM, clockOut, record.breakMinutes ?? 0)
    updateAttendance(record.id, { clockOut, workHours })
    addAttendanceEditLog({
      id: Date.now(),
      recordId: record.id,
      castId: record.staffId,
      castName: record.staffName,
      field: 'clockOut',
      before: record.clockOut ?? null,
      after: clockOut,
      editedAt: new Date().toISOString(),
      editedBy: user?.displayName ?? 'スタッフ',
    })
  }

  const handleBreakUpdate = (record: AttendanceRecord, minutes: number) => {
    const oldMin = record.breakMinutes
    updateAttendance(record.id, { breakMinutes: minutes })
    if (record.clockOut && record.clockIn) {
      // PDF E: workHours は丸め済み clockIn/Out で再計算
      const workHours = calcWorkHours(record.clockIn, record.clockOut, minutes)
      updateAttendance(record.id, { breakMinutes: minutes, workHours })
    }
    if (oldMin !== minutes) {
      addAttendanceEditLog({
        id: Date.now(),
        recordId: record.id,
        castId: record.staffId,
        castName: record.staffName,
        field: 'breakMinutes',
        before: oldMin ?? null,
        after: minutes,
        editedAt: new Date().toISOString(),
        editedBy: user?.displayName ?? 'スタッフ',
      })
    }
  }

  const handleAddSchedule = () => {
    const cast = casts.find((c) => c.id === schCastId)
    if (!cast) return
    addAttendanceSchedule({
      id: Date.now(),
      staffId: cast.id,
      staffName: cast.name,
      staffType: 'cast',
      date: schDate,
      scheduledClockIn: schTime,
    })
    setShowSchedule(false)
  }

  return (
    <div className="space-y-4">
      {/* 追補02 R4: 事前出勤予定 */}
      <div className="panel p-3 border border-gold/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gold">事前出勤予定 ({pendingSchedules.length} 件)</h3>
          {showSchedule ? (
            <button onClick={() => setShowSchedule(false)} className="text-xs text-gray-400">キャンセル</button>
          ) : (
            <button onClick={() => setShowSchedule(true)} className="btn-ghost text-xs flex items-center gap-1">
              <Plus size={12} /> 予定追加
            </button>
          )}
        </div>
        {showSchedule && (
          <div className="space-y-2 mb-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">対象キャスト</label>
                <select value={schCastId} onChange={(e) => setSchCastId(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
                  {casts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">日付</label>
                <input type="date" value={schDate} onChange={(e) => setSchDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">予定時刻</label>
                <input type="time" value={schTime} onChange={(e) => setSchTime(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            <button onClick={handleAddSchedule} className="btn-gold text-xs px-3 py-1.5">登録する</button>
          </div>
        )}
        {pendingSchedules.length > 0 && (
          <div className="space-y-1">
            {pendingSchedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm bg-white/5 px-3 py-1.5 rounded">
                <div>
                  <span className="font-medium">{s.staffName}</span>
                  <span className="text-xs text-gray-500 ml-2">{s.date}</span>
                  <span className="text-gold tabular-nums ml-2">{s.scheduledClockIn}〜</span>
                </div>
                <button onClick={() => removeAttendanceSchedule(s.id)} className="text-xs text-gray-500 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-gray-600 mt-2">
          ※予定時刻に到達すると自動的に打刻されます (1 分間隔で監視)。飛び込み出勤の手動打刻も併用可能です。
        </div>
      </div>

      <h3 className="text-sm font-bold text-gray-400 mb-2">本日の勤怠 ({todayStr})</h3>

      {todayRecords.length === 0 ? (
        <p className="text-sm text-gray-600">本日の出勤記録はありません</p>
      ) : (
        <div className="space-y-2">
          {todayRecords.map((r) => {
            // PDF E: 15 分単位リアルタイム勤務枠（出勤中のみ）。
            const realtimeRange = !r.clockOut && r.clockIn
              ? formatRealtimeWorkRange(r.clockIn)
              : null
            const castObj = casts.find((c) => c.id === r.staffId)
            return (
            <div key={r.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {/* PDF E: 頭文字ではなく cast.name フル表示 */}
                  <span className="font-bold text-sm">{r.staffName}</span>
                  <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{r.staffType === 'cast' ? 'キャスト' : 'ボーイ'}</span>
                  {r.scheduledClockIn && r.clockIn && r.scheduledClockIn !== r.clockIn && (
                    <span className="text-[10px] text-amber-400" title={`予定: ${r.scheduledClockIn}`}>
                      {r.clockIn > r.scheduledClockIn ? '遅刻' : '早出'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-gray-500" />
                  {/* PDF E: 出勤時刻は input type="time" で数字選択（丸時計UIを廃止） */}
                  <input
                    type="time"
                    value={r.clockIn ?? ''}
                    onChange={(e) => handleClockInEdit(r, e.target.value)}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm tabular-nums w-24"
                    title="出勤時刻を修正"
                  />
                  <span className="text-gray-600">〜</span>
                  <span className="text-sm tabular-nums">{r.clockOut ?? '--:--'}</span>
                </div>
              </div>
              {/* PDF E: 15 分単位リアルタイム勤務枠 */}
              {realtimeRange && (
                <div className="text-xs text-gold tabular-nums mb-1">勤務枠: {realtimeRange}</div>
              )}
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">休憩:</span>
                  <NumberInput
                    value={r.breakMinutes}
                    onChange={(v) => handleBreakUpdate(r, v)}
                    min={0}
                    step={5}
                    className="w-14"
                    inputClassName="!px-2 !py-1 text-right !text-xs"
                  />
                  <span className="text-gray-500">分</span>
                </div>
                <span className="text-gray-500">勤務: <span className="text-white tabular-nums">{r.workHours}h</span></span>
                {/* PDF E: 明細 / 日払い 導線（キャストのみ） */}
                {castObj && (
                  <>
                    <button
                      onClick={() => setPayslipCast(castObj)}
                      className="bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-1 rounded text-xs flex items-center gap-1"
                    >
                      <FileText size={11} /> 明細
                    </button>
                    <button
                      onClick={() => { setDailyPayCast(castObj); setDailyPayAmount('') }}
                      className="bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-1 rounded text-xs flex items-center gap-1"
                    >
                      <Wallet size={11} /> 日払い
                    </button>
                  </>
                )}
                {!r.clockOut && (
                  <button onClick={() => handleClockOut(r)} className="ml-auto bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-bold">退勤</button>
                )}
              </div>
            </div>
            )
          })}
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

      {/* PDF E: 「過去の出勤記録」一覧 — クロウ指示で復活。
          過去レコードからも出勤・退勤時刻を修正可能（15分丸め + 監査ログ）。
          PDF spec の「過去の出勤記録、こちらは不要です」は当該キャストの
          給与明細ポップアップ等での履歴表示の話で、運用画面側では修正導線が
          必要との判断（修正履歴は別途監査ログに残る）。 */}
      {attendanceRecords.filter((r) => r.date !== todayStr).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">過去の出勤記録（修正可）</h3>
          <div className="space-y-1.5">
            {attendanceRecords.filter((r) => r.date !== todayStr).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-white/5">
                <span className="text-gray-400 w-24">{r.date}</span>
                <span className="text-gray-200 flex-1 truncate">{r.staffName}</span>
                <input
                  type="time"
                  value={r.clockIn ?? ''}
                  onChange={(e) => handleClockInEdit(r, e.target.value)}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 tabular-nums w-20"
                  title="出勤時刻を修正 (15分丸め)"
                />
                <span className="text-gray-600">〜</span>
                <input
                  type="time"
                  value={r.clockOut ?? ''}
                  onChange={(e) => handleClockOutEdit(r, e.target.value)}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 tabular-nums w-20"
                  title="退勤時刻を修正 (15分丸め)"
                />
                <span className="text-gray-500 tabular-nums w-12 text-right">{r.workHours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF E: 勤怠修正監査ログ — 誰がいつ何を変更したか */}
      {attendanceEditLogs.length > 0 && (
        <div className="mt-4 panel p-3">
          <h3 className="text-sm font-bold text-gray-400 mb-2">勤怠修正履歴（監査ログ）</h3>
          <div className="space-y-1 text-[11px]">
            {attendanceEditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="flex gap-2 border-b border-white/5 py-1 tabular-nums">
                <span className="text-gray-600 w-32 truncate">{new Date(log.editedAt).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                <span className="text-gray-300 w-20 truncate">{log.castName}</span>
                <span className="text-gold w-20">{log.field}</span>
                <span className="text-gray-400 flex-1 truncate">
                  {log.before === null ? '(空)' : String(log.before)} → {log.after === null ? '(空)' : String(log.after)}
                </span>
                <span className="text-gray-600 w-20 truncate">{log.editedBy}</span>
              </div>
            ))}
            {attendanceEditLogs.length > 20 && (
              <div className="text-gray-600 text-center pt-1">… 最新 20 件のみ表示</div>
            )}
          </div>
        </div>
      )}

      {/* PDF E: 給与明細ポップアップ */}
      <PayslipPopup
        open={!!payslipCast}
        cast={payslipCast}
        onClose={() => setPayslipCast(null)}
      />

      {/* PDF E: 日払い入力ポップアップ */}
      <Modal
        open={!!dailyPayCast}
        onClose={() => { setDailyPayCast(null); setDailyPayAmount('') }}
        title={dailyPayCast ? `${dailyPayCast.name} - 日払い` : ''}
        size="sm"
        footer={
          <>
            <GhostButton onClick={() => { setDailyPayCast(null); setDailyPayAmount('') }} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleDailyPaySubmit} className="flex-1" disabled={!dailyPayAmount || Number(dailyPayAmount) <= 0}>
              記録する
            </GoldButton>
          </>
        }
      >
        <div className="space-y-2">
          <Field label="日払い金額 (円)">
            <Input
              type="number"
              value={dailyPayAmount}
              onChange={(e) => setDailyPayAmount(e.target.value)}
              placeholder="例: 5000"
              className="tabular-nums"
            />
          </Field>
          <p className="text-[10px] text-gray-500">※ 給与計算時の日払い済合計に反映されます。一律10%控除して手渡しが運用想定。</p>
        </div>
      </Modal>
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
  const [formHourlyRate, setFormHourlyRate] = useState('1500')
  const [confirmTarget, setConfirmTarget] = useState<{ username: string; label: string } | null>(null)

  const startEdit = (u: UserAccount) => {
    setEditingUsername(u.username)
    setFormDisplay(u.displayName)
    setFormPin(u.pin)
    setFormRole(u.role)
    setFormHourlyRate(String(u.hourlyRate ?? 1500))
  }

  // 案 B: castId は作成時に確定・編集では変更不可（PATCH ペイロードに含めない）
  const handleSaveEdit = (username: string) => {
    updateUser(username, {
      displayName: formDisplay,
      pin: formPin,
      role: formRole,
      hourlyRate: formRole === 'staff' ? Number(formHourlyRate) : undefined,
    })
    setEditingUsername(null)
  }

  const handleAdd = () => {
    if (!formName || !formPin) return
    if (formRole === 'cast') {
      // 案 B: キャスト新規作成は待機画面に一本化
      alert('キャストの新規作成は「管理メニュー > キャスト」タブの「追加」から行ってください。')
      return
    }
    addUser({
      username: formName,
      displayName: formDisplay || formName,
      pin: formPin,
      role: formRole,
      hourlyRate: formRole === 'staff' ? Number(formHourlyRate) : undefined,
    })
    setFormName('')
    setFormDisplay('')
    setFormPin('')
    setFormRole('staff')
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
                  <span className="text-xs text-gold/80">#{casts.find((c) => c.id === u.castId)?.name ?? u.castId}</span>
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
            <p className="text-xs text-amber-300/80 bg-amber-500/10 rounded px-2 py-1.5">
              キャストの新規作成は「管理メニュー {'>'} キャスト」タブの「追加」から行ってください。
            </p>
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
        <button onClick={() => { setShowAdd(true); setFormName(''); setFormDisplay(''); setFormPin(''); setFormRole('staff') }} className="w-full bg-white/[0.02] border border-dashed border-white/10 rounded-lg py-3 text-sm text-gray-500 flex items-center justify-center gap-1.5 transition-colors">
          <Plus size={14} /> ユーザー追加
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 追補02 R11-1: 日払い管理 (基本運用)
// ────────────────────────────────────────────────────────────
function DailyPayManager({
  casts, attendanceRecords, dailyPayRequests, addDailyPayRequest,
}: {
  casts: Cast[]
  attendanceRecords: AttendanceRecord[]
  dailyPayRequests: import('../data/mock').DailyPayRequest[]
  addDailyPayRequest: (req: import('../data/mock').DailyPayRequest) => void
}) {
  // 追補02 R11-3: 営業日の定義 (朝 6:00 境界、開始日基準)
  const [targetDate, setTargetDate] = useState<string>(() => getTodayBusinessDay())

  // その営業日にシフト in / out があったキャストの集計
  const records = attendanceRecords.filter((r) => r.date === targetDate && r.staffType === 'cast')
  const activeTodayCasts = casts.filter((c) => records.some((r) => r.staffId === c.id))

  const [paying, setPaying] = useState<{ castId: number; castName: string; amount: number } | null>(null)

  const computePay = (cast: Cast, rec?: AttendanceRecord) => {
    const hours = rec?.workHours ?? 0
    // 追補03 R25: 時給は 15 分単位 + ルーズタイム 15 分
    const basePay = calcHourlyPay(cast.hourlyRate, hours)
    const deductible = Math.floor(basePay * 0.1) // 一律 10% 控除
    return { basePay, net: basePay - deductible, hours }
  }

  const alreadyPaid = (castId: number) =>
    dailyPayRequests.some((r) => r.castId === castId && r.date === targetDate)

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-bold text-gold mb-2">日払い管理</h3>
        <p className="text-xs text-gray-500 mb-3">
          営業日 (朝 6:00 境界、開始日基準) ごとに、その日に出勤したキャスト全員を表示します。
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">営業日</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
          />
          <button onClick={() => setTargetDate(getTodayBusinessDay())} className="btn-ghost text-xs px-3 py-1">本日</button>
          <span className="text-xs text-gray-500">{formatBusinessDay(targetDate)}</span>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-xs text-gray-400 tracking-wider mb-2">
          出勤キャスト ({activeTodayCasts.length} 名)
        </div>
        {activeTodayCasts.length === 0 ? (
          <div className="text-center text-gray-500 py-6 text-sm">この営業日の出勤キャストがいません</div>
        ) : (
          <div className="divide-y divide-white/5">
            {activeTodayCasts.map((c) => {
              const rec = records.find((r) => r.staffId === c.id)
              const { basePay, net, hours } = computePay(c, rec)
              const paid = alreadyPaid(c.id)
              return (
                <div key={c.id} className="py-3 flex items-center gap-3">
                  {/* PDF E: 頭文字表示を削除し、フル名を主表記に。
                      左のアイコンは無地の円で残す。 */}
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gold/40 to-gold-dark/40 border border-gold/30" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500 tabular-nums">
                      {rec?.clockIn ?? '--:--'} 〜 {rec?.clockOut ?? '進行中'} / {hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">現時点給料</div>
                    <div className="text-sm font-bold text-gold tabular-nums">¥{net.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600">(10% 控除前 ¥{basePay.toLocaleString()})</div>
                  </div>
                  {paid ? (
                    <span className="shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">支払済</span>
                  ) : (
                    <button
                      onClick={() => setPaying({ castId: c.id, castName: c.name, amount: net })}
                      className="shrink-0 btn-gold text-xs px-3 py-1.5"
                    >
                      支払う
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!paying}
        title="日払い確認"
        message={paying ? `${paying.castName} に ¥${paying.amount.toLocaleString()} を日払いしますか?` : ''}
        confirmLabel="支払う"
        onConfirm={() => {
          if (!paying) return
          addDailyPayRequest({
            id: Date.now(),
            castId: paying.castId,
            castName: paying.castName,
            amount: paying.amount,
            date: targetDate,
            staffType: 'cast',
          })
          setPaying(null)
        }}
        onCancel={() => setPaying(null)}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 追補02 R11-5: 前払い管理 (出勤・未出勤問わず登録可)
// ────────────────────────────────────────────────────────────
function PrepayManager({
  casts, advancePayments, addAdvancePayment,
}: {
  casts: Cast[]
  advancePayments: AdvancePayment[]
  addAdvancePayment: (p: AdvancePayment) => void
}) {
  const [castId, setCastId] = useState<number>(casts[0]?.id ?? 0)
  const [amount, setAmount] = useState(0)
  const [reason, setReason] = useState('')

  // 前払いは advancePayments テーブルで前借りと同居。reason に先頭 "前払い: " を付けて区別。
  const prepayRecords = advancePayments.filter((p) => p.reason.startsWith('前払い:'))
  const totalPrepay = prepayRecords.reduce((s, p) => s + p.amount, 0)

  const handleAdd = () => {
    const cast = casts.find((c) => c.id === castId)
    if (!cast || amount <= 0) return
    addAdvancePayment({
      id: Date.now(),
      castId: cast.id,
      castName: cast.name,
      amount,
      source: 'register',
      reason: `前払い: ${reason || '理由なし'}`,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    })
    setAmount(0)
    setReason('')
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-bold text-gold mb-1">前払い管理</h3>
        <p className="text-xs text-gray-500 mb-3">
          出勤・未出勤問わず、キャストに前払いを登録できます。給与明細と突合可能です。
        </p>
        <div className="text-xs text-gray-400 mb-1">
          今月の前払い合計 <span className="text-gold font-bold ml-1">¥{totalPrepay.toLocaleString()}</span>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-xs text-gray-400 tracking-wider mb-2">+ 前払い登録</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">対象キャスト</label>
            <select value={castId} onChange={(e) => setCastId(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm">
              {casts.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.active && ' (非アクティブ)'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">金額</label>
            <NumberInput value={amount} onChange={setAmount} step={1000} min={0} unit="円" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">理由 (任意)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 美容院代、引越し費用等" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
          </div>
          <button onClick={handleAdd} disabled={amount <= 0} className="btn-gold text-xs px-4 py-2 disabled:opacity-40">登録する</button>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-xs text-gray-400 tracking-wider mb-2">前払い履歴</h3>
        {prepayRecords.length === 0 ? (
          <div className="text-center text-gray-500 py-6 text-sm">まだ前払いレコードがありません</div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...prepayRecords].reverse().map((p) => (
              <div key={p.id} className="py-2 flex justify-between items-center">
                <div className="text-sm">
                  <span className="font-medium">{p.castName}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.date} {p.timestamp}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums">¥{p.amount.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500">{p.reason.replace(/^前払い: ?/, '')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 未収管理 (Fix 7-2): 未収 BillingRecord の確定・回収・締め相殺
// ────────────────────────────────────────────────────────────
type UncollectedSubTab = 'pending' | 'written_off'

function UncollectedManager({ billingRecords, updateBillingRecord }: {
  billingRecords: BillingRecord[]
  updateBillingRecord: (id: string, patch: Partial<Pick<BillingRecord, 'uncollectedStatus' | 'uncollectedReason' | 'writtenOffAt' | 'settledOff'>>) => void
}) {
  const navigate = useNavigate()
  const [subTab, setSubTab] = useState<UncollectedSubTab>('pending')
  const [reasonFor, setReasonFor] = useState<BillingRecord | null>(null)
  const [reasonInput, setReasonInput] = useState('')

  const pendingList = billingRecords.filter(
    (r) => r.isUncollected && r.uncollectedStatus !== 'written_off' && r.uncollectedStatus !== 'recovered',
  )
  const writtenOffList = billingRecords.filter((r) => r.uncollectedStatus === 'written_off')

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch {
      return iso
    }
  }

  const handleConfirmWrittenOff = () => {
    if (!reasonFor) return
    const reason = reasonInput.trim()
    if (!reason) return
    updateBillingRecord(reasonFor.id, {
      uncollectedStatus: 'written_off',
      uncollectedReason: reason,
      writtenOffAt: new Date().toISOString(),
    })
    setReasonFor(null)
    setReasonInput('')
  }

  return (
    <div className="space-y-3">
      {/* 事由入力モーダル */}
      {reasonFor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-lg p-4 max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-white">確定未収にする</h3>
            <div className="text-xs text-gray-400">
              {reasonFor.tableNumber}卓 / ¥{reasonFor.total.toLocaleString()} / {formatDateTime(reasonFor.completedAt)}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">事由（必須）</label>
              <input
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                placeholder="例: 客が支払わず逃走"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReasonFor(null); setReasonInput('') }} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-400">キャンセル</button>
              <button onClick={handleConfirmWrittenOff} disabled={!reasonInput.trim()} className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-40">確定未収にする</button>
            </div>
          </div>
        </div>
      )}

      {/* サブタブ */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('pending')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold ${subTab === 'pending' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
        >
          保留中 ({pendingList.length})
        </button>
        <button
          onClick={() => setSubTab('written_off')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold ${subTab === 'written_off' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
        >
          確定未収 ({writtenOffList.length})
        </button>
      </div>

      {subTab === 'pending' && (
        <div className="space-y-2">
          {pendingList.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">保留中の未収はありません</div>
          )}
          {pendingList.map((r) => (
            <div key={r.id} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-400">
                  <div>{formatDateTime(r.completedAt)}</div>
                  <div>{r.tableNumber}卓 / 担当: {(r.castNamesSnapshot ?? []).join(', ') || '-'}</div>
                </div>
                <div className="text-base font-bold text-red-400 tabular-nums">¥{r.total.toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setReasonFor(r); setReasonInput('') }}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30"
                >
                  確定未収
                </button>
                <button
                  onClick={() => navigate(`/billing?uncollectedId=${r.id}`)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                >
                  回収
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'written_off' && (
        <div className="space-y-2">
          {writtenOffList.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">確定未収はありません</div>
          )}
          {writtenOffList.map((r) => (
            <div key={r.id} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div>{formatDateTime(r.completedAt)}</div>
                  <div>{r.tableNumber}卓 / 担当: {(r.castNamesSnapshot ?? []).join(', ') || '-'}</div>
                  {r.uncollectedReason && <div className="text-amber-300/80">事由: {r.uncollectedReason}</div>}
                  {r.writtenOffAt && <div className="text-gray-500">確定: {formatDateTime(r.writtenOffAt)}</div>}
                </div>
                <div className="text-base font-bold text-red-400 tabular-nums">¥{r.total.toLocaleString()}</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!r.settledOff}
                  onChange={(e) => updateBillingRecord(r.id, { settledOff: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>締め相殺済み</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 日報・レジ締め管理（owner only） ────────────────────────────────
// 設計書 §6: 締め (POST /api/daily-reports) と reopen (POST /:businessDate/reopen) の owner UI。
// reopen 後は closedAt: null になり、その営業日の billingRecord 取消が再度可能になる。
function DailyReportManager({
  dailyReports,
  setDailyReports,
  billingRecords,
}: {
  dailyReports: DailyReport[]
  setDailyReports: React.Dispatch<React.SetStateAction<DailyReport[]>>
  billingRecords: BillingRecord[]
}) {
  const [businessDate, setBusinessDate] = useState<string>(() => getTodayBusinessDay())
  const [actualCash, setActualCash] = useState<number>(0)
  const [note, setNote] = useState<string>('')
  const [reopenTarget, setReopenTarget] = useState<DailyReport | null>(null)
  const [reopenReason, setReopenReason] = useState<string>('')
  const [reopenError, setReopenError] = useState<string>('')
  const [submitError, setSubmitError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  // 当該営業日の billingRecords から理論値を集計（取消は除外）。
  // 古い記録は businessDate を持たないため date にフォールバック。
  const todayRecords = billingRecords.filter(
    (r) => !r.voidedAt && ((r.businessDate ?? r.date) === businessDate),
  )
  const cashSales = todayRecords.reduce((s, r) => s + (r.cashAmount ?? 0), 0)
  const cardSales = todayRecords.reduce((s, r) => s + (r.cardAmount ?? 0), 0)
  const totalSales = cashSales + cardSales
  const initialCash = 100000
  const theoreticalCash = initialCash + cashSales
  const difference = actualCash - theoreticalCash

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitError('')
    if (!businessDate) {
      setSubmitError('営業日を入力してください')
      return
    }
    setSubmitting(true)
    const report: DailyReport = {
      id: Date.now(),
      date: businessDate,
      businessDate,
      initialCash,
      cashSales,
      cardSales,
      totalSales,
      dailyPayTotal: 0,
      cashExpenseTotal: 0,
      cashAdvanceTotal: 0,
      theoreticalCash,
      actualCash,
      difference,
      note,
      operator: '',
      createdAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
    }
    // addDailyReport は内部で API を叩くが catch で握り潰すので、
    // ここでは API レスポンスを待ってサーバー側で正規化された値を local に反映する。
    try {
      const created = await dailyReportsApi.create(report)
      setDailyReports((prev) => [...prev, created])
      setActualCash(0)
      setNote('')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '登録に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReopen = async () => {
    if (!reopenTarget) return
    const reason = reopenReason.trim()
    if (!reason) {
      setReopenError('理由を入力してください')
      return
    }
    const bd = reopenTarget.businessDate ?? reopenTarget.date
    try {
      const updated = await dailyReportsApi.reopen(bd, reason)
      setDailyReports((prev) =>
        prev.map((r) =>
          (r.businessDate ?? r.date) === bd ? { ...r, ...updated } : r,
        ),
      )
      setReopenTarget(null)
      setReopenReason('')
      setReopenError('')
    } catch (e) {
      setReopenError(e instanceof Error ? e.message : '解除に失敗しました')
    }
  }

  const sortedReports = [...dailyReports].sort((a, b) => {
    const ad = a.businessDate ?? a.date
    const bd = b.businessDate ?? b.date
    return bd.localeCompare(ad)
  })

  return (
    <div className="space-y-4">
      {reopenTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-lg p-4 max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-white">レジ締めを解除</h3>
            <div className="text-xs text-gray-400">
              営業日 {reopenTarget.businessDate ?? reopenTarget.date} / 売上 ¥{reopenTarget.totalSales.toLocaleString()}
            </div>
            <div className="text-xs text-amber-300/80">
              解除すると、この営業日の会計記録に対して取消が再度可能になります。
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">解除理由（必須）</label>
              <input
                value={reopenReason}
                onChange={(e) => { setReopenReason(e.target.value); setReopenError('') }}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                placeholder="例: 取消漏れの修正"
                autoFocus
              />
              {reopenError && <div className="text-xs text-red-400 mt-1">{reopenError}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReopenTarget(null); setReopenReason(''); setReopenError('') }} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-400">キャンセル</button>
              <button onClick={handleReopen} disabled={!reopenReason.trim()} className="flex-1 py-2 rounded-lg text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 disabled:opacity-40">解除する</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
        <h3 className="text-sm font-bold text-white">レジ締め登録</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-400">
            営業日
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full mt-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-400">
            実有高（円）
            <NumberInput
              value={actualCash}
              onChange={setActualCash}
              className="w-full mt-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="text-xs text-gray-400 grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
          <div>レジ金</div><div className="text-right">¥{initialCash.toLocaleString()}</div>
          <div>現金売上</div><div className="text-right">¥{cashSales.toLocaleString()}</div>
          <div>カード売上</div><div className="text-right">¥{cardSales.toLocaleString()}</div>
          <div>売上合計</div><div className="text-right">¥{totalSales.toLocaleString()}</div>
          <div>理論有高</div><div className="text-right">¥{theoreticalCash.toLocaleString()}</div>
          <div className={difference === 0 ? 'text-emerald-400' : 'text-red-400'}>過不足</div>
          <div className={`text-right font-bold ${difference === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {difference >= 0 ? '+' : ''}¥{difference.toLocaleString()}
          </div>
        </div>
        <label className="text-xs text-gray-400 block">
          備考
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
          />
        </label>
        {submitError && <div className="text-xs text-red-400">{submitError}</div>}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-2 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? '処理中…' : '締めて記録'}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-white">締め済みレポート</h3>
        {sortedReports.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">レポートはありません</div>
        )}
        {sortedReports.map((r) => {
          const bd = r.businessDate ?? r.date
          const isReopened = !r.closedAt && !!r.reopenedAt
          return (
            <div key={`${bd}-${r.id}`} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div className="text-white font-bold">{formatBusinessDay(bd)}</div>
                  <div>売上 ¥{r.totalSales.toLocaleString()} / 実有高 ¥{r.actualCash.toLocaleString()}</div>
                  <div className={r.difference === 0 ? 'text-emerald-400' : 'text-red-400'}>
                    過不足 {r.difference >= 0 ? '+' : ''}¥{r.difference.toLocaleString()}
                  </div>
                  {isReopened && (
                    <div className="text-amber-300/80">
                      解除中: {r.reopenedBy ?? ''} / 理由: {r.reopenReason ?? ''}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setReopenTarget(r); setReopenReason(''); setReopenError('') }}
                  disabled={isReopened}
                  className="py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 disabled:opacity-40"
                >
                  {isReopened ? '解除済' : '解除'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
