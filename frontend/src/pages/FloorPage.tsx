import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  EXTENSION_OPTIONS,
  SET_DURATION_MINUTES,
  chargeItems,
  displayOrderName,
  EXTENSION_CHARGES,
} from '../data/mock'
import { getNominationBadge, getNominationLabel } from '../utils/nomination'
import { Clock, Users, Plus, Printer, RotateCcw, ChevronRight, FileText, CreditCard, Undo2 } from 'lucide-react'
import { openPrintWindow } from '../utils/print'
import BottomActionBar from '../components/BottomActionBar'
import { GoldButton, DangerButton, GhostButton, DarkButton } from '../components/Buttons'
import Modal from '../components/Modal'
import CastChip from '../components/CastChip'
import NumberInput from '../components/NumberInput'

/**
 * 卓ステータスの色 (TRUST 準拠配色提案)
 * - empty:    オフホワイト + ゴールド縁  (空き)
 * - occupied: ティールブルー #2a5a7a     (使用中)
 * - ending:   アンバー塗り #e8a135       (終了間近 / 5分前)
 * - alert:    コーラルピンク #ff6b9d    (50分経過 → 中間チェック票対象)
 */
const statusStyle: Record<TableStatus, { border: string; bg: string; badge: string; accent: string }> = {
  empty: {
    border: 'border-gold/50',
    bg: 'bg-[rgba(217,217,217,0.04)]',
    badge: 'bg-white/10 text-gray-300',
    accent: 'bg-gold/40',
  },
  occupied: {
    border: 'border-[#2a5a7a]',
    bg: 'bg-[rgba(42,90,122,0.18)]',
    badge: 'bg-[#2a5a7a]/40 text-white',
    accent: 'bg-[#2a5a7a]',
  },
  ending: {
    border: 'border-[#e8a135]',
    bg: 'bg-[rgba(232,161,53,0.18)]',
    badge: 'bg-[#e8a135]/30 text-amber-200',
    accent: 'bg-[#e8a135]',
  },
  alert: {
    border: 'border-[#ff6b9d]',
    bg: 'bg-[rgba(255,107,157,0.16)]',
    badge: 'bg-[#ff6b9d]/30 text-pink-200',
    accent: 'bg-[#ff6b9d]',
  },
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
  // selected は ID のみ保持し、tables からの dynamic reference で最新状態を反映
  // (updateTable 後に selected が stale になるバグを防ぐ)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = selectedId !== null ? tables.find((t) => t.id === selectedId) ?? null : null
  const setSelected = (t: Table | null) => setSelectedId(t?.id ?? null)

  const [showCheckIn, setShowCheckIn] = useState(false)
  const [ciTime, setCiTime] = useState(defaultStartTime)
  const [ciGuests, setCiGuests] = useState(1)
  const [ciCastNames, setCiCastNames] = useState<string[]>([])
  /** 本指名担当 (担当リストの中から 1 名) / undefined = 本指名なし */
  const [ciMainNomination, setCiMainNomination] = useState<string | undefined>(undefined)
  /** 同伴フラグ (本指名と共存可) */
  const [ciIsDouhan, setCiIsDouhan] = useState(false)
  /** 場内指名フラグ */
  const [ciIsBanaiShimei, setCiIsBanaiShimei] = useState(false)

  const [showExtend, setShowExtend] = useState(false)
  const [showRotation, setShowRotation] = useState(false)
  const [, setTick] = useState(0)

  // 休憩中は付け回し候補から除外、ただし入店時の assignedCasts リストなどで表示したい場合は別途 c.active を直接参照
  const activeCasts = casts.filter((c) => c.active && !c.onBreak)

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
    setCiMainNomination(undefined)
    setCiIsDouhan(false)
    setCiIsBanaiShimei(false)
    setShowCheckIn(true)
  }

  const toggleCast = (name: string) => {
    setCiCastNames((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
      // 本指名担当に選択中のキャストが担当から外れたらクリア
      if (ciMainNomination && !next.includes(ciMainNomination)) {
        setCiMainNomination(undefined)
      }
      return next
    })
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

    // 追補02 R1/R9: 本指名・場内指名・同伴は排他ではなく組み合わせ可能。
    //   本指名 → 本指名料 (本指名担当に紐付け)
    //   場内指名 → 場内指名料 (担当キャスト全員分)
    //   同伴 → 同伴料 (担当キャスト全員分、本指名と共存可)
    const pushChargeOrder = (chargeId: 'shimei' | 'banai' | 'douhan', castName?: string) => {
      const chargeItem = chargeItems.find((c) => c.id === chargeId)
      if (!chargeItem) return
      autoOrders.push({
        menuItem: {
          id: 901 + autoOrders.length,
          name: chargeItem.label, price: chargeItem.price,
          cost: chargeItem.cost ?? 300, castBack: 0,
          category: 'guest' as const, subcategory: 'warimono' as const,
        },
        quantity: 1,
        castName,
      })
    }
    if (ciMainNomination) {
      pushChargeOrder('shimei', ciMainNomination)
    }
    if (ciIsBanaiShimei) {
      for (const name of assignedNames) {
        if (!name) continue
        pushChargeOrder('banai', name)
      }
    }
    if (ciIsDouhan) {
      for (const name of assignedNames) {
        if (!name) continue
        pushChargeOrder('douhan', name)
      }
    }

    updateTable(selected.id, {
      status: 'occupied',
      guestCount: ciGuests,
      startTime: ciTime,
      assignedCasts: assignedNames,
      mainNominationCastName: ciMainNomination,
      isDouhan: ciIsDouhan || undefined,
      isBanaiShimei: ciIsBanaiShimei || undefined,
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
    // 追補02 R8-5: 本指名担当を優先、なければ担当リスト先頭
    setPendingExtend({ minutes, castName: selected.mainNominationCastName ?? selected.assignedCasts[0] })
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
      <div class="row"><span>担当:</span><span>${table.assignedCasts.join(', ')}</span></div>${table.mainNominationCastName ? `
      <div class="row"><span>本指名:</span><span>${table.mainNominationCastName}</span></div>` : ''}
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

  const busyCastNames = new Set(tables.filter((t) => t.status !== 'empty').flatMap((t) => t.assignedCasts))
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
    // 追補02 R2-2/R10-3: 別卓で対応中だった場合はそちらから外す (排他的移動)
    for (const t of tables) {
      if (t.id === selected.id) continue
      if (t.assignedCasts.includes(castName)) {
        updateTable(t.id, { assignedCasts: t.assignedCasts.filter((n) => n !== castName) })
      }
    }
    updateTable(selected.id, {
      assignedCasts: [...selected.assignedCasts, castName],
    })
    const now = new Date().toISOString()
    setCasts((prev) => prev.map((c) => c.name === castName ? { ...c, lastAssignedAt: now } : c))
    setShowRotation(false)
    setSelected(null)
  }

  const occupiedCount = tables.filter((t) => t.status !== 'empty').length

  return (
    <div className="flex flex-col min-h-full">
    <div className="p-4 flex-1">
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
      <div className="panel flex items-center justify-between px-4 py-2.5 mb-4 text-sm tabular-nums">
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
              className={`relative overflow-hidden ${style.bg} ${style.border} border-2 rounded-[14px] p-5 pt-6 text-left transition-all active:scale-[0.97] min-h-[120px]`}
            >
              <span className={`absolute top-0 left-0 right-0 h-1.5 ${style.accent}`} />
              <div className="flex justify-between items-start">
                <span className="text-2xl font-bold tracking-wide" style={{ fontFamily: 'var(--font-body)' }}>{table.number}</span>
                {table.status === 'empty' ? (
                  <span className="text-gold/60"><Plus size={20} /></span>
                ) : remaining !== null ? (
                  <span className={`text-sm font-bold tabular-nums ${remaining <= 5 ? 'text-accent' : remaining <= 10 ? 'text-amber-300' : 'text-white'}`}>
                    {remaining > 0 ? `${remaining}m` : 'END'}
                  </span>
                ) : null}
              </div>
              {table.status !== 'empty' && (
                <div className="mt-2.5 space-y-1">
                  {/* 追補02 R1-7: 「対応中」を第一行で明示。本指名担当は別表示。 */}
                  <div className="text-sm font-medium truncate">
                    {table.assignedCasts.length > 0 ? table.assignedCasts.join(', ') : <span className="text-gray-500">担当なし</span>}
                  </div>
                  {table.mainNominationCastName && (
                    <div className="text-xs text-gold truncate">
                      <span className="text-gold/70">本指名:</span> {table.mainNominationCastName}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <Users size={11} />
                    <span>{table.guestCount}名</span>
                    <span className="text-gray-600">|</span>
                    <Clock size={11} />
                    <span>{table.startTime}〜</span>
                  </div>
                  <span className="inline-block text-xs bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded mt-0.5">
                    {getNominationBadge(table)}
                  </span>
                  {elapsed >= 50 && (
                    <div className="text-xs text-accent font-bold mt-0.5">50分経過</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Detail Modal for occupied tables */}
      <Modal
        open={!!selected && !showCheckIn && !showExtend && !showRotation && !!selected && selected.status !== 'empty'}
        onClose={() => setSelected(null)}
        title={selected ? `卓 ${selected.number}` : ''}
        size="lg"
      >
        {selected && selected.status !== 'empty' && (
          <>
            {selected.startTime && (() => {
              const rem = calcRemainingMinutes(selected.startTime, selected.setCount, selected.timeAdjustmentMinutes ?? 0, totalExtensionMinutes(selected))
              return (
                <div className={`text-center py-3 rounded-[10px] mb-4 font-bold text-lg ${rem <= 5 ? 'bg-accent/10 text-red-300 border border-accent/30' : rem <= 10 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'panel-gold'}`}>
                  残り {rem > 0 ? `${rem}分` : '終了'}
                </div>
              )
            })()}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* 追補02 R1-7: 「対応中」と「本指名」を別枠で視覚的に区別 */}
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">対応中</div>
                <div className="font-medium">
                  {selected.assignedCasts.length > 0 ? selected.assignedCasts.join(', ') : <span className="text-gray-500">担当なし</span>}
                </div>
              </div>
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">指名タイプ</div>
                <div className="font-medium">{getNominationLabel(selected)}</div>
              </div>
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">入店時刻</div>
                <div className="font-medium">{selected.startTime}</div>
              </div>
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">人数</div>
                <div className="font-medium">{selected.guestCount}名</div>
              </div>
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">セット料金</div>
                <div className="font-medium">
                  {selected.startTime ? `¥${Math.max(0, getSetPriceForTime(selected.startTime) - (selected.setDiscountPerSet ?? 0)).toLocaleString()}` : '-'}
                  {(selected.setDiscountPerSet ?? 0) > 0 && (
                    <span className="text-[10px] text-amber-300 ml-1">(値引¥{selected.setDiscountPerSet!.toLocaleString()})</span>
                  )}
                </div>
                <div className="text-gray-600 text-xs">{selected.startTime ? getSetPriceLabel(selected.startTime) : ''}</div>
              </div>
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-1">セット数</div>
                <div className="font-medium">{selected.setCount}</div>
              </div>
            </div>
            {/* セット料金値引き (指示書§1.1 / 追補02 R12: 削除時 0 残留を防ぐ) */}
            <div className="mt-3 panel p-3">
              <label className="text-xs text-gray-500 block mb-1.5">セット料金値引き (1セットあたりの割引額)</label>
              <NumberInput
                value={selected.setDiscountPerSet ?? 0}
                onChange={(v) => updateTable(selected.id, { setDiscountPerSet: v })}
                min={0}
                step={100}
                unit="円 / セット"
              />
            </div>

            {/* Bottle keeps */}
            {(() => {
              const keeps = bottleKeeps.filter((b) => b.tableNumber === selected.number)
              if (keeps.length === 0) return null
              return (
                <div className="mt-4 panel-gold p-3">
                  <div className="text-xs text-gold font-bold mb-2">キープボトル</div>
                  {keeps.map((k) => (
                    <div key={k.id} className="flex justify-between text-sm mb-1">
                      <span>{k.bottleName} ({k.customerName})</span>
                      <span className={k.remaining <= 20 ? 'text-accent font-bold' : ''}>{k.remaining}%</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {selected.orders.length > 0 && (
              <div className="mt-4 panel p-3">
                <div className="text-gray-500 text-xs mb-2">注文 ({selected.orders.length}品)</div>
                {selected.orders.slice(0, 5).map((o, idx) => (
                  <div key={`${o.menuItem.id}-${o.castName ?? ''}-${idx}`} className="flex justify-between text-sm py-0.5">
                    <span className="text-gray-300">{displayOrderName(o)} x{o.quantity}</span>
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
                <DarkButton key={min} onClick={() => requestExtend(min as 30 | 60)} className="flex-1 text-sm">
                  延長 +{min}分
                </DarkButton>
              ))}
            </div>
            <div className="flex gap-2 mt-2 items-center text-xs">
              <span className="text-gray-500">残り時間微調整:</span>
              <button onClick={() => handleTimeAdjust(-10)} className="flex-1 panel py-2 rounded-[10px] font-bold hover:bg-white/10 transition-colors">-10分</button>
              <button onClick={() => handleTimeAdjust(+10)} className="flex-1 panel py-2 rounded-[10px] font-bold hover:bg-white/10 transition-colors">+10分</button>
              {(selected.timeAdjustmentMinutes ?? 0) !== 0 && (
                <button onClick={() => updateTable(selected.id, { timeAdjustmentMinutes: 0 })} className="text-gray-500 underline">リセット({selected.timeAdjustmentMinutes! > 0 ? '+' : ''}{selected.timeAdjustmentMinutes}分)</button>
              )}
            </div>
            {selected.extensionHistory && selected.extensionHistory.length > 0 && (
              <div className="mt-2 panel p-2">
                <div className="text-xs text-gray-500 mb-1">延長履歴</div>
                {selected.extensionHistory.map((ex) => (
                  <div key={ex.id} className="flex justify-between items-center text-xs py-0.5">
                    <span className="text-gray-400">+{ex.minutes}分 ({new Date(ex.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})</span>
                    <button onClick={() => handleUndoExtension(ex.id)} className="text-accent flex items-center gap-1"><Undo2 size={10} /> 取消</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <DarkButton onClick={() => { const id = selected.id; setSelected(null); navigate(`/order?table=${id}`) }} className="flex-1 text-sm flex items-center justify-center gap-1.5">
                <FileText size={15} /> 注文
              </DarkButton>
              <GoldButton onClick={() => { const id = selected.id; setSelected(null); navigate(`/billing?table=${id}`) }} className="flex-1 text-sm flex items-center justify-center gap-1.5">
                <CreditCard size={15} /> 会計
              </GoldButton>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  handlePrintCheckTicket(selected)
                  updateTable(selected.id, { checkTicketPrintedAt: new Date().toISOString() })
                }}
                className={`flex-1 py-3 rounded-[10px] font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
                  selected.startTime && calcElapsedMinutes(selected.startTime) >= 50
                    ? 'bg-accent/10 border border-accent/30 text-red-300'
                    : 'panel text-gray-300'
                }`}
              >
                <Printer size={15} /> チェック票
              </button>
              <button onClick={() => setShowRotation(true)} className="flex-1 panel py-3 rounded-[10px] font-bold text-sm flex items-center justify-center gap-1.5 text-gray-300 hover:bg-white/10 transition-colors">
                <RotateCcw size={15} /> 付け回し
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Check-in Modal */}
      <Modal
        open={showCheckIn && !!selected}
        onClose={() => { setShowCheckIn(false); setSelected(null) }}
        title={selected ? `卓 ${selected.number} 入店` : ''}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">セット開始時刻</label>
              <div className="flex gap-2">
                <input type="time" value={ciTime} onChange={(e) => setCiTime(e.target.value)} className="flex-1 bg-primary-dark/60 border border-gold/30 rounded-md px-4 py-3.5 text-base focus:border-gold focus:outline-none" />
                <button onClick={() => setCiTime(defaultStartTime())} className="btn-ghost px-5 whitespace-nowrap text-base min-h-[52px]">今すぐ</button>
              </div>
              <div className="text-sm text-gold mt-2 tabular-nums">
                セット料金: ¥{getSetPriceForTime(ciTime).toLocaleString()} <span className="text-gray-400">({getSetPriceLabel(ciTime)})</span>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">来店人数</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCiGuests(n)}
                    className={`flex-1 py-4 rounded-[10px] text-lg font-bold transition-colors ${
                      ciGuests === n ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">キャスト（複数選択可）</label>
              <div className="flex flex-wrap gap-2">
                {activeCasts.map((c) => (
                  <CastChip key={c.id} name={c.name} selected={ciCastNames.includes(c.name)} onClick={() => toggleCast(c.name)} />
                ))}
              </div>
              {ciCastNames.length > 0 && (
                <div className="text-sm text-gold mt-2">選択中: {ciCastNames.join(', ')}</div>
              )}
            </div>
            {/* 追補02 R1/R9: 指名タイプ 4 択は廃止。
                本指名担当は担当リストから 1 名選択。同伴・場内指名はチェックで組合可能。 */}
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">本指名担当 (任意)</label>
              {ciCastNames.length === 0 ? (
                <div className="text-sm text-gray-500 panel p-3">担当を選択すると、本指名担当を指定できます</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCiMainNomination(undefined)}
                    className={`px-4 py-3 rounded-[10px] text-sm font-bold transition-colors ${
                      !ciMainNomination ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    なし
                  </button>
                  {ciCastNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => setCiMainNomination(name)}
                      className={`px-4 py-3 rounded-[10px] text-sm font-bold transition-colors ${
                        ciMainNomination === name ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">追加オプション</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCiIsDouhan((v) => !v)}
                  className={`py-4 rounded-[10px] text-base font-bold transition-colors flex items-center justify-center gap-2 ${
                    ciIsDouhan ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                  }`}
                >
                  <span className="inline-block w-4 h-4 border-2 rounded-sm flex items-center justify-center" style={{ borderColor: ciIsDouhan ? '#1a1a2e' : '#888' }}>
                    {ciIsDouhan && '✓'}
                  </span>
                  同伴
                </button>
                <button
                  onClick={() => setCiIsBanaiShimei((v) => !v)}
                  className={`py-4 rounded-[10px] text-base font-bold transition-colors flex items-center justify-center gap-2 ${
                    ciIsBanaiShimei ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                  }`}
                >
                  <span className="inline-block w-4 h-4 border-2 rounded-sm flex items-center justify-center" style={{ borderColor: ciIsBanaiShimei ? '#1a1a2e' : '#888' }}>
                    {ciIsBanaiShimei && '✓'}
                  </span>
                  場内指名
                </button>
              </div>
              {(ciMainNomination || ciIsDouhan || ciIsBanaiShimei) && (
                <div className="text-sm text-gold mt-2">
                  指名: {getNominationLabel({ mainNominationCastName: ciMainNomination, isDouhan: ciIsDouhan, isBanaiShimei: ciIsBanaiShimei })}
                </div>
              )}
            </div>
            <GoldButton onClick={confirmCheckIn} className="w-full py-5 text-lg flex items-center justify-center gap-2">
              入店開始 <ChevronRight size={22} />
            </GoldButton>
          </div>
        )}
      </Modal>

      {/* Extend Modal */}
      <Modal
        open={showExtend && !!selected}
        onClose={() => { setShowExtend(false); setSelected(null) }}
        title={selected ? `卓 ${selected.number} 延長` : ''}
        size="sm"
      >
        {selected && (
          <>
            <p className="text-sm text-gray-400 mb-4">現在: {selected.setCount}セット</p>
            <div className="space-y-3">
              {EXTENSION_OPTIONS.map((min) => (
                <DarkButton key={min} onClick={() => requestExtend(min as 30 | 60)} className="w-full">
                  +{min}分延長
                </DarkButton>
              ))}
            </div>
            <GhostButton onClick={() => { setShowExtend(false); setSelected(null) }} className="w-full mt-3">
              キャンセル
            </GhostButton>
          </>
        )}
      </Modal>

      {/* Rotation Modal */}
      <Modal
        open={showRotation && !!selected}
        onClose={() => { setShowRotation(false); setSelected(null) }}
        title={selected ? `付け回し - 卓 ${selected.number}` : ''}
        size="sm"
      >
        {selected && (
          <>
            <p className="text-sm text-gray-400 mb-4">空いているキャストを選択してください</p>
            {freeCasts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">現在空いているキャストはいません</p>
            ) : (
              <div className="space-y-2">
                {freeCasts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAssignCast(c.name)}
                    className="panel w-full p-3 text-left hover:bg-gold/5 hover:border-gold/40 transition-all flex items-center justify-between"
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
          </>
        )}
      </Modal>

    </div>
    <BottomActionBar
      leftLabel="本日売上"
      leftValue={`¥${flMetrics.todaySales.toLocaleString()}`}
      center={
        <span className="text-sm text-gray-400 tabular-nums">
          使用中 {occupiedCount} / {tables.length} 卓
        </span>
      }
      right={
        pendingCheckTickets.length > 0 ? (
          <DangerButton onClick={handlePrintPendingChecks} className="text-sm flex items-center gap-1">
            <Printer size={15} /> チェック票 {pendingCheckTickets.length}件
          </DangerButton>
        ) : (
          <GoldButton onClick={() => navigate('/waiting')} className="text-sm flex items-center gap-1">
            <Users size={15} /> 待機キャスト
          </GoldButton>
        )
      }
    />

      {/* 延長確認ダイアログ (指示書§6.2.3 + §G-9 指名選択) */}
      <Modal
        open={!!(pendingExtend && selected)}
        onClose={() => setPendingExtend(null)}
        size="sm"
        title="延長の確認"
        footer={
          <>
            <GhostButton onClick={() => setPendingExtend(null)} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={confirmExtend} className="flex-1">延長する</GoldButton>
          </>
        }
      >
        {pendingExtend && selected && (
          <div className="space-y-3">
            <div className="panel p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">延長時間</span>
                <span className="font-bold">+{pendingExtend.minutes}分</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">延長料金</span>
                <span className="font-bold text-gold tabular-nums">¥{EXTENSION_CHARGES[pendingExtend.minutes].toLocaleString()}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1.5">指名(バック帰属先・任意)</label>
              <div className="flex gap-2 flex-wrap">
                <CastChip
                  name="フリー"
                  selected={!pendingExtend.castName}
                  onClick={() => setPendingExtend({ ...pendingExtend, castName: undefined })}
                />
                {selected.assignedCasts.map((name) => (
                  <CastChip
                    key={name}
                    name={name}
                    selected={pendingExtend.castName === name}
                    onClick={() => setPendingExtend({ ...pendingExtend, castName: name })}
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-400">延長してよろしいですか?</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

