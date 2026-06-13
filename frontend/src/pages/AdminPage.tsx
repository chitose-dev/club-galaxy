import { useState, useMemo } from 'react'
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
import { isPercentBackType, inferStartHour, isAllowedSubcategory } from '../data/mock'
import { computeDailyWork } from '../utils/dailyWork'
import { boyStaffId } from '../utils/staffId'
import { calcHourlyPay } from '../utils/payroll'
import { computeDailyPayBreakdown, buildBottleBackRateByCast, type DailyPayBreakdownResult } from '../utils/dailyPayBreakdown'
import type { Cast, BackType, GuestMenuItem, CastMenuItem, SetPrice, Table, StoreSettings, DailyWork, UserAccount, BillingRecord } from '../data/mock'
import type { AttendanceRecord, Expense, ExpenseCategory, AdvancePayment, ArchivedData, DailyReport, DailyPayRequest } from '../data/mock'
import React from 'react'
import { Pencil, Trash2, Plus, Save, Download, ChevronUp, ChevronDown, GripVertical, Clock, Printer, FileText, Wallet, Lock } from 'lucide-react'
import { isBusinessDateClosed, LOCKED_TOOLTIP, getClosingState, getClosingStateLabel } from '../utils/closing'
import { isUncollectedActive } from '../utils/uncollected'
import ConfirmDialog from '../components/ConfirmDialog'
import { openPrintWindow } from '../utils/print'
import ContextualHeader from '../components/ContextualHeader'
import Tabs, { type TabItem } from '../components/Tabs'
import NumberInput from '../components/NumberInput'
import { getTodayBusinessDay, formatBusinessDay, getJstTodayDateString } from '../utils/businessDay'
// PDF E: 勤怠 UI 拡張用
import PayslipPopup from '../components/PayslipPopup'
import DailyPayDialog from '../components/DailyPayDialog'
import TimeInput from '../components/TimeInput'
import { formatRealtimeWorkRange, roundClockInHHMM, roundClockOutHHMM, calcWorkHours } from '../utils/quarterHour'
import { useAuth } from '../auth'

type AdminTab =
  | 'menu' | 'cast' | 'price' | 'tables' | 'settings' | 'export' | 'users'
  | 'attendance' | 'expense' | 'advance' | 'archive'
  | 'dailypay' | 'prepay' | 'uncollected' | 'dailyreport'

const backTypes: BackType[] = [
  'FD', '本D', '本DW',
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

      {activeTab === 'menu' && <MenuManager guestMenu={guestMenu} castMenu={castMenu} setGuestMenu={setGuestMenu} setCastMenu={setCastMenu} />}
      {activeTab === 'cast' && <CastManager casts={casts} setCasts={setCasts} addUser={addUser} />}
      {activeTab === 'price' && <PriceManager setPrices={setPrices} chargeItems={chargeItems} setSetPrices={setSetPrices} setChargeItems={setChargeItems} />}
      {activeTab === 'tables' && <TableManager tables={tables} setTables={setTables} reorderTables={reorderTables} />}
      {activeTab === 'attendance' && <AttendanceManager attendanceRecords={attendanceRecords} addAttendance={addAttendance} updateAttendance={updateAttendance} casts={casts} attendanceSchedules={attendanceSchedules} addAttendanceSchedule={addAttendanceSchedule} removeAttendanceSchedule={removeAttendanceSchedule} markScheduleProcessed={markScheduleProcessed} billingRecords={billingRecords} dailyPayRequests={dailyPayRequests} />}
      {activeTab === 'expense' && <ExpenseManager expenses={expenses} addExpense={addExpense} removeExpense={removeExpense} />}
      {activeTab === 'uncollected' && <UncollectedManager billingRecords={billingRecords} updateBillingRecord={updateBillingRecord} />}
      {activeTab === 'dailyreport' && <DailyReportManager dailyReports={dailyReports} setDailyReports={setDailyReports} billingRecords={billingRecords} dailyPayRequests={dailyPayRequests} expenses={expenses} advancePayments={advancePayments} storeSettings={storeSettings} />}
      {activeTab === 'advance' && <AdvanceManager advancePayments={advancePayments} addAdvancePayment={addAdvancePayment} casts={casts} storeSettings={storeSettings} />}
      {activeTab === 'dailypay' && <DailyPayManager casts={casts} attendanceRecords={attendanceRecords} dailyPayRequests={dailyPayRequests} addDailyPayRequest={addDailyPayRequest} billingRecords={billingRecords} />}
      {activeTab === 'prepay' && <PrepayManager casts={casts} advancePayments={advancePayments} addAdvancePayment={addAdvancePayment} />}
      {activeTab === 'settings' && <SettingsManager storeSettings={storeSettings} setStoreSettings={setStoreSettings} />}
      {activeTab === 'export' && <DataExport billingRecords={billingRecords} casts={casts} dailyPayRequests={dailyPayRequests} discountLogs={discountLogs} deductions={deductions} advancePayments={advancePayments} attendanceRecords={attendanceRecords} userAccounts={userAccounts} />}
      {activeTab === 'archive' && <ArchiveManager archivedData={archivedData} archiveOldData={archiveOldData} billingRecords={billingRecords} />}
      {activeTab === 'users' && <UserManager userAccounts={userAccounts} addUser={addUser} updateUser={updateUser} deleteUser={deleteUser} casts={casts} />}
      </div>
    </div>
  )
}

// 2026-06-03 先方確定: 設定→メニュー画面のカテゴリは固定 7 種だけ。
// 旧 ISSUE-008 のカスタムカテゴリ自由作成は廃止。menuCategories prop は legacy
// データ判別用に残置（将来削除）。新規追加導線は下記 FIXED_CATEGORIES のみ。
//
// 既存データ（shot/pitcher/beer/warimono/カクテル/ショット等）は B 方針で
// DB 残置・新規導線から非表示。listing 側は既存 item を表示し続ける。
type FixedCategoryId =
  | 'cast-drink'    // ← キャストドリンク (内部 subcategory は F/本 でさらに分岐)
  | 'guest-drink'   // ← ゲストドリンク (内部 subcategory='shot')
  | 'champagne'
  | 'whisky'
  | 'shochu'
  | 'brandy'
  | 'wine'

interface FixedCategoryDef {
  id: FixedCategoryId
  label: string
  kind: 'guest' | 'cast'
  /** ボトル系か（bottleBackPerUnit 入力欄を出す対象）。 */
  isBottle: boolean
  /** 新規追加時の デフォルト subcategory（DB 保存値）。
   *  キャストドリンクは F/本 サブ選択で fdrink/hondrink に分岐するため null。 */
  defaultSubcategory: string | null
}

const FIXED_CATEGORIES: FixedCategoryDef[] = [
  { id: 'cast-drink',  label: 'キャストドリンク', kind: 'cast',  isBottle: false, defaultSubcategory: null },
  { id: 'guest-drink', label: 'ゲストドリンク',   kind: 'guest', isBottle: false, defaultSubcategory: 'shot' },
  { id: 'champagne',   label: 'シャンパン',       kind: 'guest', isBottle: true,  defaultSubcategory: 'champagne' },
  { id: 'whisky',      label: 'ウイスキー',       kind: 'guest', isBottle: true,  defaultSubcategory: 'whisky' },
  { id: 'shochu',      label: '焼酎',             kind: 'guest', isBottle: true,  defaultSubcategory: 'shochu' },
  { id: 'brandy',      label: 'ブランデー',       kind: 'guest', isBottle: true,  defaultSubcategory: 'brandy' },
  { id: 'wine',        label: 'ワイン',           kind: 'guest', isBottle: true,  defaultSubcategory: 'wine' },
]

