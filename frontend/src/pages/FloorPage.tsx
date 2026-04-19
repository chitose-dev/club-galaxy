import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  nominationLabels,
  EXTENSION_OPTIONS,
  SET_DURATION_MINUTES,
  chargeItems,
  displayOrderName,
  EXTENSION_CHARGES,
} from '../data/mock'
import { Clock, Users, Plus, Printer, RotateCcw, ChevronRight, X, FileText, CreditCard, Undo2 } from 'lucide-react'
import { openPrintWindow } from '../utils/print'

const statusStyle: Record<TableStatus, { border: string; bg: string; badge: string }> = {
  empty: { border: 'border-gray-700', bg: 'bg-white/[0.02]', badge: 'bg-gray-700 text-gray-400' },
  occupied: { border: 'border-[#d4af37]/60', bg: 'bg-[#d4af37]/[0.04]', badge: 'bg-[#d4af37]/20 text-white' },
  ending: { border: 'border-amber-500/60', bg: 'bg-amber-500/[0.06]', badge: 'bg-amber-500/20 text-amber-300' },
  alert: { border: 'border-red-500/60', bg: 'bg-red-500/[0.06]', badge: 'bg-red-500/20 text-red-300' },
}

const statusLabel: Record<TableStatus, string> = {
  empty: '空き',
  occupied: '使用中',
  ending: '終了間近',
  alert: '50分経過',
}

const statusDot: Record<TableStatus, string> = {
  empty: 'bg-gray-500',
  occupied: 'bg-white',
  ending: 'bg-amber-400',
  alert: 'bg-red-400',
}

const defaultStartTime = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function calcRemainingMinutes(startTime: string, setCount: number, timeAdjustment: number = 0, extensionMinutes: number = 0): number {
  const [h, m] = startTime.split(':').map(Number)
  const now = new Date()
  const startDate = new Date()
  startDate.setHours(h, m, 0, 0)
  if (startDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    startDate.setDate(startDate.getDate() - 1)
  }
  const totalSetMinutes = setCount * SET_DURATION_MINUTES + extensionMinutes
  const endTime = new Date(startDate.getTime() + totalSetMinutes * 60 * 1000)
  return Math.ceil((endTime.getTime() - now.getTime()) / (60 * 1000)) + timeAdjustment
}

function totalExtensionMinutes(t: { extensionHistory?: { minutes: 30 | 60 }[] }): number {
  return (t.extensionHistory ?? []).reduce((s, e) => s + e.minutes, 0)
}

function calcElapsedMinutes(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number)
  const now = new Date()
  const startDate = new Date()
  startDate.setHours(h, m, 0, 0)
  if (startDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    startDate.setDate(startDate.getDate() - 1)
  }
  return Math.floor((now.getTime() - startDate.getTime()) / (60 * 1000))
}

function flColor(rate: number) {
  if (rate <= 60) return 'text-emerald-400'
  if (rate <= 70) return 'text-amber-400'
  return 'text-red-400'
}

