import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { MenuItem, CastMenuItem, OrderItem } from '../data/mock'
import { displayOrderName, chargeItems, EXTENSION_OPTIONS, getSetPriceForTime } from '../data/mock'
import { Minus, Plus, Trash2, CreditCard, Gift, UserMinus, Clock as ClockIcon } from 'lucide-react'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import CastChip from '../components/CastChip'
import Modal from '../components/Modal'
import { Input, Field as FormField } from '../components/Input'
import { GoldButton, DangerButton, GhostButton, DarkButton } from '../components/Buttons'
import { useExtendTable } from '../hooks/useExtendTable'

// ビデオレビュー N6 (注1 15:50): ヘルプの再定義
//   - 待機キャストが場内指名なしで入った状態
//   - 価格 ¥4,000 (店舗売上として全額計上)
//   - キャストバック 0 (誰にもバックなし)
//   - キャストの個人売上には載せない (= castName を紐付けない)
//   - category: 'guest' で扱い (キャストドリンクではない)
const HELP_GUEST_ITEM = {
  id: 999,
  name: 'ヘルプ',
  price: 4000,
  cost: 0,
  castBack: 0,
  category: 'guest' as const,
  subcategory: 'warimono' as const,
}

// ISSUE-009: 'bottle' カテゴリ廃止（ボトルキープ管理ページに集約）
type CategoryKey =
  | 'all'
  | 'cast-drink'
  | 'shot-pitcher'
  | 'champagne'
  | 'whisky'
  | 'shochu'
  | 'brandy'
  | 'wine'
  | 'charge'

/**
 * ISSUE-011: カテゴリごとに色を割り当てて左メニューを視覚的に区別。
 *  - キャストドリンクはピンク（他と最も差別化、指示書要件）
 *  - 各色はダーク背景上で WCAG AA (4.5:1) を満たす 200〜300 系
 *  - inactive 時も左端のカラーバーで色だけは保持し識別性を維持
 */
type CategoryDef = {
  key: CategoryKey
  label: string
  /** active 時の背景・文字色クラス (Tailwind purge 検出のため静的記述) */
  activeBg: string
  activeText: string
  /** 左端カラーバー (常時表示、active で太く) */
  bar: string
  barActive: string
}

const categories: CategoryDef[] = [
  { key: 'all',          label: '全ての商品',     activeBg: 'bg-white/10',        activeText: 'text-white',       bar: 'bg-white/20',     barActive: 'bg-white/60' },
  { key: 'cast-drink',   label: 'キャストドリンク', activeBg: 'bg-pink-500/15',    activeText: 'text-pink-200',    bar: 'bg-pink-400/40',  barActive: 'bg-pink-300' },
  { key: 'shot-pitcher', label: '単品ドリンク',    activeBg: 'bg-sky-500/15',      activeText: 'text-sky-200',     bar: 'bg-sky-400/40',   barActive: 'bg-sky-300' },
  { key: 'champagne',    label: 'シャンパン',      activeBg: 'bg-amber-500/15',    activeText: 'text-amber-200',   bar: 'bg-amber-400/40', barActive: 'bg-amber-300' },
  { key: 'whisky',       label: 'ウイスキー',      activeBg: 'bg-orange-500/15',   activeText: 'text-orange-200',  bar: 'bg-orange-400/40',barActive: 'bg-orange-300' },
  { key: 'shochu',       label: '焼酎',            activeBg: 'bg-emerald-500/15',  activeText: 'text-emerald-200', bar: 'bg-emerald-400/40',barActive: 'bg-emerald-300' },
  { key: 'brandy',       label: 'ブランデー',      activeBg: 'bg-rose-500/15',     activeText: 'text-rose-200',    bar: 'bg-rose-400/40',  barActive: 'bg-rose-300' },
  { key: 'wine',         label: 'ワイン',          activeBg: 'bg-red-500/15',      activeText: 'text-red-200',     bar: 'bg-red-400/40',   barActive: 'bg-red-300' },
  { key: 'charge',       label: '指名料・同伴',    activeBg: 'bg-cyan-500/15',     activeText: 'text-cyan-200',    bar: 'bg-cyan-400/40',  barActive: 'bg-cyan-300' },
]

