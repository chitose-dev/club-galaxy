import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { MenuItem, CastMenuItem, OrderItem } from '../data/mock'
import { displayOrderName, chargeItems } from '../data/mock'
import { Minus, Plus, Trash2, Wine, CreditCard, Printer, Gift } from 'lucide-react'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import CastChip from '../components/CastChip'
import Modal from '../components/Modal'
import { Input, Field as FormField } from '../components/Input'
import { GoldButton, DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import { openPrintWindow } from '../utils/print'

const HELP_BACK_ITEM: CastMenuItem = {
  id: 999,
  name: 'ヘルプ',
  price: 0,
  cost: 0,
  castBack: 0,
  category: 'cast',
  subcategory: 'fdrink',
  backType: 'ヘルプ',
}

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
  | 'bottle'

const categories: Array<{ key: CategoryKey; label: string }> = [
  { key: 'all', label: '全ての商品' },
  { key: 'cast-drink', label: 'キャストドリンク' },
  { key: 'shot-pitcher', label: '単品ドリンク' },
  { key: 'champagne', label: 'シャンパン' },
  { key: 'whisky', label: 'ウイスキー' },
  { key: 'shochu', label: '焼酎' },
  { key: 'brandy', label: 'ブランデー' },
  { key: 'wine', label: 'ワイン' },
  { key: 'charge', label: '指名料・同伴' },
  { key: 'bottle', label: 'ボトルキープ' },
]

/**
 * TRUST 準拠の 4 カラム注文画面。
 * [カテゴリー | メニュー | 誰に | 注文明細]
 */
export default function OrderPage() {
  const {
    tables, casts, guestMenu, castMenu, storeSettings,
    addOrderToTable, removeOrderFromTable, setOrderBonus,
    moveCast,
    bottleKeeps, addBottleKeep, updateBottleKeep, removeBottleKeep,
  } = useStore()
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
  const [selectedCastName, setSelectedCastName] = useState<string | null>(null)
  // 追補03 R17: 「お客さま/スタッフ」トグルは廃止 (仕様未定の dead UI だったため削除)

  const [showAddBottle, setShowAddBottle] = useState(false)
  const [bottleName, setBottleName] = useState('')
  const [bottleRemaining, setBottleRemaining] = useState(100)
  const [bottleStorage, setBottleStorage] = useState('')
  const [bottleCustomer, setBottleCustomer] = useState('')

  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const orders = selectedTable?.orders ?? []

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

  const handleAdd = (item: MenuItem) => {
    if (!selectedTableId || !selectedTable) return
    // cast メニューはキャスト紐付け必須
    if (item.category === 'cast') {
      if (!selectedCastName) {
        alert('キャストドリンクはキャストを選択してから追加してください')
        return
      }
      addOrderToTable(selectedTableId, { menuItem: item, quantity: 1, castName: selectedCastName })
      return
    }
    // 先方フィードバック (2026-04-23): guest メニューは以下のロジックで売上帰属を決定
    //   1. キャスト明示選択 → そのキャストの売上 (最優先)
    //   2. 指名なし + 本指名卓 → 本指名担当の売上 (自動帰属)
    //   3. 指名なし + フリー卓 → 店舗売上のみ (キャスト紐付けなし)
    // ※ ゲストドリンク (ショット・ピッチャー・ビール等) はバック無し。売上帰属のみ変動。
    // 追補03 R24: 複数本指名の場合、指名なしゲストドリンクは先頭 1 名に帰属
    const castName = selectedCastName ?? selectedTable.mainNominationCastNames[0]
    addOrderToTable(selectedTableId, {
      menuItem: item,
      quantity: 1,
      castName: castName || undefined,
    })
  }

  const handleAddCharge = (charge: { id: string; label: string; price: number; cost: number }) => {
    if (!selectedTableId || !selectedTable) return
    if (!selectedCastName) {
      alert('指名料はキャストを選択してから追加してください')
      return
    }
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
      castName: selectedCastName,
    }
    addOrderToTable(selectedTableId, order)
  }

  const handleAddHelp = () => {
    if (!selectedTableId) return
    if (!selectedCastName) {
      alert('ヘルプバックはキャストを選択してから追加してください')
      return
    }
    addOrderToTable(selectedTableId, { menuItem: HELP_BACK_ITEM, quantity: 1, castName: selectedCastName })
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

  const handleAddBottleKeep = () => {
    if (!bottleName || !bottleCustomer) return
    addBottleKeep({
      id: Date.now(),
      bottleName,
      remaining: bottleRemaining,
      storageLocation: bottleStorage,
      customerName: bottleCustomer,
      tableNumber: selectedTable?.number,
      createdAt: new Date().toISOString().slice(0, 10),
    })
    setBottleName('')
    setBottleRemaining(100)
    setBottleStorage('')
    setBottleCustomer('')
    setShowAddBottle(false)
  }

  const handlePrintOrder = () => {
    if (!selectedTable || orders.length === 0) return
    const body = `
      <div class="header">${storeSettings.storeName} 注文票</div>
      <div class="row"><span>卓:</span><span>${selectedTable.number}</span></div>
      <div class="row"><span>時刻:</span><span>${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="divider"></div>
      ${orders.map((o) => `<div class="row"><span>${displayOrderName(o)} x${o.quantity}</span><span>&yen;${(o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
      <div class="divider"></div>
      <div class="row total"><span>小計:</span><span>&yen;${subtotal.toLocaleString()}</span></div>
    `
    const extraStyles = `
      body { max-width: 300px; margin: 0 auto; }
      .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
      .row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
      .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
      .total { font-size: 16px; font-weight: bold; }
    `
    openPrintWindow(body, '注文票', { width: 350, height: 500, extraStyles })
  }

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
            onChange={(e) => setSelectedTableId(Number(e.target.value))}
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
        {/* ── Column 1: カテゴリー ── */}
        <div className="border-r border-white/10 overflow-y-auto bg-primary-dark">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-white/5 transition-colors ${
                activeCategory === cat.key
                  ? 'bg-gold/15 text-gold font-bold'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
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
          ) : activeCategory === 'bottle' ? (
            <BottleSection
              bottleKeeps={bottleKeeps}
              selectedTable={selectedTable}
              onOpenAdd={() => setShowAddBottle(true)}
              onUpdate={updateBottleKeep}
              onRemove={removeBottleKeep}
            />
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
        <div className="overflow-y-auto p-3 border-r border-white/10 bg-primary-dark">
          <div className="text-[10px] text-gray-500 mb-2 tracking-wider">キャスト選択</div>
          <div className="grid grid-cols-1 gap-1.5">
            <CastChip
              name="指名なし"
              selected={selectedCastName === null}
              onClick={() => setSelectedCastName(null)}
            />
            {selectedTable.assignedCasts.map((name: string) => (
              <CastChip
                key={name}
                name={name}
                selected={selectedCastName === name}
                onClick={() => setSelectedCastName(name)}
              />
            ))}
          </div>

          {/* 追補02 R2-1: 「女の子を追加」で他卓キャストをこの卓に移動 (排他移動) */}
          <button
            onClick={() => setShowAddCast(true)}
            className="mt-2 w-full btn-ghost text-xs py-1.5 flex items-center justify-center gap-1"
          >
            <Plus size={12} /> 女の子を追加
          </button>

          <div className="mt-3 text-[10px] text-gray-500 leading-relaxed">
            選択したキャストにバック・売上が帰属します。
            <br />本指名卓では「指名なし」でも本指名担当に自動計上されます。
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

          {/* subtotal inside column 4 */}
          <div className="mt-3 panel-gold p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300">セット料金</span>
              <span className="tabular-nums">¥{setSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-300">注文小計</span>
              <span className="tabular-nums">¥{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-gold/30">
              <span className="text-sm font-bold text-gold">総合計 (税込)</span>
              <span className="tabular-nums font-bold text-gold">¥{grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <BottomActionBar
        leftLabel="注文小計"
        leftValue={`¥${subtotal.toLocaleString()}`}
        center={
          <DangerButton
            onClick={() => navigate(`/table/${selectedTable.id}`)}
            className="text-base px-6 flex items-center gap-2"
          >
            <CreditCard size={18} /> 利用明細へ
          </DangerButton>
        }
        right={
          <DarkButton onClick={handlePrintOrder} disabled={orders.length === 0} className="text-sm flex items-center gap-1">
            <Printer size={15} /> 注文印刷
          </DarkButton>
        }
      />

      {showAddBottle && (
        <AddBottleModal
          bottleName={bottleName} setBottleName={setBottleName}
          bottleRemaining={bottleRemaining} setBottleRemaining={setBottleRemaining}
          bottleStorage={bottleStorage} setBottleStorage={setBottleStorage}
          bottleCustomer={bottleCustomer} setBottleCustomer={setBottleCustomer}
          onClose={() => setShowAddBottle(false)}
          onSave={handleAddBottleKeep}
        />
      )}

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

function BottleSection({
  bottleKeeps, selectedTable, onOpenAdd, onUpdate, onRemove,
}: {
  bottleKeeps: ReturnType<typeof useStore>['bottleKeeps']
  selectedTable: { number: string } | null
  onOpenAdd: () => void
  onUpdate: (id: number, patch: Partial<{ remaining: number }>) => void
  onRemove: (id: number) => void
}) {
  const sorted = [...bottleKeeps].sort((a, b) => a.remaining - b.remaining)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 tracking-wider">ボトルキープ一覧</span>
        <GoldButton onClick={onOpenAdd} className="text-xs px-3 py-1.5">
          <Plus size={12} className="inline mr-1" /> キープ登録
        </GoldButton>
      </div>
      <div className="space-y-2">
        {sorted.map((b) => (
          <div
            key={b.id}
            className={`panel p-3 ${b.remaining <= 20 ? 'border-red-500/40' : ''}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{b.bottleName}</div>
                <div className="text-xs text-gray-400">{b.customerName} / {b.storageLocation || '場所未設定'}</div>
                {b.tableNumber && <div className="text-[10px] text-gray-500">卓: {b.tableNumber}{selectedTable?.number === b.tableNumber ? ' (本卓)' : ''}</div>}
              </div>
              <span
                className={`text-sm font-bold tabular-nums shrink-0 ml-2 ${
                  b.remaining <= 20 ? 'text-red-400' : b.remaining <= 50 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {b.remaining}%
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 mb-2">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  b.remaining <= 20 ? 'bg-red-500' : b.remaining <= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${b.remaining}%` }}
              />
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="range"
                min="0"
                max="100"
                value={b.remaining}
                onChange={(e) => onUpdate(b.id, { remaining: Number(e.target.value) })}
                className="flex-1"
              />
              <button onClick={() => onRemove(b.id)} className="text-xs bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-red-400">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-center text-gray-600 mt-12">
            <Wine size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">ボトルキープはありません</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AddBottleModal({
  bottleName, setBottleName, bottleRemaining, setBottleRemaining, bottleStorage, setBottleStorage,
  bottleCustomer, setBottleCustomer, onClose, onSave,
}: {
  bottleName: string; setBottleName: (v: string) => void
  bottleRemaining: number; setBottleRemaining: (v: number) => void
  bottleStorage: string; setBottleStorage: (v: string) => void
  bottleCustomer: string; setBottleCustomer: (v: string) => void
  onClose: () => void; onSave: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="ボトルキープ登録"
      footer={
        <>
          <GhostButton onClick={onClose} className="flex-1">キャンセル</GhostButton>
          <GoldButton onClick={onSave} disabled={!bottleName || !bottleCustomer} className="flex-1">登録</GoldButton>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="ボトル名">
          <Input type="text" value={bottleName} onChange={(e) => setBottleName(e.target.value)} placeholder="例: 響 17年" />
        </FormField>
        <FormField label={`残量: ${bottleRemaining}%`}>
          <input type="range" min="0" max="100" value={bottleRemaining} onChange={(e) => setBottleRemaining(Number(e.target.value))} className="w-full" />
        </FormField>
        <FormField label="保管場所">
          <Input type="text" value={bottleStorage} onChange={(e) => setBottleStorage(e.target.value)} placeholder="例: A-3" />
        </FormField>
        <FormField label="担当客名">
          <Input type="text" value={bottleCustomer} onChange={(e) => setBottleCustomer(e.target.value)} placeholder="例: 田中様" />
        </FormField>
      </div>
    </Modal>
  )
}