export default function FloorPage() {
  const { tables, casts, setCasts, updateTable, bottleKeeps, flMetrics, storeSettings } = useStore()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Table | null>(null)

  const [showCheckIn, setShowCheckIn] = useState(false)
  const [ciTime, setCiTime] = useState(defaultStartTime)
  const [ciGuests, setCiGuests] = useState(1)
  const [ciCastNames, setCiCastNames] = useState<string[]>([])
  const [ciNomination, setCiNomination] = useState<Table['nomination']>('free')

  const [showExtend, setShowExtend] = useState(false)
  const [showRotation, setShowRotation] = useState(false)
  const [, setTick] = useState(0)

  const activeCasts = casts.filter((c) => c.active)

  const checkStatuses = useCallback(() => {
    for (const table of tables) {
      if (table.status === 'empty' || !table.startTime) continue
      const remaining = calcRemainingMinutes(table.startTime, table.setCount, table.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(table))
      const elapsed = calcElapsedMinutes(table.startTime)

      if (remaining <= 5 && table.status !== 'ending') {
        updateTable(table.id, { status: 'ending' })
      } else if (elapsed >= 50 && remaining > 5 && table.status !== 'alert') {
        updateTable(table.id, { status: 'alert' })
      }
    }
  }, [tables, updateTable])

  useEffect(() => {
    checkStatuses()
    const id = setInterval(() => {
      setTick((t) => t + 1)
      checkStatuses()
    }, 60_000)
    return () => clearInterval(id)
  }, [checkStatuses])

  const openCheckIn = (table: Table) => {
    setSelected(table)
    setCiTime(defaultStartTime())
    setCiGuests(1)
    setCiCastNames([])
    setCiNomination('free')
    setShowCheckIn(true)
  }

  const toggleCast = (name: string) => {
    setCiCastNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const confirmCheckIn = () => {
    if (!selected) return
    const assignedNames = ciCastNames.length > 0 ? ciCastNames : [activeCasts[0]?.name ?? '']
    const autoOrders: Table['orders'] = []

    // 指示書§1.2: シングルチャージは 1 名様のみ自動付与
    if (ciGuests === 1) {
      const singleChargeItem = chargeItems.find((c) => c.id === 'single-charge')
      if (singleChargeItem) {
        autoOrders.push({
          menuItem: {
            id: 900, name: 'シングルチャージ', price: singleChargeItem.price,
            cost: singleChargeItem.cost ?? 300, castBack: 0,
            category: 'guest' as const, subcategory: 'warimono' as const,
          },
          quantity: 1,
        })
      }
    }

    // 指示書§2.3: 指名タイプに応じて担当キャスト名付きで自動追加
    if (ciNomination && ciNomination !== 'free') {
      const chargeId = ciNomination === 'shimei' ? 'shimei' : ciNomination === 'banai' ? 'banai' : 'douhan'
      const chargeItem = chargeItems.find((c) => c.id === chargeId)
      if (chargeItem) {
        for (const name of assignedNames) {
          if (!name) continue
          autoOrders.push({
            menuItem: {
              id: 901 + autoOrders.length,
              name: chargeItem.label, price: chargeItem.price,
              cost: chargeItem.cost ?? 300, castBack: 0,
              category: 'guest' as const, subcategory: 'warimono' as const,
            },
            quantity: 1,
            castName: name,
          })
        }
      }
    }

    updateTable(selected.id, {
      status: 'occupied',
      guestCount: ciGuests,
      startTime: ciTime,
      castNames: assignedNames,
      nomination: ciNomination,
      setCount: 1,
      orders: autoOrders,
      setDiscountPerSet: 0,
      timeAdjustmentMinutes: 0,
      extensionHistory: [],
    })
    const now = new Date().toISOString()
    setCasts((prev) => prev.map((c) => assignedNames.includes(c.name) ? { ...c, lastAssignedAt: now } : c))
    setShowCheckIn(false)
    setSelected(null)
  }

  // 延長確認ダイアログ用 (指示書§6.2.3: 確認ダイアログ必須 + 指名選択 G-9)
  const [pendingExtend, setPendingExtend] = useState<{ minutes: 30 | 60; castName?: string } | null>(null)

  const requestExtend = (minutes: 30 | 60) => {
    if (!selected) return
    // デフォルト指名キャスト: 卓の担当先頭
    setPendingExtend({ minutes, castName: selected.castNames[0] })
  }

  const confirmExtend = () => {
    if (!selected || !pendingExtend) return
    const { minutes, castName } = pendingExtend
    const charge = EXTENSION_CHARGES[minutes]
    const entryId = Date.now()
    const orderId = 2000 + entryId  // 延長料金は注文IDの2000番台
    const newEntry = {
      id: entryId,
      minutes,
      timestamp: new Date().toISOString(),
      nominatedCastName: castName,
      orderMenuItemId: orderId,
    } as const
    // 延長料金を注文に追加 (指示書§G-4/G-5: 固定額 1000円/3000円)
    const extensionOrder = {
      menuItem: {
        id: orderId,
        name: `延長 +${minutes}分`,
        price: charge,
        cost: 0,
        castBack: 0,
        category: 'guest' as const,
        subcategory: 'warimono' as const,
      },
      quantity: 1,
      castName,  // 指名キャスト帰属
    }
    updateTable(selected.id, {
      // setCount は変えない。時間は extensionHistory で管理
      status: 'occupied',
      extensionHistory: [...(selected.extensionHistory ?? []), newEntry],
      orders: [...selected.orders, extensionOrder],
    })
    setPendingExtend(null)
    setShowExtend(false)
    setSelected(null)
  }

  // 延長取消 (指示書§6.2.4)
  const handleUndoExtension = (entryId: number) => {
    if (!selected) return
    const entry = selected.extensionHistory?.find((e) => e.id === entryId)
    if (!entry) return
    updateTable(selected.id, {
      extensionHistory: (selected.extensionHistory ?? []).filter((e) => e.id !== entryId),
      // 対応する延長料金注文も削除
      orders: selected.orders.filter((o) => o.menuItem.id !== entry.orderMenuItemId),
    })
  }

  // 微調整 ±10分 (指示書§6.2.2: 残り時間補正、setCountには影響しない)
  const handleTimeAdjust = (delta: number) => {
    if (!selected) return
    updateTable(selected.id, {
      timeAdjustmentMinutes: (selected.timeAdjustmentMinutes ?? 0) + delta,
    })
  }

  const handlePrintCheckTicket = (table: Table) => {
    const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
    const discountPerSet = table.setDiscountPerSet ?? 0
    const adjustedSetPrice = Math.max(0, setPrice - discountPerSet)
    const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)

    const body = `
      <div class="header">${storeSettings.storeName} チェック票</div>
      <div class="divider"></div>
      <div class="row"><span>卓:</span><span>${table.number}</span></div>
      <div class="row"><span>担当:</span><span>${table.castNames.join(', ')}</span></div>
      <div class="row"><span>入店:</span><span>${table.startTime}</span></div>
      <div class="row"><span>人数:</span><span>${table.guestCount}名</span></div>
      <div class="divider"></div>
      <div class="row"><span>セット料金:</span><span>&yen;${(adjustedSetPrice * table.guestCount * table.setCount).toLocaleString()}${discountPerSet > 0 ? ` <small>(値引-&yen;${discountPerSet.toLocaleString()}/セット)</small>` : ''}</span></div>
      ${table.orders.map(o => `<div class="row"><span>${displayOrderName(o)} x${o.quantity}</span><span>${o.menuItem.price === 0 ? 'セット内' : '&yen;' + (o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
      <div class="divider"></div>
      <div class="row total"><span>ドリンク小計:</span><span>&yen;${drinkTotal.toLocaleString()}</span></div>
      <div class="footer">※中間確認用 - 正式な領収書ではありません</div>
    `
    const extraStyles = `
      body { max-width: 300px; margin: 0 auto; }
      .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
      .row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; border: none; padding: 0; text-align: left; }
      .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
      .total { font-size: 16px; font-weight: bold; }
      .footer { text-align: center; font-size: 11px; color: #999; margin-top: 12px; }
    `
    openPrintWindow(body, 'チェック票', { width: 350, height: 500, extraStyles })
  }

  // 50分経過で未印字のチェック票対象卓
  const pendingCheckTickets = tables.filter(
    (t) => t.status !== 'empty' && t.startTime && calcElapsedMinutes(t.startTime) >= 50 && !t.checkTicketPrintedAt,
  )

  const handlePrintPendingChecks = () => {
    const now = new Date().toISOString()
    for (const t of pendingCheckTickets) {
      handlePrintCheckTicket(t)
      updateTable(t.id, { checkTicketPrintedAt: now })
    }
  }

  const busyCastNames = new Set(tables.filter((t) => t.status !== 'empty').flatMap((t) => t.castNames))
  // 待機時間順(lastAssignedAt昇順、null=最優先)にソート
  const freeCasts = activeCasts
    .filter((c) => !busyCastNames.has(c.name))
    .slice()
    .sort((a, b) => {
      if (!a.lastAssignedAt && !b.lastAssignedAt) return 0
      if (!a.lastAssignedAt) return -1
      if (!b.lastAssignedAt) return 1
      return a.lastAssignedAt.localeCompare(b.lastAssignedAt)
    })

  const formatWaitTime = (lastAssignedAt: string | null | undefined): string => {
    if (!lastAssignedAt) return '未稼働'
    const diffMs = Date.now() - new Date(lastAssignedAt).getTime()
    const minutes = Math.max(0, Math.floor(diffMs / 60000))
    if (minutes < 60) return `待機 ${minutes}分`
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    return `待機 ${hours}時間${rem}分`
  }

  const handleAssignCast = (castName: string) => {
    if (!selected) return
    updateTable(selected.id, {
      castNames: [...selected.castNames, castName],
    })
    const now = new Date().toISOString()
    setCasts((prev) => prev.map((c) => c.name === castName ? { ...c, lastAssignedAt: now } : c))
    setShowRotation(false)
    setSelected(null)
  }

  return (
    <div className="p-4">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        {(Object.keys(statusDot) as TableStatus[]).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusDot[key]} inline-block`} />
            <span className="text-gray-400">{statusLabel[key]}</span>
          </span>
        ))}
      </div>

      {/* Pending Check Ticket Badge */}
      {pendingCheckTickets.length > 0 && (
        <button
          onClick={handlePrintPendingChecks}
          className="w-full flex items-center justify-between bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 mb-3 text-sm font-bold text-red-300 active:scale-[0.98] transition-all"
        >
          <span className="flex items-center gap-2">
            <Printer size={16} />
            中間チェック票 {pendingCheckTickets.length}件 (50分経過)
          </span>
          <span className="text-xs text-red-300/80">
            卓 {pendingCheckTickets.map((t) => t.number).join(', ')} → タップで一括印字
          </span>
        </button>
      )}

      {/* Profit Widget */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5 mb-4 text-sm tabular-nums">
        <span>本日 <span className="font-bold">¥{flMetrics.todayProfit.toLocaleString()}</span> <span className={`text-xs ${flColor(flMetrics.flRate)}`}>(FL {flMetrics.flRate.toFixed(1)}%)</span></span>
        <span>今月 <span className="font-bold">¥{flMetrics.monthlyProfit.toLocaleString()}</span> <span className={`text-xs ${flColor(flMetrics.monthlyFlRate)}`}>(FL {flMetrics.monthlyFlRate.toFixed(1)}%)</span></span>
      </div>

      {/* Table Grid (要件定義書4A: 終了間近を左上優先) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...tables].sort((a, b) => {
          // 空き卓は末尾
          if (a.status === 'empty' && b.status !== 'empty') return 1
          if (a.status !== 'empty' && b.status === 'empty') return -1
          if (a.status === 'empty' && b.status === 'empty') return a.id - b.id
          // 使用中卓は残り時間昇順(終了間近を左上)
          const remA = a.startTime ? calcRemainingMinutes(a.startTime, a.setCount, a.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(a)) : Infinity
          const remB = b.startTime ? calcRemainingMinutes(b.startTime, b.setCount, b.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(b)) : Infinity
          if (remA !== remB) return remA - remB
          return a.id - b.id
        }).map((table) => {
          const remaining = table.startTime ? calcRemainingMinutes(table.startTime, table.setCount, table.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(table)) : null
          const elapsed = table.startTime ? calcElapsedMinutes(table.startTime) : 0
          const style = statusStyle[table.status]
          return (
            <button
              key={table.id}
              onClick={() => {
                if (table.status === 'empty') {
                  openCheckIn(table)
                } else {
                  setSelected(table)
                }
              }}
              className={`${style.bg} ${style.border} border rounded-lg p-4 text-left transition-all active:scale-[0.97]`}
            >
              <div className="flex justify-between items-start">
                <span className="text-xl font-bold tracking-wide">{table.number}</span>
                {table.status === 'empty' ? (
                  <span className="text-gray-600"><Plus size={16} /></span>
                ) : remaining !== null ? (
                  <span className={`text-xs font-bold tabular-nums ${remaining <= 5 ? 'text-red-400' : remaining <= 10 ? 'text-amber-300' : 'text-white'}`}>
                    {remaining > 0 ? `${remaining}m` : 'END'}
                  </span>
                ) : null}
              </div>
              {table.status !== 'empty' && (
                <div className="mt-2.5 space-y-1">
                  <div className="text-sm font-medium truncate">{table.castNames.join(', ')}</div>
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <Users size={11} />
                    <span>{table.guestCount}名</span>
                    <span className="text-gray-600">|</span>
                    <Clock size={11} />
                    <span>{table.startTime}〜</span>
                  </div>
                  {table.nomination && (
                    <span className="inline-block text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded mt-0.5">
                      {nominationLabels[table.nomination]}
                    </span>
                  )}
                  {elapsed >= 50 && (
                    <div className="text-xs text-red-400 font-bold mt-0.5">50分経過</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Detail Modal for occupied tables */}
      {selected && !showCheckIn && !showExtend && !showRotation && selected.status !== 'empty' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-[#1a1a2e] rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold tracking-wide">卓 {selected.number}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {selected.startTime && (() => {
              const rem = calcRemainingMinutes(selected.startTime, selected.setCount, selected.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(selected))
              return (
                <div className={`text-center py-3 rounded-lg mb-4 font-bold text-lg ${rem <= 5 ? 'bg-red-500/10 text-red-300 border border-red-500/30' : rem <= 10 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-white/10 text-white border border-white/20'}`}>
                  残り {rem > 0 ? `${rem}分` : '終了'}
                </div>
              )
            })()}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">担当</div>
                <div className="font-medium">{selected.castNames.join(', ')}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">指名タイプ</div>
                <div className="font-medium">{selected.nomination ? nominationLabels[selected.nomination] : '-'}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">入店時刻</div>
                <div className="font-medium">{selected.startTime}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">人数</div>
                <div className="font-medium">{selected.guestCount}名</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">セット料金</div>
                <div className="font-medium">
                  {selected.startTime ? `¥${Math.max(0, getSetPriceForTime(selected.startTime) - (selected.setDiscountPerSet ?? 0)).toLocaleString()}` : '-'}
                  {(selected.setDiscountPerSet ?? 0) > 0 && (
                    <span className="text-[10px] text-amber-300 ml-1">(値引¥{selected.setDiscountPerSet!.toLocaleString()})</span>
                  )}
                </div>
                <div className="text-gray-600 text-xs">{selected.startTime ? getSetPriceLabel(selected.startTime) : ''}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">セット数</div>
                <div className="font-medium">{selected.setCount}</div>
              </div>
            </div>
            {/* セット料金値引き (指示書§1.1) */}
            <div className="mt-3 bg-white/5 rounded-lg p-3">
              <label className="text-xs text-gray-500 block mb-1.5">セット料金値引き (1セットあたりの割引額)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={selected.setDiscountPerSet ?? 0}
                  onChange={(e) => updateTable(selected.id, { setDiscountPerSet: Math.max(0, Number(e.target.value)) })}
                  min={0}
                  step={100}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  placeholder="0"
                />
                <span className="text-xs text-gray-500">円 / セット</span>
              </div>
            </div>

            {/* Bottle keeps */}
            {(() => {
              const keeps = bottleKeeps.filter((b) => b.tableNumber === selected.number)
              if (keeps.length === 0) return null
              return (
                <div className="mt-4 bg-amber-900/10 border border-amber-700/30 rounded-lg p-3">
                  <div className="text-xs text-amber-400 font-bold mb-2">キープボトル</div>
                  {keeps.map((k) => (
                    <div key={k.id} className="flex justify-between text-sm mb-1">
                      <span>{k.bottleName} ({k.customerName})</span>
                      <span className={k.remaining <= 20 ? 'text-red-400 font-bold' : ''}>{k.remaining}%</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {selected.orders.length > 0 && (
              <div className="mt-4 bg-white/5 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-2">注文 ({selected.orders.length}品)</div>
                {selected.orders.slice(0, 5).map((o) => (
                  <div key={o.menuItem.id} className="flex justify-between text-sm py-0.5">
                    <span className="text-gray-300">{o.menuItem.name} x{o.quantity}</span>
                    <span>¥{(o.menuItem.price * o.quantity).toLocaleString()}</span>
                  </div>
                ))}
                {selected.orders.length > 5 && (
                  <div className="text-xs text-gray-600 mt-1">...他{selected.orders.length - 5}品</div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              {EXTENSION_OPTIONS.map((min) => (
                <button key={min} onClick={() => requestExtend(min as 30 | 60)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-sm transition-colors">
                  延長 +{min}分
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2 items-center text-xs">
              <span className="text-gray-500">残り時間微調整:</span>
              <button onClick={() => handleTimeAdjust(-10)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg font-bold">-10分</button>
              <button onClick={() => handleTimeAdjust(+10)} className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg font-bold">+10分</button>
              {(selected.timeAdjustmentMinutes ?? 0) !== 0 && (
                <button onClick={() => updateTable(selected.id, { timeAdjustmentMinutes: 0 })} className="text-gray-500 underline">リセット({selected.timeAdjustmentMinutes! > 0 ? '+' : ''}{selected.timeAdjustmentMinutes}分)</button>
              )}
            </div>
            {selected.extensionHistory && selected.extensionHistory.length > 0 && (
              <div className="mt-2 bg-white/5 rounded-lg p-2">
                <div className="text-xs text-gray-500 mb-1">延長履歴</div>
                {selected.extensionHistory.map((ex) => (
                  <div key={ex.id} className="flex justify-between items-center text-xs py-0.5">
                    <span className="text-gray-400">+{ex.minutes}分 ({new Date(ex.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})</span>
                    <button onClick={() => handleUndoExtension(ex.id)} className="text-red-400 flex items-center gap-1"><Undo2 size={10} /> 取消</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={() => { setSelected(null); navigate(`/order?table=${selected.id}`) }} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 transition-colors">
                <FileText size={15} /> 注文
              </button>
              <button onClick={() => { setSelected(null); navigate(`/billing?table=${selected.id}`) }} className="flex-1 bg-white text-black py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5">
                <CreditCard size={15} /> 会計
              </button>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  handlePrintCheckTicket(selected)
                  updateTable(selected.id, { checkTicketPrintedAt: new Date().toISOString() })
                }}
                className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
                  selected.startTime && calcElapsedMinutes(selected.startTime) >= 50
                    ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                    : 'bg-white/5 border border-white/10 text-gray-400'
                }`}
              >
                <Printer size={15} /> チェック票
              </button>
              <button onClick={() => setShowRotation(true)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 text-gray-300 transition-colors">
                <RotateCcw size={15} /> 付け回し
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Modal */}
      {showCheckIn && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50" onClick={() => { setShowCheckIn(false); setSelected(null) }}>
          <div className="bg-[#1a1a2e] rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold tracking-wide">卓 {selected.number} 入店</h2>
              <button onClick={() => { setShowCheckIn(false); setSelected(null) }} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">セット開始時刻</label>
                <div className="flex gap-2">
                  <input type="time" value={ciTime} onChange={(e) => setCiTime(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm" />
                  <button onClick={() => setCiTime(defaultStartTime())} className="bg-white/10 border border-white/10 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap">今すぐ</button>
                </div>
                <div className="text-xs text-gray-500 mt-1.5">
                  セット料金: ¥{getSetPriceForTime(ciTime).toLocaleString()} ({getSetPriceLabel(ciTime)})
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">来店人数</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button key={n} onClick={() => setCiGuests(n)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${ciGuests === n ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">キャスト（複数選択可）</label>
                <div className="flex flex-wrap gap-2">
                  {activeCasts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleCast(c.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                        ciCastNames.includes(c.name)
                          ? 'bg-white text-black'
                          : 'bg-white/5 border border-white/10 text-gray-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {ciCastNames.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1.5">選択中: {ciCastNames.join(', ')}</div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">指名タイプ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['free', 'shimei', 'banai', 'douhan'] as const).map((type) => (
                    <button key={type} onClick={() => setCiNomination(type)} className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${ciNomination === type ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                      {nominationLabels[type]}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={confirmCheckIn} className="w-full bg-white text-black py-3.5 rounded-lg font-bold text-lg mt-2 flex items-center justify-center gap-2">
                入店開始 <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {showExtend && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setShowExtend(false); setSelected(null) }}>
          <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">卓 {selected.number} 延長</h2>
            <p className="text-sm text-gray-400 mb-4">現在: {selected.setCount}セット</p>
            <div className="space-y-3">
              {EXTENSION_OPTIONS.map((min) => (
                <button key={min} onClick={() => requestExtend(min as 30 | 60)} className="w-full bg-white/5 border border-white/10 py-3 rounded-lg font-bold transition-colors">+{min}分延長</button>
              ))}
            </div>
            <button onClick={() => { setShowExtend(false); setSelected(null) }} className="w-full mt-3 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
          </div>
        </div>
      )}

      {/* Rotation Modal */}
      {showRotation && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setShowRotation(false); setSelected(null) }}>
          <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">付け回し - 卓 {selected.number}</h2>
            <p className="text-sm text-gray-500 mb-4">空いているキャストを選択してください</p>
            {freeCasts.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">現在空いているキャストはいません</p>
            ) : (
              <div className="space-y-2">
                {freeCasts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAssignCast(c.name)}
                    className="w-full bg-white/5 rounded-lg p-3 text-left transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500">→ 卓{selected.number} に付け回し</div>
                    </div>
                    <div className="text-xs text-emerald-400/80 tabular-nums">{formatWaitTime(c.lastAssignedAt)}</div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { setShowRotation(false); setSelected(null) }} className="w-full mt-4 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
          </div>
        </div>
      )}

      {/* 延長確認ダイアログ (指示書§6.2.3 + §G-9 指名選択) */}
      {pendingExtend && selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setPendingExtend(null)}>
          <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">延長の確認</h2>
            <div className="bg-white/5 rounded-lg p-3 mb-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">延長時間</span>
                <span className="font-bold">+{pendingExtend.minutes}分</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">延長料金</span>
                <span className="font-bold text-[#d4af37] tabular-nums">¥{EXTENSION_CHARGES[pendingExtend.minutes].toLocaleString()}</span>
              </div>
            </div>
            {/* 指名選択 (G-9) */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">指名(バック帰属先・任意)</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setPendingExtend({ ...pendingExtend, castName: undefined })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!pendingExtend.castName ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'}`}
                >
                  フリー
                </button>
                {selected.castNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setPendingExtend({ ...pendingExtend, castName: name })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${pendingExtend.castName === name ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">延長してよろしいですか?</p>
            <div className="flex gap-2">
              <button onClick={() => setPendingExtend(null)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">
                キャンセル
              </button>
              <button onClick={confirmExtend} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold">
                延長する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