/**
 * TRUST 準拠の 4 カラム注文画面。
 * [カテゴリー | メニュー | 誰に | 注文明細]
 *
 * ISSUE-002 反映: キャスト複数同時選択 → 商品 1 タップで選択中の全キャストに 1 件ずつ追加。
 * ISSUE-003 反映: 「待機へ」一括ボタン → 選択中の全キャストを一括で待機に戻す。
 * ISSUE-009 反映: 「ボトルキープ」カテゴリ・タブ・ダイアログを削除（管理は別画面に集約）。
 *   store の bottleKeeps state/action は既存データ保持のため残置。
 */
export default function OrderPage() {
  const {
    tables, casts, guestMenu, castMenu, storeSettings,
    addOrderToTable, removeOrderFromTable, setOrderBonus,
    moveCast, updateTable,
  } = useStore()
  const extendTable = useExtendTable()
  const [showAddCast, setShowAddCast] = useState(false)
  /** 追補03 R18: ボーナス設定対象の注文行 */
  const [bonusTarget, setBonusTarget] = useState<OrderItem | null>(null)
  const [bonusCastName, setBonusCastName] = useState<string>('')
  const [bonusAmount, setBonusAmount] = useState(0)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const initialTableId = Number(searchParams.get('table')) || occupiedTables[0]?.id || 0
  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  // ISSUE-002: 単数 → 複数選択（[] = 「指名なし」状態）
  const [selectedCastNames, setSelectedCastNames] = useState<string[]>([])
  // ISSUE-002: 本指名状態でフリー商品を押した時の警告モーダル
  const [pendingFreeMenuItem, setPendingFreeMenuItem] = useState<MenuItem | null>(null)
  // ISSUE-002 補修: 本指名卓でキャスト未選択 + キャストドリンクをタップした時の確認モーダル
  //   alert ではなく Modal で「本指名キャスト全員に追加するか？」を確認
  const [pendingCastDrinkItem, setPendingCastDrinkItem] = useState<MenuItem | null>(null)
  // ISSUE-005: 内訳の折りたたみ（デフォルト非表示）
  const [showBreakdown, setShowBreakdown] = useState(false)
  // 延長確認モーダル: 指名キャスト未確定なら開いたまま選択
  const [pendingExtend, setPendingExtend] = useState<{ minutes: 30 | 60; castName?: string } | null>(null)

  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const orders = selectedTable?.orders ?? []
  const hasMainShimei = (selectedTable?.mainNominationCastNames?.length ?? 0) > 0

  const menuItems: MenuItem[] = useMemo(() => {
    const all = [...guestMenu, ...castMenu]
    switch (activeCategory) {
      case 'all':
        return all
      case 'cast-drink':
        return castMenu
      case 'shot-pitcher':
        return guestMenu.filter((i) => ['shot', 'pitcher', 'beer', 'warimono'].includes(i.subcategory))
      case 'champagne':
        return guestMenu.filter((i) => i.subcategory === 'champagne')
      case 'whisky':
        return guestMenu.filter((i) => i.subcategory === 'whisky')
      case 'shochu':
        return guestMenu.filter((i) => i.subcategory === 'shochu')
      case 'brandy':
        return guestMenu.filter((i) => i.subcategory === 'brandy')
      case 'wine':
        return guestMenu.filter((i) => i.subcategory === 'wine')
      default:
        return []
    }
  }, [activeCategory, guestMenu, castMenu])

  // ISSUE-002: キャスト選択トグル
  const toggleCastSelection = (name: string) => {
    setSelectedCastNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )
  }

  /** 選択中の全キャストに 1 件ずつ注文を追加。誰も選んでなければフリー扱い。 */
  const addOrderForSelectedCasts = (item: MenuItem) => {
    if (!selectedTableId) return
    if (selectedCastNames.length === 0) {
      addOrderToTable(selectedTableId, { menuItem: item, quantity: 1 })
      return
    }
    selectedCastNames.forEach((name) => {
      addOrderToTable(selectedTableId, { menuItem: item, quantity: 1, castName: name })
    })
  }

  const handleAdd = (item: MenuItem) => {
    if (!selectedTableId || !selectedTable) return
    // cast メニューはキャスト紐付け必須
    if (item.category === 'cast') {
      if (selectedCastNames.length === 0) {
        // ISSUE-002 補修: 本指名卓ならモーダルで確認、それ以外は alert で促す
        if (hasMainShimei) {
          setPendingCastDrinkItem(item)
          return
        }
        alert('キャストドリンクはキャストを選択してから追加してください')
        return
      }
      addOrderForSelectedCasts(item)
      return
    }
    // ISSUE-002: 本指名キャストがいる状態でフリー商品（キャスト非選択）を押したら警告
    if (item.category === 'guest' && selectedCastNames.length === 0 && hasMainShimei) {
      setPendingFreeMenuItem(item)
      return
    }
    addOrderForSelectedCasts(item)
  }

  const confirmFreeOrder = () => {
    if (!selectedTableId || !pendingFreeMenuItem) return
    addOrderToTable(selectedTableId, { menuItem: pendingFreeMenuItem, quantity: 1 })
    setPendingFreeMenuItem(null)
  }

  // ISSUE-002 補修: キャストドリンク確認モーダルの「OK」処理。本指名キャスト全員に 1 件ずつ追加
  const confirmCastDrinkOrder = () => {
    if (!selectedTableId || !pendingCastDrinkItem || !selectedTable) return
    selectedTable.mainNominationCastNames.forEach((name) => {
      addOrderToTable(selectedTableId, { menuItem: pendingCastDrinkItem, quantity: 1, castName: name })
    })
    setPendingCastDrinkItem(null)
  }

  const handleAddCharge = (charge: { id: string; label: string; price: number; cost: number }) => {
    if (!selectedTableId || !selectedTable) return
    if (selectedCastNames.length === 0) {
      alert('指名料はキャストを選択してから追加してください')
      return
    }
    selectedCastNames.forEach((name) => {
      const order: OrderItem = {
        menuItem: {
          id: 3000 + Math.floor(Math.random() * 1_000_000),
          name: charge.label,
          price: charge.price,
          cost: charge.cost,
          castBack: 0,
          category: 'guest',
          subcategory: 'warimono',
        },
        quantity: 1,
        castName: name,
      }
      addOrderToTable(selectedTableId, order)
    })
  }

  const handleAddHelp = () => {
    if (!selectedTableId) return
    // ビデオレビュー N6: ヘルプはキャスト紐付けなし、全額店舗売上
    addOrderToTable(selectedTableId, { menuItem: HELP_GUEST_ITEM, quantity: 1 })
  }

  // ISSUE-003: 選択中のキャスト全員を一括で待機に戻す
  const handleSendSelectedToWaiting = () => {
    if (selectedCastNames.length === 0) return
    selectedCastNames.forEach((name) => moveCast(name, null))
    setSelectedCastNames([])
  }

  const handleRemove = (itemId: number, castName?: string) => {
    if (!selectedTableId) return
    removeOrderFromTable(selectedTableId, itemId, castName)
  }

  const handleIncrement = (o: OrderItem) => {
    if (!selectedTableId) return
    addOrderToTable(selectedTableId, { menuItem: o.menuItem, quantity: 1, castName: o.castName })
  }

  const handleDelete = (itemId: number, castName?: string) => {
    if (!selectedTableId) return
    const order = orders.find((o) => o.menuItem.id === itemId && o.castName === castName)
    if (!order) return
    for (let i = 0; i < order.quantity; i++) {
      removeOrderFromTable(selectedTableId, itemId, castName)
    }
  }

  // ─── 延長 (FloorPage.requestExtend と同等のロジックに準拠) ───
  const requestExtend = (minutes: 30 | 60) => {
    if (!selectedTable) return
    // 既定の指名キャスト: 本指名最優先 → 担当先頭 → undefined (フリー)
    const defaultCast =
      selectedTable.mainNominationCastNames[0] ?? selectedTable.assignedCasts[0]
    setPendingExtend({ minutes, castName: defaultCast })
  }

  const confirmExtend = () => {
    if (!selectedTable || !pendingExtend) return
    extendTable(selectedTable, pendingExtend.minutes, pendingExtend.castName)
    setPendingExtend(null)
    // 注文画面に留まる（同卓のままセット番号が進む）→ ユーザーの追加注文を継続できる
    setSelectedCastNames([])
  }

  // ─── 本指名 / 同伴 のトグル (task ③) ───
  const toggleMainNomination = (castName: string) => {
    if (!selectedTable) return
    const current = selectedTable.mainNominationCastNames
    const next = current.includes(castName)
      ? current.filter((n) => n !== castName)
      : [...current, castName]
    updateTable(selectedTable.id, { mainNominationCastNames: next })
  }

  const toggleDouhan = () => {
    if (!selectedTable) return
    updateTable(selectedTable.id, {
      isDouhan: selectedTable.isDouhan ? undefined : true,
    })
  }

  const subtotal = orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)
  const setPrice = selectedTable?.startTime
    ? (() => {
        const h = parseInt(selectedTable.startTime.split(':')[0], 10)
        return h < 4 ? 6000 : h < 22 ? 4000 : h < 24 ? 5000 : 6000
      })()
    : 0
  const adjustedSetPrice = Math.max(0, setPrice - (selectedTable?.setDiscountPerSet ?? 0))
  const setSubtotal = selectedTable ? adjustedSetPrice * selectedTable.guestCount * selectedTable.setCount : 0
  const grandTotal = subtotal + setSubtotal + Math.round((subtotal + setSubtotal) * storeSettings.taxRate)

  // spec.md §3.2.1: 「注文印刷」ボタン削除に伴い handlePrintOrder も削除。
  if (!selectedTable) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>卓が選択されていません</p>
        <div className="mt-4">
          <GhostButton onClick={() => navigate('/floor')}>ホールへ戻る</GhostButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ContextualHeader
        accent="order"
        title={`注文入力 — 卓 ${selectedTable.number}`}
        backTo="/floor"
        right={
          <select
            value={selectedTableId}
            onChange={(e) => {
              setSelectedTableId(Number(e.target.value))
              setSelectedCastNames([])
            }}
            className="bg-primary-dark/60 border border-gold/30 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {occupiedTables.map((t) => (
              <option key={t.id} value={t.id}>
                卓 {t.number} ({t.assignedCasts.join(',') || '-'})
              </option>
            ))}
          </select>
        }
      />

      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)_170px_minmax(0,1.3fr)]">
        {/* ── Column 1: カテゴリー (ISSUE-011: カテゴリ別カラー識別) ── */}
        <div className="border-r border-white/10 overflow-y-auto bg-primary-dark">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`relative w-full text-left pl-5 pr-4 py-3 text-sm border-b border-white/5 transition-colors ${
                  isActive
                    ? `${cat.activeBg} ${cat.activeText} font-bold`
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {/* 左端カラーバー: 常時表示、active で太く＋明るく */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-0 bottom-0 transition-all ${
                    isActive ? `w-1.5 ${cat.barActive}` : `w-1 ${cat.bar}`
                  }`}
                />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* ── Column 2: メニュー ── */}
        <div className="overflow-y-auto p-3 border-r border-white/10">
          {activeCategory === 'charge' ? (
            <div className="grid grid-cols-2 gap-2 content-start">
              {chargeItems.filter((c) => c.id !== 'single-charge').map((c) => (
                <button key={c.id} onClick={() => handleAddCharge(c)} className="btn-gold text-left p-3 block">
                  <div className="text-sm font-bold">{c.label}</div>
                  <div className="text-xs tabular-nums mt-1">¥{c.price.toLocaleString()}</div>
                </button>
              ))}
              <button onClick={handleAddHelp} className="btn-dark text-left p-3 block border border-gold/40">
                <div className="text-sm font-bold">ヘルプ</div>
                <div className="text-xs text-gray-400 mt-1">バック記録のみ</div>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 content-start">
              {menuItems.map((item) => {
                const orderedQty = orders.filter((o) => o.menuItem.id === item.id).reduce((s, o) => s + o.quantity, 0)
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item)}
                    className={`relative text-left p-3 rounded-lg border transition-colors ${
                      item.category === 'cast'
                        ? 'bg-gold/10 border-gold/40 hover:bg-gold/20'
                        : 'panel hover:bg-white/10'
                    }`}
                  >
                    <div className="text-sm font-medium text-white truncate">{item.name}</div>
                    <div className="text-sm tabular-nums text-gold mt-1">
                      {item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}
                    </div>
                    {item.category === 'cast' && (
                      <div className="text-[10px] text-gray-400 mt-0.5">Back: {(item as CastMenuItem).backType}</div>
                    )}
                    {orderedQty > 0 && (
                      <span className="absolute -top-2 -right-2 bg-accent text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                        {orderedQty}
                      </span>
                    )}
                  </button>
                )
              })}
              {menuItems.length === 0 && (
                <div className="col-span-2 text-center text-gray-500 text-sm py-8">該当商品なし</div>
              )}
            </div>
          )}
        </div>

        {/* ── Column 3: キャスト選択 ── */}
        <div className="overflow-y-auto p-3 border-r border-white/10 bg-primary-dark flex flex-col">
          {/* ISSUE-003: 「待機へ」一括ボタン（選択中のみ表示、ピンク強調） */}
          <button
            onClick={handleSendSelectedToWaiting}
            disabled={selectedCastNames.length === 0}
            className={`mb-3 w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
              selectedCastNames.length === 0
                ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                : 'bg-pink-500 hover:bg-pink-400 text-white shadow-lg shadow-pink-500/30'
            }`}
            title="選択中のキャストを一括で待機に戻す"
          >
            <UserMinus size={14} /> 待機へ{selectedCastNames.length > 0 && ` (${selectedCastNames.length})`}
          </button>

          {/* spec.md: 担当欄 — 本指名キャスト名(複数はカンマ区切り)、いなければ「フリー」 */}
          <div className="mb-2">
            <div className="text-[10px] text-gray-500 tracking-wider">担当</div>
            <div
              className={`text-[11px] mt-0.5 tracking-wider ${
                selectedTable.mainNominationCastNames.length > 0 ? 'text-gold' : 'text-gray-400'
              }`}
            >
              {selectedTable.mainNominationCastNames.length > 0
                ? selectedTable.mainNominationCastNames.join(', ')
                : 'フリー'}
            </div>
          </div>

          {/* task ③: 同伴フラグの卓単位トグル（バッジクリックで ON/OFF） */}
          <button
            onClick={toggleDouhan}
            className={`mb-2 w-full text-[11px] py-1.5 rounded-md border transition-colors ${
              selectedTable.isDouhan
                ? 'bg-pink-500/20 border-pink-400/50 text-pink-200 font-bold'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-pink-200 hover:border-pink-400/30'
            }`}
            title="この卓の同伴フラグを切り替え"
          >
            {selectedTable.isDouhan ? '☑ 同伴あり' : '☐ 同伴なし'}
          </button>

          <div className="grid grid-cols-1 gap-1.5">
            <CastChip
              name="指名なし"
              selected={selectedCastNames.length === 0}
              onClick={() => setSelectedCastNames([])}
            />
            {/* ISSUE-006: キャスト名の右に 本締め / 場内 バッジ + 卓番号バッジ
                task ③: 本締めバッジはクリックで本指名 ON/OFF できるトグルに昇格。
                同伴は卓単位フラグなので上のトグルへ移動済み。 */}
            {selectedTable.assignedCasts.map((name: string) => {
              const isMain = selectedTable.mainNominationCastNames.includes(name)
              const isBanai = !!selectedTable.isBanaiShimei && !isMain
              return (
                <div key={name} className="flex items-stretch gap-1">
                  <CastChip
                    name={name}
                    selected={selectedCastNames.includes(name)}
                    onClick={() => toggleCastSelection(name)}
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-0.5 items-end justify-center shrink-0 w-14">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMainNomination(name) }}
                      className={`text-[9px] leading-tight px-1.5 py-0.5 rounded font-bold tracking-tight transition-colors ${
                        isMain
                          ? 'bg-amber-500/30 text-amber-200 hover:bg-amber-500/40'
                          : 'bg-white/5 text-gray-500 hover:bg-amber-500/20 hover:text-amber-200'
                      }`}
                      title={isMain ? '本指名を解除' : '本指名にする'}
                    >
                      {isMain ? '★本指名' : '☆本指名'}
                    </button>
                    {isBanai && (
                      <span className="text-[9px] leading-tight px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 font-bold tracking-tight">場内</span>
                    )}
                    <span className="text-[9px] leading-tight px-1.5 py-0.5 rounded bg-gold/20 text-gold font-bold tracking-tight tabular-nums">卓{selectedTable.number}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 追補02 R2-1: 「女の子を追加」で他卓キャストをこの卓に移動 (排他移動) */}
          <button
            onClick={() => setShowAddCast(true)}
            className="mt-2 w-full btn-ghost text-xs py-1.5 flex items-center justify-center gap-1"
          >
            <Plus size={12} /> 女の子を追加
          </button>

          <div className="mt-3 text-[10px] text-gray-500 leading-relaxed">
            タップで選択 / 解除、複数選択中は商品 1 タップで全員に注文が追加されます。
          </div>
        </div>

        {/* ── Column 4: 注文明細 ── */}
        <div className="overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 tracking-wider">注文明細</span>
            <span className="text-[10px] text-gray-500">{orders.length} 品</span>
          </div>

          {orders.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-12">注文なし</div>
          ) : (
            <div className="space-y-1.5">
              {orders.map((o, idx) => (
                <div
                  key={`${o.menuItem.id}-${o.castName ?? ''}-${idx}`}
                  className="panel p-2.5 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{displayOrderName(o)}</div>
                      <div className="text-[10px] text-gray-400 tabular-nums">
                        ¥{o.menuItem.price.toLocaleString()} × {o.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setBonusTarget(o)
                          setBonusCastName(o.bonusCastName ?? '')
                          setBonusAmount(o.bonusAmount ?? 0)
                        }}
                        className={`w-7 h-7 flex items-center justify-center rounded-md ${
                          o.bonusCastName ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-gray-400'
                        }`}
                        title="ボーナス追加"
                      >
                        <Gift size={13} />
                      </button>
                      <button onClick={() => handleRemove(o.menuItem.id, o.castName)} className="w-7 h-7 flex items-center justify-center bg-white/5 rounded-md text-gray-300">
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-bold tabular-nums text-sm">{o.quantity}</span>
                      <button onClick={() => handleIncrement(o)} className="w-7 h-7 flex items-center justify-center bg-white/5 rounded-md text-gray-300">
                        <Plus size={14} />
                      </button>
                      <button onClick={() => handleDelete(o.menuItem.id, o.castName)} className="w-7 h-7 flex items-center justify-center bg-red-500/10 rounded-md text-red-400 ml-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {o.bonusCastName && o.bonusAmount && (
                    <div className="text-[10px] text-amber-300 flex items-center gap-1">
                      <Gift size={10} /> ボーナス: {o.bonusCastName} +¥{o.bonusAmount.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* subtotal inside column 4 — ISSUE-005: 合計を最大フォントで強調、内訳は折りたたみ */}
          <div className="mt-3 panel-gold p-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-gold">合計 (税込)</span>
              <span className="text-3xl font-bold text-gold tabular-nums">¥{grandTotal.toLocaleString()}</span>
            </div>
            {showBreakdown && (
              <div className="space-y-1 pt-2 border-t border-gold/30">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-300">セット料金</span>
                  <span className="tabular-nums">¥{setSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-300">注文小計</span>
                  <span className="tabular-nums">¥{subtotal.toLocaleString()}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full text-[11px] text-gray-400 hover:text-gold py-0.5 transition-colors"
            >
              {showBreakdown ? '▲ 内訳を隠す' : '▼ 内訳を表示'}
            </button>
          </div>
        </div>
      </div>

      {/* spec.md §3.2.1: フッター左「注文小計」と右「注文印刷」を削除。
          合計表示は右ペインの「合計（税込）」に集約済。中央の「利用明細へ」のみ残す。
          task ②: 右側に「延長 +30分 / +60分」ボタンを追加し、注文画面に居たまま延長確定できる。 */}
      <BottomActionBar
        center={
          <DangerButton
            // ISSUE-010: 利用明細から戻る時に元の注文画面 (/order?table=N) に戻れるよう from を付与
            onClick={() => navigate(`/table/${selectedTable.id}?from=${encodeURIComponent(`/order?table=${selectedTable.id}`)}`)}
            className="text-base px-6 flex items-center gap-2"
          >
            <CreditCard size={18} /> 利用明細へ
          </DangerButton>
        }
        right={
          <div className="flex items-center gap-1.5">
            {EXTENSION_OPTIONS.map((min) => (
              <DarkButton
                key={min}
                onClick={() => requestExtend(min as 30 | 60)}
                className="text-sm flex items-center gap-1"
                title={`+${min}分 延長`}
              >
                <ClockIcon size={14} /> +{min}分
              </DarkButton>
            ))}
          </div>
        }
      />

      {/* ISSUE-002 補修: 本指名卓でキャスト未選択 + キャストドリンク → 本指名キャスト全員に追加するかの確認 */}
      <Modal
        open={!!pendingCastDrinkItem}
        onClose={() => setPendingCastDrinkItem(null)}
        size="sm"
        title="本指名キャストのドリンクとして追加"
        footer={
          <>
            <GhostButton onClick={() => setPendingCastDrinkItem(null)} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={confirmCastDrinkOrder} className="flex-1">OK</GoldButton>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p>
            本指名キャスト（
            <span className="text-amber-300">{selectedTable?.mainNominationCastNames.join(', ')}</span>
            ）のドリンクとして
            <span className="text-gold"> 「{pendingCastDrinkItem?.name}」 </span>
            を追加しますか？
          </p>
          <p className="text-gray-400 text-xs">
            指名キャスト {selectedTable?.mainNominationCastNames.length ?? 0} 名全員に 1 件ずつ追加されます。
          </p>
        </div>
      </Modal>

      {/* ISSUE-002: 本指名キャストがいる卓でフリー商品（指名なし）を押した時の警告 */}
      <Modal
        open={!!pendingFreeMenuItem}
        onClose={() => setPendingFreeMenuItem(null)}
        size="sm"
        title="本指名担当の確認"
        footer={
          <>
            <GhostButton onClick={() => setPendingFreeMenuItem(null)} className="flex-1">キャンセル</GhostButton>
            <DangerButton onClick={confirmFreeOrder} className="flex-1">
              続行（フリー扱い）
            </DangerButton>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p>
            この卓には本指名キャスト（
            <span className="text-amber-300">{selectedTable?.mainNominationCastNames.join(', ')}</span>
            ）が紐付いています。
          </p>
          <p className="text-gray-400 text-xs">
            「指名なし」のままフリー商品として追加すると、本指名キャストの個人売上には計上されません。
            <br />本締めを確認してから続行してください。
          </p>
        </div>
      </Modal>

      {/* 追補03 R18: 注文行のボーナス加算設定 */}
      <Modal
        open={!!bonusTarget}
        onClose={() => setBonusTarget(null)}
        size="sm"
        title="ボーナス加算"
        footer={
          <>
            <GhostButton onClick={() => setBonusTarget(null)} className="flex-1">キャンセル</GhostButton>
            {bonusTarget?.bonusCastName && (
              <DangerButton
                onClick={() => {
                  if (!selectedTableId || !bonusTarget) return
                  setOrderBonus(selectedTableId, bonusTarget.menuItem.id, bonusTarget.castName, {})
                  setBonusTarget(null)
                }}
                className="flex-1"
              >
                解除
              </DangerButton>
            )}
            <GoldButton
              onClick={() => {
                if (!selectedTableId || !bonusTarget) return
                if (!bonusCastName || bonusAmount <= 0) return
                setOrderBonus(selectedTableId, bonusTarget.menuItem.id, bonusTarget.castName, {
                  bonusCastName,
                  bonusAmount,
                })
                setBonusTarget(null)
              }}
              className="flex-1"
              disabled={!bonusCastName || bonusAmount <= 0}
            >
              設定
            </GoldButton>
          </>
        }
      >
        {bonusTarget && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400">
              対象: {displayOrderName(bonusTarget)} {bonusTarget.castName && <span className="text-gold">→ {bonusTarget.castName}</span>}
            </div>
            <p className="text-xs text-gray-500">
              この注文に対して、別のキャストにもボーナス的な給与を少し加算します。
              売上帰属は変わりません (そのキャストへのご褒美金のみ)。
            </p>
            <FormField label="ボーナス対象キャスト">
              <select
                value={bonusCastName}
                onChange={(e) => setBonusCastName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-sm"
              >
                <option value="">(未選択)</option>
                {casts.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="ボーナス金額">
              <Input
                type="number"
                value={bonusAmount || ''}
                onChange={(e) => setBonusAmount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="例: 500"
              />
            </FormField>
          </div>
        )}
      </Modal>

      {/* task ②: 延長確認モーダル (FloorPage と同じ pending 確認フロー) */}
      <Modal
        open={!!pendingExtend && !!selectedTable}
        onClose={() => setPendingExtend(null)}
        size="sm"
        title={selectedTable ? `卓 ${selectedTable.number} 延長の確認` : '延長の確認'}
        footer={
          <>
            <GhostButton onClick={() => setPendingExtend(null)} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={confirmExtend} className="flex-1">延長する</GoldButton>
          </>
        }
      >
        {pendingExtend && selectedTable && (() => {
          const setUnit = selectedTable.startTime ? getSetPriceForTime(selectedTable.startTime) : 0
          const setUnitAdjusted = Math.max(0, setUnit - (selectedTable.setDiscountPerSet ?? 0))
          const fullSetCharge = setUnitAdjusted * selectedTable.guestCount
          const extCharge = pendingExtend.minutes === 60 ? fullSetCharge : Math.round(fullSetCharge / 2)
          const hasMain = selectedTable.mainNominationCastNames.length > 0
          return (
            <div className="space-y-3">
              <div className="panel p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">延長時間</span>
                  <span className="font-bold">+{pendingExtend.minutes}分</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">延長料金 ({selectedTable.guestCount}名 × ¥{setUnitAdjusted.toLocaleString()})</span>
                  <span className="font-bold text-gold tabular-nums">¥{extCharge.toLocaleString()}</span>
                </div>
              </div>

              {/* C12: 本指名 → フリー変更不可。本指名キャストがいる場合はフリー選択肢を出さない */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">指名 (バック帰属先)</label>
                <div className="flex gap-2 flex-wrap">
                  {!hasMain && (
                    <CastChip
                      name="フリー"
                      selected={!pendingExtend.castName}
                      onClick={() => setPendingExtend({ ...pendingExtend, castName: undefined })}
                    />
                  )}
                  {selectedTable.assignedCasts.map((name) => (
                    <CastChip
                      key={name}
                      name={name}
                      selected={pendingExtend.castName === name}
                      onClick={() => setPendingExtend({ ...pendingExtend, castName: name })}
                    />
                  ))}
                </div>
                {hasMain && (
                  <p className="text-[10px] text-gray-600 mt-1.5">※ 本指名がついている卓はフリーに変更できません</p>
                )}
              </div>

              <p className="text-xs text-amber-300/80 leading-relaxed">
                ※ 延長確定時、本指名以外の担当キャストは待機に戻り、同伴・場内指名フラグは解除されます。
                現在の注文明細はクリアされ、本指名料 + 延長料金が再計上されます。
              </p>
            </div>
          )
        })()}
      </Modal>

      {/* 追補02 R2: 「女の子を追加」 — 他卓対応中 or 待機中キャストを排他的に移動 */}
      <Modal
        open={showAddCast && !!selectedTable}
        onClose={() => setShowAddCast(false)}
        size="md"
        title={`卓 ${selectedTable?.number ?? ''} に追加する女の子`}
        footer={<GhostButton onClick={() => setShowAddCast(false)} className="flex-1">キャンセル</GhostButton>}
      >
        {selectedTable && (() => {
          // この卓の assignedCasts に含まれない、active かつ非休憩のキャスト
          const candidateCasts = casts.filter(
            (c) => c.active && !c.onBreak && !selectedTable.assignedCasts.includes(c.name),
          )
          // 他卓対応中のマップ
          const castTableMap = new Map<string, typeof selectedTable>()
          for (const t of tables) {
            if (t.id === selectedTable.id) continue
            for (const n of t.assignedCasts) castTableMap.set(n, t)
          }
          return (
            <div className="space-y-2">
              {candidateCasts.length === 0 && (
                <div className="text-center text-gray-500 py-6 text-sm">追加可能なキャストがいません</div>
              )}
              {candidateCasts.map((c) => {
                const busyAt = castTableMap.get(c.name)
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      moveCast(c.name, selectedTable.id)
                      setShowAddCast(false)
                    }}
                    className="w-full panel p-3 flex items-center justify-between hover:bg-white/10 transition-colors text-left"
                  >
                    <div>
                      <div className="font-bold">{c.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {busyAt ? `現在: 卓 ${busyAt.number} 対応中 (移動すると元の卓から外れます)` : '待機中'}
                      </div>
                    </div>
                    <Plus size={18} className="text-gold" />
                  </button>
                )
              })}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