function MenuManager({ guestMenu, castMenu, setGuestMenu, setCastMenu }: {
  guestMenu: GuestMenuItem[]; castMenu: CastMenuItem[]
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editCastBack, setEditCastBack] = useState('')
  // ゼロ円ボトルメニュー用の「バック計算用基準額（円）」編集値。
  const [editBottleBackBase, setEditBottleBackBase] = useState('')
  // ボトル系商品の個別バック金額（円）編集値。3-state を文字列で持つ:
  //   '' = 未設定 (null), '0' = 明示バックなし, '正数' = 個別バック金額
  const [editBottleBackPerUnit, setEditBottleBackPerUnit] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<{ kind: 'guest' | 'cast'; id: number; name: string } | null>(null)

  // ─── 新規追加フォーム（固定 7 カテゴリ専用） ───
  const [addCategoryId, setAddCategoryId] = useState<FixedCategoryId | null>(null)
  const [addName, setAddName] = useState('')
  const [addPrice, setAddPrice] = useState(0)
  const [addCost, setAddCost] = useState(0)
  const [addCastBack, setAddCastBack] = useState(0)
  // キャストドリンクのとき、F (フリー) / 本 (本指名) を選ばせて subcategory を決める。
  const [addCastNominationType, setAddCastNominationType] = useState<'F' | '本'>('F')
  // 0 円ボトル用バック基準額。空文字なら未指定 (= price を使う)。
  const [addBottleBackBase, setAddBottleBackBase] = useState('')
  // ボトル系個別バック金額（円）。3-state を文字列で表現:
  //   '' = 未設定 (null) → 給与設定率にフォールバック
  //   '0' = 明示的にバックなし
  //   正数 = 商品個別バック金額
  const [addBottleBackPerUnit, setAddBottleBackPerUnit] = useState('')

  const selectedCategory = addCategoryId
    ? FIXED_CATEGORIES.find((c) => c.id === addCategoryId) ?? null
    : null

  const resetAddForm = () => {
    setAddCategoryId(null)
    setAddName('')
    setAddPrice(0)
    setAddCost(0)
    setAddCastBack(0)
    setAddCastNominationType('F')
    setAddBottleBackBase('')
    setAddBottleBackPerUnit('')
  }

  // 既存商品のサブカテゴリがボトル系（champagne / whisky / shochu / brandy / wine）
  // かどうか。bottleBackBasePerUnit / bottleBackPerUnit の入力欄表示判定に使う。
  const isBottleSubcategory = (sub: string | undefined): boolean =>
    sub === 'champagne' || sub === 'whisky' || sub === 'shochu' || sub === 'brandy' || sub === 'wine'

  /** バック計算用基準額（円）入力文字列を保存値に正規化する。
   *  - 空欄 → undefined（保存時にフィールド自体を持たせない=未設定扱い）
   *  - NaN / 非数 → undefined（誤入力で 0 やゴミ値を保存させない）
   *  - 負値 → 0 に丸め
   *  - 小数 → 整数に切り捨て */
  const parseBottleBackBase = (value: string): number | undefined => {
    if (value.trim() === '') return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.floor(n))
  }

  /** ボトル系個別バック金額（円）入力文字列を保存値に正規化する。3-state:
   *  - 空欄 → null (= 未設定、給与設定フォールバック)
   *  - "0" → 0 (= 明示的にバックなし、フォールバックさせない)
   *  - 正数 → 正数 (= 商品個別バック金額)
   *  - NaN / 非数 → null（誤入力で 0 を保存させない、空欄と同等扱い） */
  const parseBottleBackPerUnit = (value: string): number | null => {
    if (value.trim() === '') return null
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.floor(n))
  }

  const handleConfirmAdd = () => {
    if (!addName.trim() || !selectedCategory) return
    const existingIds = [...guestMenu.map((m) => m.id), ...castMenu.map((m) => m.id)]
    const nextId = Math.max(...existingIds, 0) + 1
    if (selectedCategory.kind === 'cast') {
      // キャストドリンク: F/本 でサブカテゴリと backType を分岐
      const subcategory = addCastNominationType === 'F' ? 'fdrink' : 'hondrink'
      const backType: BackType = addCastNominationType === 'F' ? 'FD' : '本D'
      setCastMenu((prev) => [
        ...prev,
        {
          id: nextId,
          name: addName.trim(),
          price: addPrice,
          cost: addCost,
          castBack: addCastBack,
          category: 'cast',
          subcategory,
          backType,
        },
      ])
    } else {
      // ゲスト系（ゲストドリンク / ボトル 5 種）
      const subcategory = selectedCategory.defaultSubcategory ?? 'shot'
      const bottleBase = selectedCategory.isBottle
        ? parseBottleBackBase(addBottleBackBase)
        : undefined
      const bottleBackPerUnitValue = selectedCategory.isBottle
        ? parseBottleBackPerUnit(addBottleBackPerUnit)
        : null
      setGuestMenu((prev) => [
        ...prev,
        {
          id: nextId,
          name: addName.trim(),
          price: addPrice,
          cost: addCost,
          castBack: 0, // ゲスト商品自体のキャストバック（ボトル系は bottleBackPerUnit で別管理）
          category: 'guest',
          subcategory: subcategory as GuestMenuItem['subcategory'],
          ...(bottleBase !== undefined ? { bottleBackBasePerUnit: bottleBase } : {}),
          // bottleBackPerUnit は明示的に「空欄＝未設定」を JSON 上も区別したい
          // ケースで使うが、新規追加時に未設定なら属性自体を付けない
          // （既存挙動と同様、フィールド未所持＝null 扱いになる）。
          ...(bottleBackPerUnitValue !== null ? { bottleBackPerUnit: bottleBackPerUnitValue } : {}),
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

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmTarget !== null}
        title="メニューを削除"
        message={`「${confirmTarget?.name ?? ''}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* ─── 新規メニュー追加（固定 7 カテゴリ） ─── */}
      <div className="panel p-3 border border-gold/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gold">新規メニュー追加</h3>
          {addCategoryId !== null && (
            <button onClick={resetAddForm} className="text-xs text-gray-400 hover:text-white">キャンセル</button>
          )}
        </div>
        {addCategoryId === null ? (
          <div className="grid grid-cols-2 gap-2">
            {FIXED_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setAddCategoryId(c.id)}
                className="btn-ghost text-xs flex items-center gap-1 justify-start"
              >
                <Plus size={12} /> {c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-gold">
              選択中: <span className="font-bold">{selectedCategory?.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">商品名</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={selectedCategory?.isBottle ? '例: 山崎18年' : '例: Lドリンク (FD)'}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                />
              </div>
              {/* キャストドリンク選択時のみ、F/本 サブセレクタを出して subcategory + backType を決める */}
              {selectedCategory?.kind === 'cast' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">指名種別</label>
                  <select
                    value={addCastNominationType}
                    onChange={(e) => setAddCastNominationType(e.target.value as 'F' | '本')}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="F">F（フリー）</option>
                    <option value="本">本（本指名）</option>
                  </select>
                </div>
              )}
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
              {selectedCategory?.kind === 'cast' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">キャストバック (円)</label>
                  <NumberInput value={addCastBack} onChange={setAddCastBack} step={100} min={0} />
                </div>
              )}
            </div>
            {/* ボトル系のみ: 商品個別バック金額 (3-state) と バック計算用基準額 */}
            {selectedCategory?.isBottle && (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    商品バック金額（円 / 1 本あたり、任意）
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={500}
                    value={addBottleBackPerUnit}
                    onChange={(e) => setAddBottleBackPerUnit(e.target.value)}
                    placeholder="空欄＝給与設定の率で計算 / 0＝バックなし"
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                  />
                  <div className="text-[10px] text-gray-500 mt-1">
                    空欄 = キャスト給与設定のボトルバック率にフォールバック。
                    0 を入力すると「明示的にバックなし」（フォールバックさせない）。
                    正数を入れると、キャスト給与設定の率より優先される。
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    バック計算用 基準額 (円、任意)
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
                    0 円ボトル（キャストプレゼント）に「想定単価」を持たせると、
                    率フォールバック時の基準額として使われる。一般メニューは空欄で OK。
                  </div>
                </div>
              </>
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
          {/* B 方針: 7 種以外の legacy / custom 商品は管理画面の一覧からも非表示。
              DB レコードは残置しているため過去会計の参照は壊さない。 */}
          {guestMenu.filter((i) => isAllowedSubcategory('guest', i.subcategory)).map((item) => {
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
                  {/* 商品個別バック金額: null/undefined（フォールバック）は表示せず、
                      0（明示なし）/ 正数 のときだけバッジを出す。3-state を視認可能に。 */}
                  {item.bottleBackPerUnit === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 border border-gray-500/30 text-gray-300">
                      バックなし(明示)
                    </span>
                  )}
                  {typeof item.bottleBackPerUnit === 'number' && item.bottleBackPerUnit > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/15 border border-pink-500/30 text-pink-300 tabular-nums">
                      商品バック ¥{item.bottleBackPerUnit.toLocaleString()}/本
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
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 w-12">商品バック</span>
                            <input
                              type="number"
                              value={editBottleBackPerUnit}
                              onChange={(e) => setEditBottleBackPerUnit(e.target.value)}
                              placeholder="空=率"
                              className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right"
                              title="1 本あたりキャストバック金額（円）。空欄=給与設定率にフォールバック、0=明示的にバックなし、正数=個別バック金額"
                            />
                          </div>
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
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const newBase = parseBottleBackBase(editBottleBackBase)
                        const newPerUnit = parseBottleBackPerUnit(editBottleBackPerUnit)
                        setGuestMenu((prev) => prev.map((m) => {
                          if (m.id !== item.id) return m
                          const next: GuestMenuItem = { ...m, price: Number(editPrice), cost: Number(editCost) }
                          if (bottleSub) {
                            if (newBase !== undefined) {
                              next.bottleBackBasePerUnit = newBase
                            } else {
                              delete next.bottleBackBasePerUnit
                            }
                            // bottleBackPerUnit は 3-state: null/undefined を区別するため
                            //   newPerUnit === null (空欄) → 削除 (= 未設定)
                            //   newPerUnit === 0 → 明示的バックなし、フィールド保持
                            //   newPerUnit > 0 → 個別バック金額、フィールド保持
                            if (newPerUnit === null) {
                              delete next.bottleBackPerUnit
                            } else {
                              next.bottleBackPerUnit = newPerUnit
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
                        // 3-state: null/undefined → 空欄、 0 → '0'、正数 → '<数値>'
                        setEditBottleBackPerUnit(
                          item.bottleBackPerUnit === null || item.bottleBackPerUnit === undefined
                            ? ''
                            : String(item.bottleBackPerUnit),
                        )
                      }}
                      aria-label={`${item.name} を編集`}
                      title="編集"
                      className="text-gray-600 hover:text-white transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmTarget({ kind: 'guest', id: item.id, name: item.name })} aria-label={`${item.name} を削除`} title="削除" className="text-gray-600 hover:text-red-400 transition-colors">
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
          {castMenu.filter((i) => isAllowedSubcategory('cast', i.subcategory)).map((item) => (
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
                    <button onClick={() => { setCastMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice), castBack: Number(editCastBack) } : m)); setEditingId(null) }} aria-label="保存" title="保存" className="text-white hover:text-gray-300">
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm tabular-nums">¥{item.price.toLocaleString()}</span>
                      <span className="text-xs text-gray-500 ml-2">CB¥{item.castBack.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)); setEditCastBack(String(item.castBack)) }} aria-label={`${item.name} を編集`} title="編集" className="text-gray-600 hover:text-white transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmTarget({ kind: 'cast', id: item.id, name: item.name })} aria-label={`${item.name} を削除`} title="削除" className="text-gray-600 hover:text-red-400 transition-colors">
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
                <button onClick={() => startEdit(cast)} aria-label={`${cast.name} を編集`} title="編集" className="text-gray-600 hover:text-white transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => setCasts((prev) => prev.map((c) => c.id === cast.id ? { ...c, active: !c.active } : c))} className="text-xs bg-white/5 border border-white/10 px-2 py-1 rounded text-gray-500 hover:text-white transition-colors">{cast.active ? '無効化' : '有効化'}</button>
                <button onClick={() => setConfirmTarget({ id: cast.id, name: cast.name })} aria-label={`${cast.name} を削除`} title="削除" className="text-gray-600 hover:text-red-400 transition-colors p-1">
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
  const [editLabel, setEditLabel] = useState('')
  const [editStartHour, setEditStartHour] = useState('')

  const handleSaveCharge = (id: string) => {
    setChargeItems((prev) => prev.map((p) => p.id === id ? { ...p, price: Number(editPrice) } : p))
    setEditingId(null)
  }

  const handleSaveSet = (id: string) => {
    // startHour は 0〜29 を許容 (深夜帯は 24/25/26 を入力)。範囲外は無視して既存値を維持。
    const rawHour = Number(editStartHour)
    const hour = Number.isFinite(rawHour) ? Math.max(0, Math.min(29, Math.round(rawHour))) : NaN
    const trimmed = editLabel.trim()
    setSetPrices((prev) => prev.map((p) => p.id === id ? {
      ...p,
      price: Number(editPrice),
      label: trimmed.length > 0 ? trimmed : p.label,
      startHour: Number.isFinite(hour) ? hour : p.startHour,
    } : p))
    setEditingId(null)
  }

  const renderChargeRow = (item: SetPrice) => (
    <div key={item.id} className="flex items-center justify-between py-2.5">
      <span className="text-sm">{item.label}</span>
      {editingId === item.id ? (
        <div className="flex items-center gap-2">
          <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right" />
          <button onClick={() => handleSaveCharge(item.id)} aria-label="保存" title="保存" className="text-white hover:text-gray-300">
            <Save size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums">¥{item.price.toLocaleString()}</span>
          <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)) }} aria-label={`${item.label} を編集`} title="編集" className="text-gray-600 hover:text-white transition-colors">
            <Pencil size={13} />
          </button>
        </div>
      )}
    </div>
  )

  const renderSetRow = (item: SetPrice, index: number) => {
    const isEditing = editingId === item.id
    // 旧 cache などで startHour が欠落した band を表示するときの推定値。
    const resolvedHour = typeof item.startHour === 'number' ? item.startHour : inferStartHour(item, index)
    return (
      <div key={item.id} className="py-2.5">
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              placeholder="表示名"
              className="w-32 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={29}
                value={editStartHour}
                onChange={(e) => setEditStartHour(e.target.value)}
                className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right"
              />
              <span className="text-xs text-gray-500">時〜</span>
            </div>
            <input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right"
            />
            <button onClick={() => handleSaveSet(item.id)} aria-label="保存" title="保存" className="text-white hover:text-gray-300">
              <Save size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-sm">{item.label}</span>
              <span className="text-[10px] text-gray-500 tabular-nums">開始 {resolvedHour ?? '-'}時</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums">¥{item.price.toLocaleString()}</span>
              <button
                onClick={() => {
                  setEditingId(item.id)
                  setEditPrice(String(item.price))
                  setEditLabel(item.label)
                  setEditStartHour(String(resolvedHour ?? 0))
                }}
                aria-label={`${item.label} を編集`}
                title="編集"
                className="text-gray-600 hover:text-white transition-colors"
              >
                <Pencil size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">セット料金（時間帯別）</h3>
        <p className="text-[10px] text-gray-600 mb-1">深夜帯（0〜3時帯にまたがる band）は開始時を 24〜27 で入力。</p>
        <div className="divide-y divide-white/5">{setPrices.map((item, i) => renderSetRow(item, i))}</div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">チャージ・指名料</h3>
        <div className="divide-y divide-white/5">{chargeItems.map((item) => renderChargeRow(item))}</div>
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
  // rate (0.035 等) × 100 で % 表示するときに浮動小数点誤差で `3.5000000000000004` 等
  // 出るのを防ぐため、表示時は小数 1 桁に丸める。保存時に `/100` で rate に戻す。
  const ratePercent = (rate: number) => {
    if (!Number.isFinite(rate)) return ''
    const pct = rate * 100
    const rounded = Math.round(pct * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  }
  const [taxRate, setTaxRate] = useState(ratePercent(storeSettings.taxRate))
  const [cardFeeRate, setCardFeeRate] = useState(ratePercent(storeSettings.cardFeeRate))
  const [cardProcessingFeeRate, setCardProcessingFeeRate] = useState(ratePercent(storeSettings.cardProcessingFeeRate))
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
  billingRecords, dailyPayRequests,
}: {
  attendanceRecords: AttendanceRecord[]
  addAttendance: (record: AttendanceRecord) => Promise<AttendanceRecord>
  updateAttendance: (id: number, patch: Partial<AttendanceRecord>) => Promise<AttendanceRecord | null>
  casts: Cast[]
  attendanceSchedules: import('../data/mock').AttendanceSchedule[]
  addAttendanceSchedule: (s: import('../data/mock').AttendanceSchedule) => void
  removeAttendanceSchedule: (id: number) => void
  markScheduleProcessed: (id: number) => void
  billingRecords: BillingRecord[]
  dailyPayRequests: import('../data/mock').DailyPayRequest[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [staffId, setStaffId] = useState<number>(casts[0]?.id ?? 0)
  const [staffType, setStaffType] = useState<'cast' | 'boy'>('cast')
  // ボーイ追加用に名前テキストを保持。空文字なら出勤打刻ボタンを無効化。
  const [boyName, setBoyName] = useState<string>('')
  // PDF E: 給与明細ポップアップ / 日払い入力 / 15分リアルタイム再描画 / 監査ログ
  const [payslipCast, setPayslipCast] = useState<Cast | null>(null)
  // 共通 DailyPayDialog 経由で日払いを記録するため、対象 cast + 自動計算額 +
  // 当日内訳 (本日の稼働実績 / 既支払額) を持つ。
  const [dailyPayTarget, setDailyPayTarget] = useState<
    | { cast: Cast; calculatedAmount: number; breakdown: DailyPayBreakdownResult }
    | null
  >(null)
  const { addDailyPayRequest, addAttendanceEditLog, attendanceEditLogs, dailyReports } = useStore()
  const { user } = useAuth()
  // 1 分ごとに再描画して 15 分枠の境界更新を反映
  const [, setNowTick] = useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // 2026-06-04 修正: フォーム開閉時 / casts list 変化時に staffId を有効な
  // active cast に同期する。旧実装は `useState(casts[0]?.id)` で初期化のみで、
  // 「active 一覧の先頭」と「staffId」がズレ、表示と submit 値が不一致になっていた。
  React.useEffect(() => {
    if (!showAdd) return
    if (staffType !== 'cast') return
    const activeCastIds = casts.filter((c) => c.active).map((c) => c.id)
    if (activeCastIds.length === 0) return
    if (!activeCastIds.includes(staffId)) {
      setStaffId(activeCastIds[0])
    }
  }, [showAdd, staffType, casts, staffId])

  // PDF E: 出勤時刻を修正。15 分単位で丸め + workHours 再計算 + 監査ログ。
  // PDF/Word 第2弾: 締め済み日のレコードはここで弾く（その営業日の DailyReport
  // が closedAt 付きで存在すれば修正不可。reopen 後は再開可能）。
  const handleClockInEdit = async (record: AttendanceRecord, rawClockIn: string) => {
    if (isBusinessDateClosed(record.date, dailyReports)) return
    if (!rawClockIn || !/^\d{2}:\d{2}$/.test(rawClockIn)) return
    const newClockIn = roundClockInHHMM(rawClockIn)
    const oldClockIn = record.clockIn ?? null
    if (oldClockIn === newClockIn) return  // 変化なしは何もしない
    let patch: Partial<AttendanceRecord> = { clockIn: newClockIn }
    if (record.clockOut) {
      patch = { ...patch, workHours: calcWorkHours(newClockIn, record.clockOut, record.breakMinutes ?? 0) }
    }
    try {
      await updateAttendance(record.id, patch)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`出勤時刻の変更に失敗しました: ${msg}`)
      return
    }
    // 監査ログは API 成功後に記録（失敗時に嘘ログが残らないように）。
    addAttendanceEditLog({
      // eslint-disable-next-line react-hooks/purity
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

  // 退勤打刻は handleClockOut (本日のみ) を使う。過去日の退勤時刻修正は監査ログ
  // 経由でのみ行う運用に集約しているため、ここでは Out 編集 handler を提供しない。

  // 共通 DailyPayDialog 経由で日払いを記録するヘルパー。
  // date は YYYY-MM-DD 統一 (locale 表記との混在で履歴ソート破綻を防ぐ)。
  // 営業日締めの判定は backend businessDate と揃える（既定が朝 5:00 境界で
  // backend cutoff 5 と一致するため、boundaryHour の明示指定は不要）。
  const submitDailyPayFromDialog = (req: import('../data/mock').DailyPayRequest) => {
    const today = getTodayBusinessDay()
    if (isBusinessDateClosed(today, dailyReports)) return
    addDailyPayRequest(req)
    setDailyPayTarget(null)
  }

  // 追補02 R4: 事前予定登録フォーム用
  const [showSchedule, setShowSchedule] = useState(false)
  const [schCastId, setSchCastId] = useState<number>(casts[0]?.id ?? 0)
  // 予定の date は JST 暦日（自動打刻ループの nowDate と同単位で比較する）。
  const [schDate, setSchDate] = useState<string>(() => getJstTodayDateString())
  const [schTime, setSchTime] = useState<string>('20:00')

  // 新規 AttendanceRecord の `date` フィールドも、表示・絞り込みも全て
  // **businessDate (cutoff=5)** に統一する。
  //   - fromBackend が r.date = backend businessDate にセットするため
  //     一覧 filter `r.date === todayBusinessDay` は businessDate 比較になる
  //   - toBackendCreate / toBackendPatch の `hhmmToIsoJst(date, hhmm, 5)` は
  //     cutoff 逆適用で「HH < 5 なら businessDate+1day のカレンダーで ISO 化」
  //     するため、`date` が businessDate であることが正解。深夜出勤 (02:30 等)
  //     も自動的に翌カレンダー日の ISO に変換される。
  const todayBusinessDay = getTodayBusinessDay()
  const todayRecords = attendanceRecords.filter((r) => r.date === todayBusinessDay)
  const pendingSchedules = attendanceSchedules.filter((s) => !s.processed)

  // 追補02 R4-1: 1 分おきに予定時刻を監視 → 自動打刻
  // 予定時刻 ≤ 現在時刻 かつ当日の場合、AttendanceRecord を自動生成
  React.useEffect(() => {
    const check = () => {
      const now = new Date()
      // s.date と同単位の JST 暦日で比較（s.date は上の schDate 初期値と同じ getJstTodayDateString 由来）。
      const nowDate = getJstTodayDateString()
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      for (const s of pendingSchedules) {
        if (s.date !== nowDate) continue
        if (s.scheduledClockIn > nowTime) continue
        // 実打刻 (R4-3: 実時刻を優先、scheduledClockIn は記録用に残す)
        // PDF E: clockIn は 15 分単位で「切り上げ」
        // markScheduleProcessed は addAttendance 成功後にのみ呼ぶ。
        // 失敗時に processed フラグを立てると次回サイクルで再試行されず
        // 出勤レコードが永久に作られない事故になる。
        //
        // ※ s.date と AttendanceRecord.date の意味分離（要 doc）:
        //   - schedule.date = JST 暦日（カレンダー上の予定日、上の `s.date === nowDate`
        //     比較もこの単位）
        //   - AttendanceRecord.date = businessDate (cutoff=5)（toBackendCreate の
        //     hhmmToIsoJst が逆 cutoff を適用して ISO 化する前提）
        // 深夜帯 (HH < 5) に予定打刻が走るケース、例えば 06-05 02:30 の予定 (s.date='06-05')
        // で `date: s.date` を渡すと、toBackendCreate が cutoff 補正で +1day して
        // '2026-06-06T02:30' になり 1 日未来にズレる。実打刻時の businessDate
        // (getTodayBusinessDay) を使う方が正しい (この瞬間の業務日)。
        addAttendance({
          id: Date.now() + s.id,
          staffId: s.staffId,
          staffName: s.staffName,
          staffType: s.staffType,
          date: getTodayBusinessDay(),
          clockIn: roundClockInHHMM(nowTime),
          clockOut: null,
          breakMinutes: 0,
          workHours: 0,
          scheduledClockIn: s.scheduledClockIn,
        }).then(() => {
          markScheduleProcessed(s.id)
        }).catch((e) => {
          console.error('予定からの自動打刻に失敗 (次サイクルで再試行):', e)
        })
      }
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [pendingSchedules, addAttendance, markScheduleProcessed])

  const handleClockIn = async () => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    // ボーイは入力テキストを正本とし、staffId は名前から安定ハッシュで生成
    // （`SalaryPage` の `boyStaffId` と同一実装を `utils/staffId.ts` で共有）。
    // 旧実装は `setStaffId(Date.now())` で打刻のたびに別 ID が振られ、
    // 同一ボーイの履歴が分断される + 'ボーイ{Date.now()}' というゴミ名前で
    // 保存されていたバグの修正。
    let effectiveStaffId = staffId
    let effectiveStaffName: string
    if (staffType === 'cast') {
      const cast = casts.find((c) => c.id === staffId)
      if (!cast) {
        alert('キャストが選択されていません')
        return
      }
      effectiveStaffName = cast.name
    } else {
      const trimmed = boyName.trim()
      if (!trimmed) {
        alert('ボーイ名を入力してください')
        return
      }
      effectiveStaffId = boyStaffId(trimmed)
      effectiveStaffName = trimmed
    }

    try {
      // PDF E: 出勤時刻は 15 分単位で「切り上げ」
      // date は businessDate (cutoff=5)。toBackendCreate の hhmmToIsoJst が
      // 「HH < 5 なら businessDate+1day のカレンダー」に変換するため、深夜
      // 出勤 (02:30 等) も正しい ISO になる。
      await addAttendance({
        id: Date.now(),
        staffId: effectiveStaffId,
        staffName: effectiveStaffName,
        staffType,
        date: todayBusinessDay,
        clockIn: roundClockInHHMM(timeStr),
        clockOut: null,
        breakMinutes: 0,
        workHours: 0,
      })
      setShowAdd(false)
      setBoyName('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`出勤打刻の保存に失敗しました: ${msg}`)
    }
  }

  const handleClockOut = async (record: AttendanceRecord) => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    // PDF E: 退勤時刻は 15 分単位で「切り捨て」、workHours も丸め後で再計算
    const clockOut = roundClockOutHHMM(timeStr)
    const inHHMM = record.clockIn ?? clockOut
    const workHours = calcWorkHours(inHHMM, clockOut, record.breakMinutes ?? 0)
    try {
      await updateAttendance(record.id, { clockOut, workHours })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`退勤打刻の保存に失敗しました: ${msg}`)
      return
    }
    // 監査ログは API 成功後に記録（失敗時に嘘ログが残らないように）。
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

  // 退勤（終了）時刻の後修正。打刻済みレコードの clockOut を直して勤務時間を
  // 再計算する（夜職の「20:00〜04:00」日跨ぎも calcWorkHours が +24h で吸収）。
  // 空指定はクリア（勤務中に戻す）= workHours 0。
  const handleClockOutEdit = async (record: AttendanceRecord, v: string) => {
    if (isBusinessDateClosed(record.date, dailyReports)) return
    const before = record.clockOut ?? null
    const clockOut = v && /^\d{2}:\d{2}$/.test(v) ? roundClockOutHHMM(v) : null
    if (clockOut === before) return
    const workHours = clockOut && record.clockIn
      ? calcWorkHours(record.clockIn, clockOut, record.breakMinutes ?? 0)
      : 0
    try {
      await updateAttendance(record.id, { clockOut, workHours })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`終了時刻の保存に失敗しました: ${msg}`)
      return
    }
    addAttendanceEditLog({
      id: Date.now(),
      recordId: record.id,
      castId: record.staffId,
      castName: record.staffName,
      field: 'clockOut',
      before,
      after: clockOut,
      editedAt: new Date().toISOString(),
      editedBy: user?.displayName ?? 'スタッフ',
    })
  }

  const handleBreakUpdate = async (record: AttendanceRecord, minutes: number) => {
    if (isBusinessDateClosed(record.date, dailyReports)) return
    const oldMin = record.breakMinutes
    try {
      if (record.clockOut && record.clockIn) {
        // PDF E: workHours は丸め済み clockIn/Out で再計算
        const workHours = calcWorkHours(record.clockIn, record.clockOut, minutes)
        await updateAttendance(record.id, { breakMinutes: minutes, workHours })
      } else {
        await updateAttendance(record.id, { breakMinutes: minutes })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`休憩時間の保存に失敗しました: ${msg}`)
      return
    }
    // 監査ログは API 成功後に記録（失敗時に嘘ログが残らないように）。
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
                <TimeInput value={schTime} onChange={(v) => setSchTime(v)} className="w-full" />
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

      <h3 className="text-sm font-bold text-gray-400 mb-2">本日の勤怠 ({todayBusinessDay})</h3>
      <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
        この画面＝<span className="text-gray-400">給与計算に使う勤務時間を確定する場所</span>。
        開始・終了・休憩を直すと勤務時間が再計算されます（終了の入力で確定）。
      </p>

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
                  {/* 15分丸めの業務制約に合わせて時/分 select の TimeInput を使う。 */}
                  <TimeInput
                    value={r.clockIn ?? ''}
                    onChange={(v) => handleClockInEdit(r, v)}
                    title="出勤時刻を修正"
                  />
                  <span className="text-gray-600">〜</span>
                  {/* 終了時刻も後修正可能に（夜職の 20:00〜04:00 日跨ぎ対応）。 */}
                  <TimeInput
                    value={r.clockOut ?? ''}
                    onChange={(v) => handleClockOutEdit(r, v)}
                    title="終了(退勤)時刻を修正"
                  />
                </div>
              </div>
              {/* リアルタイムの現在枠（15分目安）。確定した勤務時間ではないと分かる
                  ラベルにして「終了時刻」との誤読を防ぐ。 */}
              {realtimeRange && (
                <div className="text-xs text-gold/80 tabular-nums mb-1">
                  現在枠(目安): {realtimeRange}
                  <span className="text-gray-500">（確定時間ではありません）</span>
                </div>
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
                      onClick={() => {
                        // 当日稼働実績 (時給分 + バック + 控除後 net + 既支払額) を共通 util で算出。
                        // DailyPayDialog 上で「本日全額」ボタンを動作させるため breakdown も渡す。
                        // ボトルバックを給与明細と一致させるため全キャストの率を渡す。
                        const bottleRates = buildBottleBackRateByCast(casts)
                        const breakdown = computeDailyPayBreakdown(
                          castObj, r.date, attendanceRecords, billingRecords, dailyPayRequests,
                          bottleRates,
                        )
                        setDailyPayTarget({ cast: castObj, calculatedAmount: breakdown.net, breakdown })
                      }}
                      disabled={isBusinessDateClosed(todayBusinessDay, dailyReports)}
                      title={isBusinessDateClosed(todayBusinessDay, dailyReports) ? LOCKED_TOOLTIP : undefined}
                      className="bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
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
            // ボーイ名を state に保持。submit 時に boyStaffId(name) で安定 ID を生成。
            <input
              type="text"
              placeholder="ボーイ名"
              value={boyName}
              onChange={(e) => setBoyName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm"
            />
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

      {/* 勤怠修正監査ログ — 誰がいつ何を変更したか */}
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

      {/* DailyPayDialog: 自動計算 + 上書き + 調整理由 (必須) + メモ + 操作者 + paidAt + 当日 YYYY-MM-DD */}
      <DailyPayDialog
        open={!!dailyPayTarget}
        cast={dailyPayTarget ? { id: dailyPayTarget.cast.id, name: dailyPayTarget.cast.name } : null}
        calculatedAmount={dailyPayTarget?.calculatedAmount ?? 0}
        targetDate={todayBusinessDay}
        operator={user?.displayName ?? user?.username}
        staffType="cast"
        breakdown={dailyPayTarget?.breakdown}
        onSubmit={submitDailyPayFromDialog}
        onClose={() => setDailyPayTarget(null)}
      />
    </div>
  )
}

// ─── 経費管理 ───

// PDF/Word 第2弾 経費管理:
//   - 経費追加時に「日付」を指定可能（打ち忘れ/まとめ入力に対応）
//   - 一覧で 日付 / カテゴリ / 金額 / メモ / 登録日時 を見える形にする
//   - 期間絞り込み (全期間 / 今日 / 今週 / 今月 / 期間指定)
//   - 編集: 既存 API に PATCH が無いため delete + create で再登録する
//     (旧 id は捨てられ新 id で再生成。メモに編集履歴を残す形で audit を担保)
//   - 締め済み日 (DailyReport.closedAt 付き) の経費は追加/編集/削除すべて不可。
//     既存ボタンを disable + tooltip で理由表示。
function ExpenseManager({ expenses, addExpense, removeExpense }: {
  expenses: Expense[]
  addExpense: (expense: Expense) => void
  removeExpense: (id: number) => void
}) {
  const { dailyReports } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('仕入れ（酒等）')
  const [note, setNote] = useState('')
  const [source, setSource] = useState<'register' | 'transfer'>('register')
  // 深夜帯の経費を前営業日に乗せるため、デフォルト日付は UTC 暦日ではなく businessDate。
  // 編集時にユーザーが意図的に別日を選べる UI はそのまま。
  const todayDateStr = getTodayBusinessDay()
  const [date, setDate] = useState<string>(todayDateStr)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; label: string } | null>(null)
  // 期間絞り込み
  const [rangeKey, setRangeKey] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('month')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const categories: ExpenseCategory[] = ['仕入れ（酒等）', '税金', '雑費']

  const resetForm = () => {
    setAmount('')
    setNote('')
    setCategory('仕入れ（酒等）')
    setSource('register')
    setDate(todayDateStr)
    setEditingId(null)
    setShowAdd(false)
  }

  const isAddTargetClosed = isBusinessDateClosed(date, dailyReports)

  const handleSubmit = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    if (isAddTargetClosed) return
    // 編集: 古いレコードを delete してから新規 add (API 互換のため)。
    // 編集された旨を note 末尾に追記して audit trail を残す。
    if (editingId != null) {
      const old = expenses.find((x) => x.id === editingId)
      if (old) {
        removeExpense(old.id)
      }
    }
    const now = new Date()
    const baseNote = note.trim()
    const auditNote = editingId != null
      ? `${baseNote}${baseNote ? ' ' : ''}(${now.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 編集)`
      : baseNote
    addExpense({
      id: Date.now(),
      amount: amt,
      category,
      note: auditNote,
      source,
      date,
      // timestamp は時刻のみ (既存スキーマ準拠)。登録日 (date) と組み合わせて
      // 一覧画面で「2026/05/23 14:25」表示する。
      timestamp: now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    })
    resetForm()
  }

  const handleStartEdit = (e: Expense) => {
    setEditingId(e.id)
    setAmount(String(e.amount))
    setCategory(e.category)
    setNote(e.note)
    setSource(e.source)
    setDate(e.date)
    setShowAdd(true)
  }

  // 期間フィルタ。e.date は businessDate（登録フォームの既定が
  // getTodayBusinessDay）なので、「本日」「今月」の基準も UTC 暦日ではなく
  // 朝 5:00 境界の営業日で揃える（深夜 0〜5 時に当日経費が消えない）。
  const filteredExpenses = useMemo(() => {
    const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))
    const todayStr = getTodayBusinessDay()
    if (rangeKey === 'all') return sorted
    if (rangeKey === 'today') return sorted.filter((e) => e.date === todayStr)
    if (rangeKey === 'week') {
      // 営業日基準の直近 7 日。date-only 文字列の純粋な日付演算なので TZ 影響なし。
      const d = new Date(todayStr); d.setDate(d.getDate() - 7)
      const from = d.toISOString().slice(0, 10)
      return sorted.filter((e) => e.date >= from)
    }
    if (rangeKey === 'month') {
      const prefix = todayStr.slice(0, 7)
      return sorted.filter((e) => e.date.startsWith(prefix))
    }
    return sorted.filter((e) => {
      if (fromDate && e.date < fromDate) return false
      if (toDate && e.date > toDate) return false
      return true
    })
  }, [expenses, rangeKey, fromDate, toDate])

  const totalAmount = filteredExpenses.reduce((s, e) => s + e.amount, 0)
  const registerTotal = filteredExpenses.filter((e) => e.source === 'register').reduce((s, e) => s + e.amount, 0)

  const rangeButtons: { k: typeof rangeKey; label: string }[] = [
    { k: 'today', label: '今日' },
    { k: 'week', label: '今週' },
    { k: 'month', label: '今月' },
    { k: 'all', label: '全期間' },
    { k: 'custom', label: '期間指定' },
  ]

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

      {/* 期間絞り込み */}
      <div className="bg-white/5 rounded-lg p-3 space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {rangeButtons.map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setRangeKey(k)}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${rangeKey === k ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs" />
            <span className="text-gray-500 text-xs">〜</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">経費合計 ({filteredExpenses.length}件)</div>
          <div className="font-bold text-red-400 tabular-nums">¥{totalAmount.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">レジ現金支出</div>
          <div className="font-bold text-red-400 tabular-nums">¥{registerTotal.toLocaleString()}</div>
        </div>
      </div>

      {filteredExpenses.length > 0 && (
        <div className="space-y-2">
          {filteredExpenses.map((e) => {
            const closed = isBusinessDateClosed(e.date, dailyReports)
            return (
              <div key={e.id} className="bg-white/5 rounded-lg p-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold tabular-nums">¥{e.amount.toLocaleString()}</span>
                    <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{e.category}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${e.source === 'register' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {e.source === 'register' ? 'レジ現金' : '振込・立替'}
                    </span>
                    {closed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 border border-white/20 flex items-center gap-1" title={LOCKED_TOOLTIP}>
                        <Lock size={9} /> 締め済
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 tabular-nums">
                    {e.date} {e.timestamp}
                  </div>
                  {e.note && <div className="text-xs text-gray-400 mt-0.5 break-words">{e.note}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleStartEdit(e)}
                    disabled={closed}
                    title={closed ? LOCKED_TOOLTIP : '編集'}
                    className="text-gray-600 hover:text-white p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmTarget({ id: e.id, label: `¥${e.amount.toLocaleString()} ${e.category}` })}
                    disabled={closed}
                    title={closed ? LOCKED_TOOLTIP : '削除'}
                    className="text-gray-600 hover:text-red-400 p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <div className="text-xs text-gray-500">
            {editingId != null ? '経費を編集 (新 ID で再登録します)' : '経費を追加'}
          </div>
          <label className="block">
            <span className="text-[10px] text-gray-500">対象日</span>
            <input
              type="date"
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
              className="w-full mt-0.5 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm"
            />
            {isAddTargetClosed && (
              <span className="block text-[10px] text-amber-300/80 mt-0.5">
                ※ 締め済みの日付には追加・編集できません
              </span>
            )}
          </label>
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
            <button onClick={handleSubmit} disabled={!amount || Number(amount) <= 0 || isAddTargetClosed} className="flex-1 bg-white text-black py-2 rounded-lg text-sm font-bold disabled:opacity-40">
              {editingId != null ? '更新' : '追加'}
            </button>
            <button onClick={resetForm} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-500">キャンセル</button>
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
      // レジ理論有高との突合のため YYYY-MM-DD 営業日で揃える。
      // 旧 `M/D` (ja-JP) 形式では businessDate と一致せず、レジ画面の前借り集計が 0 になっていた。
      date: getTodayBusinessDay(),
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
  casts, attendanceRecords, dailyPayRequests, addDailyPayRequest, billingRecords,
}: {
  casts: Cast[]
  attendanceRecords: AttendanceRecord[]
  dailyPayRequests: import('../data/mock').DailyPayRequest[]
  addDailyPayRequest: (req: import('../data/mock').DailyPayRequest) => void
  billingRecords: BillingRecord[]
}) {
  const { dailyReports } = useStore()
  const { user } = useAuth()
  // 追補02 R11-3: 営業日の定義 (朝 5:00 境界、開始日基準)
  const [targetDate, setTargetDate] = useState<string>(() => getTodayBusinessDay())
  // PDF/Word 第2弾: 締め済み営業日の日払いは確定済給与の上書きになるため操作不可。
  const targetDateClosed = isBusinessDateClosed(targetDate, dailyReports)

  // その営業日にシフト in / out があったキャストの集計
  const records = attendanceRecords.filter((r) => r.date === targetDate && r.staffType === 'cast')
  const activeTodayCasts = casts.filter((c) => records.some((r) => r.staffId === c.id))

  // DailyPayDialog 用の対象。calculatedAmount は自動計算額 (10% 控除後 net)。
  const [paying, setPaying] = useState<
    | { castId: number; castName: string; calculatedAmount: number; breakdown: DailyPayBreakdownResult }
    | null
  >(null)

  const computePay = (cast: Cast, rec?: AttendanceRecord) => {
    const hours = rec?.workHours ?? 0
    // 追補03 R25: 時給は 15 分単位 + ルーズタイム 15 分
    const basePay = calcHourlyPay(cast.hourlyRate, hours)
    const deductible = Math.floor(basePay * 0.1) // 一律 10% 控除
    return { basePay, net: basePay - deductible, hours }
  }

  // 同営業日の既支払合計。boolean ではなく金額で持っておくと
  // 「部分払い後の差額支払」「全額支払済 disabled」の判定がそのまま書ける。
  const paidTodayFor = (castId: number): number =>
    dailyPayRequests
      .filter((r) => r.castId === castId && r.date === targetDate)
      .reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-bold text-gold mb-2">日払い管理</h3>
        <p className="text-xs text-gray-500 mb-3">
          営業日 (朝 5:00 境界、開始日基準) ごとに、その日に出勤したキャスト全員を表示します。
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
          {targetDateClosed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 border border-white/20 flex items-center gap-1" title={LOCKED_TOOLTIP}>
              <Lock size={9} /> 締め済
            </span>
          )}
        </div>
        {targetDateClosed && (
          <p className="text-xs text-amber-300/80 mt-2">
            ※ 締め済み営業日のため日払い操作はロックされています。修正には「日報・レジ締め」で解除が必要です。
          </p>
        )}
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
              const paidToday = paidTodayFor(c.id)
              const unpaid = Math.max(0, net - paidToday)
              const fullyPaid = paidToday > 0 && unpaid <= 0
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
                    {paidToday > 0 && (
                      <div className="text-[10px] text-gray-500 tabular-nums">
                        既支払 ¥{paidToday.toLocaleString()} / 未支給差額 ¥{unpaid.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">現時点給料</div>
                    <div className="text-sm font-bold text-gold tabular-nums">¥{net.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600">(10% 控除前 ¥{basePay.toLocaleString()})</div>
                  </div>
                  {fullyPaid ? (
                    <span className="shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">全額支払済</span>
                  ) : (
                    <button
                      onClick={() => {
                        // DailyPayDialog 上で「本日の稼働実績 / 既支払額 / 未支給差額」が
                        // 出せるよう breakdown を作って渡す。
                        // ボトルバックを給与明細と一致させるため全キャストの率を渡す。
                        const bottleRates = buildBottleBackRateByCast(casts)
                        const breakdown = computeDailyPayBreakdown(
                          c, targetDate, attendanceRecords, billingRecords, dailyPayRequests,
                          bottleRates,
                        )
                        setPaying({
                          castId: c.id, castName: c.name,
                          calculatedAmount: breakdown.net, breakdown,
                        })
                      }}
                      disabled={targetDateClosed}
                      title={targetDateClosed ? LOCKED_TOOLTIP : undefined}
                      className="shrink-0 btn-gold text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {paidToday > 0 ? '差額支払' : '支払う'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* DailyPayDialog: 自動計算 + 上書き + 調整理由 (必須) + メモ + 操作者 + paidAt */}
      <DailyPayDialog
        open={!!paying}
        cast={paying ? { id: paying.castId, name: paying.castName } : null}
        calculatedAmount={paying?.calculatedAmount ?? 0}
        targetDate={targetDate}
        operator={user?.displayName ?? user?.username}
        staffType="cast"
        breakdown={paying?.breakdown}
        onSubmit={(req) => {
          if (targetDateClosed) { setPaying(null); return }
          addDailyPayRequest(req)
          setPaying(null)
        }}
        onClose={() => setPaying(null)}
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
      // 深夜帯の前払いを前営業日に乗せるため UTC 暦日ではなく businessDate を使う。
      date: getTodayBusinessDay(),
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
// PDF/Word 第2弾: 「空き卓にする」は廃止済みなので、未収は管理画面から
// 明示的に「会計済み 1 組」を選んで `uncollectedStatus: 'pending'` で登録する。
// 既存の isUncollected フラグ経由の未収も後方互換で扱う (utils/uncollected.ts)。
// ────────────────────────────────────────────────────────────
type UncollectedSubTab = 'pending' | 'written_off' | 'register'

function UncollectedManager({ billingRecords, updateBillingRecord }: {
  billingRecords: BillingRecord[]
  updateBillingRecord: (id: string, patch: Partial<Pick<BillingRecord, 'uncollectedStatus' | 'uncollectedReason' | 'writtenOffAt' | 'settledOff'>>) => void
}) {
  const navigate = useNavigate()
  const { dailyReports } = useStore()
  const [subTab, setSubTab] = useState<UncollectedSubTab>('pending')
  const [reasonFor, setReasonFor] = useState<BillingRecord | null>(null)
  const [reasonInput, setReasonInput] = useState('')
  // 新規登録タブ用: 既存会計の検索キーワード（卓番号・キャスト名・日付など）
  const [registerSearch, setRegisterSearch] = useState('')
  const [registerTarget, setRegisterTarget] = useState<BillingRecord | null>(null)
  const [registerReason, setRegisterReason] = useState('')

  const pendingList = billingRecords.filter(
    (r) =>
      isUncollectedActive(r) &&
      r.uncollectedStatus !== 'written_off' &&
      !r.voidedAt,
  )
  const writtenOffList = billingRecords.filter((r) => r.uncollectedStatus === 'written_off')
  // 登録候補: 取消されていない・未収未登録の会計のみ
  const registerCandidates = billingRecords
    .filter((r) => !r.voidedAt && !isUncollectedActive(r))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  const filteredCandidates = registerCandidates.filter((r) => {
    if (!registerSearch.trim()) return true
    const q = registerSearch.trim().toLowerCase()
    const fields: string[] = [
      r.tableNumber,
      r.businessDate ?? r.date ?? '',
      ...(r.castNamesSnapshot ?? []),
      String(r.receiptSnapshot?.receiptNumber ?? ''),
    ]
    return fields.some((s) => s.toLowerCase().includes(q))
  })

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

  // PDF/Word 第2弾: 会計済み 1 組を未収として明示登録する。
  // 既存スキーマの `isUncollected` フラグはバックエンド patch 不可なので、
  // `uncollectedStatus: 'pending'` だけで「保留中（=未収扱い）」を表現する。
  // isUncollectedActive() がこの状態も拾うため、売上集計から除外される。
  const handleRegisterAsUncollected = () => {
    if (!registerTarget) return
    const reason = registerReason.trim()
    if (!reason) return
    updateBillingRecord(registerTarget.id, {
      uncollectedStatus: 'pending',
      uncollectedReason: reason,
    })
    setRegisterTarget(null)
    setRegisterReason('')
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
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSubTab('pending')}
          className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-bold ${subTab === 'pending' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
        >
          保留中 ({pendingList.length})
        </button>
        <button
          onClick={() => setSubTab('written_off')}
          className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-bold ${subTab === 'written_off' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
        >
          確定未収 ({writtenOffList.length})
        </button>
        <button
          onClick={() => setSubTab('register')}
          className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-bold ${subTab === 'register' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
          title="会計済みの 1 組を選択して未収登録"
        >
          新規登録
        </button>
      </div>

      {/* 新規登録モーダル: 会計済み 1 組 → 未収扱い (保留中) として登録 */}
      {registerTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-lg p-4 max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-white">未収として登録</h3>
            <div className="text-xs text-gray-400">
              {registerTarget.tableNumber}卓 / ¥{registerTarget.total.toLocaleString()} / {formatDateTime(registerTarget.completedAt)}
            </div>
            <div className="text-xs text-amber-300/80">
              登録すると、この組は売上集計から除外されます (回収で取消可)。
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">事由（必須）</label>
              <input
                value={registerReason}
                onChange={(e) => setRegisterReason(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                placeholder="例: カード端末エラーで未回収"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRegisterTarget(null); setRegisterReason('') }} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-400">キャンセル</button>
              <button onClick={handleRegisterAsUncollected} disabled={!registerReason.trim()} className="flex-1 py-2 rounded-lg text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 disabled:opacity-40">未収登録する</button>
            </div>
          </div>
        </div>
      )}

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

      {subTab === 'register' && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">
            会計済みの 1 組を選んで未収として登録します。「空き卓にする」は廃止されたため、未収はここから明示的に登録してください。
          </div>
          <input
            type="search"
            value={registerSearch}
            onChange={(e) => setRegisterSearch(e.target.value)}
            placeholder="卓番号 / 担当キャスト / 日付 / 伝票No で絞り込み"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
          />
          {filteredCandidates.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              該当する会計記録がありません
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {filteredCandidates.slice(0, 100).map((r) => {
                const bd = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
                const closed = isBusinessDateClosed(bd, dailyReports)
                return (
                  <button
                    key={r.id}
                    onClick={() => { setRegisterTarget(r); setRegisterReason('') }}
                    disabled={closed}
                    title={closed ? LOCKED_TOOLTIP : undefined}
                    className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded p-2.5 flex justify-between items-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-xs text-gray-400 space-y-0.5 min-w-0">
                      <div className="font-bold text-white">{r.tableNumber}卓 {closed && <span className="ml-1 text-[10px] text-gray-500">(締め済)</span>}</div>
                      <div>{formatDateTime(r.completedAt)} / 担当: {(r.castNamesSnapshot ?? []).join(', ') || '-'}</div>
                      {r.receiptSnapshot && <div className="text-gray-500">伝票No. {r.receiptSnapshot.receiptNumber}</div>}
                    </div>
                    <div className="text-base font-bold text-gold tabular-nums shrink-0 ml-3">¥{r.total.toLocaleString()}</div>
                  </button>
                )
              })}
              {filteredCandidates.length > 100 && (
                <div className="text-[10px] text-gray-500 text-center py-2">
                  ※ 上位 100 件のみ表示。さらに絞り込んでください。
                </div>
              )}
            </div>
          )}
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
  dailyPayRequests,
  expenses,
  advancePayments,
  storeSettings,
}: {
  dailyReports: DailyReport[]
  setDailyReports: React.Dispatch<React.SetStateAction<DailyReport[]>>
  billingRecords: BillingRecord[]
  dailyPayRequests: DailyPayRequest[]
  expenses: Expense[]
  advancePayments: AdvancePayment[]
  storeSettings: StoreSettings
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
  // PDF/Word 第2弾: 未収扱い (旧 isUncollected 或いは新 uncollectedStatus='pending'/'written_off')
  // も売上集計から除外する。recovered (回収済) は通常会計扱いで含める。
  const dateMatchedAll = billingRecords.filter(
    (r) => !r.voidedAt && ((r.businessDate ?? r.date) === businessDate),
  )
  const todayRecords = dateMatchedAll.filter((r) => !isUncollectedActive(r))
  const excludedUncollected = dateMatchedAll.filter((r) => isUncollectedActive(r))
  const cashSales = todayRecords.reduce((s, r) => s + (r.cashAmount ?? 0), 0)
  const cardSales = todayRecords.reduce((s, r) => s + (r.cardAmount ?? 0), 0)
  const totalSales = cashSales + cardSales
  // RegisterPage と理論有高ロジックを揃える: 日払い・現金経費・レジ現金からの前借りを差し引く。
  // 旧実装では initialCash + cashSales のみで、レジ画面側との表示差異が出ていた。
  const dailyPayTotal = dailyPayRequests
    .filter((r) => r.date === businessDate)
    .reduce((s, r) => s + r.amount, 0)
  const cashExpenseTotal = expenses
    .filter((e) => e.source === 'register' && e.date === businessDate)
    .reduce((s, e) => s + e.amount, 0)
  const cashAdvanceTotal = advancePayments
    .filter((p) => p.source === 'register' && p.date === businessDate)
    .reduce((s, p) => s + p.amount, 0)
  const initialCash = storeSettings.initialCash
  const theoreticalCash = initialCash + cashSales - dailyPayTotal - cashExpenseTotal - cashAdvanceTotal
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
      dailyPayTotal,
      cashExpenseTotal,
      cashAdvanceTotal,
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
          {excludedUncollected.length > 0 && (
            <>
              <div className="text-amber-300/80">未収除外</div>
              <div className="text-right text-amber-300/80">
                {excludedUncollected.length}件 / -¥{excludedUncollected.reduce((s, r) => s + r.total, 0).toLocaleString()}
              </div>
            </>
          )}
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
          // PDF/Word 第2弾: 締め状態をバッジで明示。closedAt あり = 締め済み (会計
          // 修正・勤怠修正・経費追加すべてロック)、reopened = ロック解除中、open = 未締め。
          const closingState = getClosingState(bd, dailyReports)
          const stateLabel = getClosingStateLabel(closingState)
          const stateClass = closingState === 'closed'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : closingState === 'reopened'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-white/10 text-gray-400 border-white/20'
          return (
            <div key={`${bd}-${r.id}`} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div className="text-white font-bold flex items-center gap-2 flex-wrap">
                    {formatBusinessDay(bd)}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stateClass}`}>
                      {stateLabel}
                    </span>
                  </div>
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
