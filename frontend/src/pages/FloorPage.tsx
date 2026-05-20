import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  EXTENSION_OPTIONS,
  SET_DURATION_MINUTES,
  chargeItems,
  displayOrderName,
  isChargeOrNominationOrder,
} from '../data/mock'
import { getNominationBadge } from '../utils/nomination'
import { getSetLabel, getCurrentSetTimeRange, formatSetWithRange, getExtensionLabel, addMinutesToHHMM } from '../utils/setCountLabel'
import { useExtendTable } from '../hooks/useExtendTable'
import { Clock, Users, Plus, Printer, ChevronRight, FileText, CreditCard, Undo2, X } from 'lucide-react'
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

/** spec.md §2.2.4: 残時間は「現在いるセット」単位で表示する。
 *  - 延長履歴あり → 直近の延長を「現在のセット」とみなし、その timestamp を起点に
 *    minutes 分のカウントダウンで残時間を出す（30/60 分のフルカウントで再スタート）。
 *  - 延長履歴なし → 1 セット目。startTime から SET_DURATION_MINUTES 分のカウントダウン。
 *  → 1 セット目超過後に延長を打っても、新セットは追加した 30/60 分まるまる残る挙動になる
 *    （旧実装は startTime からの累積で計算していたため、超過分が新セットを食って
 *    支払い分より残時間が短く出るバグがあった）。
 *  setCount 引数は将来の 22:00 自動セット切替に備えて残置（現状未使用）。 */
function calcRemainingMinutes(
  startTime: string,
  _setCount: number,
  timeAdjustment: number = 0,
  extensionHistory: ReadonlyArray<{ minutes: 30 | 60; timestamp: string }> = [],
): number {
  const now = new Date()
  if (extensionHistory.length > 0) {
    const last = extensionHistory[extensionHistory.length - 1]
    const exStart = new Date(last.timestamp).getTime()
    const elapsed = (now.getTime() - exStart) / 60_000
    return Math.ceil(last.minutes - elapsed) + timeAdjustment
  }
  const [h, m] = startTime.split(':').map(Number)
  const startDate = new Date()
  startDate.setHours(h, m, 0, 0)
  if (startDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    startDate.setDate(startDate.getDate() - 1)
  }
  const elapsed = (now.getTime() - startDate.getTime()) / 60_000
  return Math.ceil(SET_DURATION_MINUTES - elapsed) + timeAdjustment
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
  const { tables, casts, setCasts, updateTable, flMetrics, storeSettings, resetTable, addBillingRecord } = useStore()
  const extendTable = useExtendTable()
  const { user } = useAuth()
  // ISSUE-010: 延長交渉モーダル経由（UsageDetailPage → /floor?action=extend&from=...）の戻り遷移先
  const [searchParams] = useSearchParams()
  const fromAfterExtend = searchParams.get('from')
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
  /** 本指名担当 (担当リストの中から 0〜N 名、追補03 R24 で複数対応) */
  const [ciMainNominations, setCiMainNominations] = useState<string[]>([])
  /** 同伴フラグ (本指名と共存可) */
  const [ciIsDouhan, setCiIsDouhan] = useState(false)
  /** 場内指名フラグ */
  const [ciIsBanaiShimei, setCiIsBanaiShimei] = useState(false)

  const [showExtend, setShowExtend] = useState(false)
  const [showRotation, setShowRotation] = useState(false)
  const [rotationSelected, setRotationSelected] = useState<string[]>([])
  const [forceCheckoutPending, setForceCheckoutPending] = useState<{ total: number } | null>(null)
  const [, setTick] = useState(0)

  // 休憩中は付け回し候補から除外、ただし入店時の assignedCasts リストなどで表示したい場合は別途 c.active を直接参照
  const activeCasts = casts.filter((c) => c.active && !c.onBreak)

  const checkStatuses = useCallback(() => {
    for (const table of tables) {
      if (table.status === 'empty' || !table.startTime) continue
      const remaining = calcRemainingMinutes(table.startTime, table.setCount, table.timeAdjustmentMinutes ?? 0, table.extensionHistory ?? [])
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
    setCiMainNominations([])
    setCiIsDouhan(false)
    setCiIsBanaiShimei(false)
    setShowCheckIn(true)
  }

  // ビデオレビュー C1: 入店モーダルからキャスト選択 UI を削除したため、
  // toggleCast / toggleMainNomination も不要になった (卓詳細から直接編集する)

  const confirmCheckIn = () => {
    if (!selected) return
    // ビデオレビュー B1: 入店開始押下時にキャストが勝手に選ばれないように
    //   従来: ciCastNames が空なら activeCasts[0] を自動セット (= 「あいり」が勝手に入る)
    //   修正: ciCastNames をそのまま使用 (空なら担当なし = フリー扱い)
    const assignedNames = ciCastNames

    // ビデオレビュー B2/B3: 1 キャスト 1 卓ロック — 別卓で対応中のキャストはここで自動的に外す
    if (assignedNames.length > 0) {
      for (const t of tables) {
        if (t.id === selected.id) continue
        const overlap = t.assignedCasts.filter((n) => assignedNames.includes(n))
        if (overlap.length > 0) {
          updateTable(t.id, {
            assignedCasts: t.assignedCasts.filter((n) => !assignedNames.includes(n)),
          })
        }
      }
    }
    const autoOrders: Table['orders'] = []
    // クロウレビュー対応: 旧 `900 + idx` のハードコード ID を Date.now() ベースで一意化
    //   → 通常メニューや既存 orders と衝突しない
    let nextChargeId = Date.now()

    // 指示書§1.2: シングルチャージは 1 名様のみ自動付与
    if (ciGuests === 1) {
      const singleChargeItem = chargeItems.find((c) => c.id === 'single-charge')
      if (singleChargeItem) {
        autoOrders.push({
          menuItem: {
            id: nextChargeId++, name: 'シングルチャージ', price: singleChargeItem.price,
            cost: singleChargeItem.cost ?? 300, castBack: 0,
            category: 'guest' as const, subcategory: 'warimono' as const,
          },
          quantity: 1,
        })
      }
    }

    // Fix B (ふうや指摘): 本指名料・同伴料・場内指名料は orders に追加しない。
    //   会計時に BillingPage 側で table.mainNominationCastNames / isDouhan /
    //   isBanaiShimei / assignedCasts から直接計算する。
    //   → 入店後に卓詳細で本指名・同伴等を変更しても会計に正しく反映される
    //   （旧設計は orders に auto 追加し、入店後変更時に orders を delta 同期
    //   する仕組みがなかったため料金が抜ける問題があった）。

    const checkInPatch = {
      status: 'occupied' as const,
      guestCount: ciGuests,
      startTime: ciTime,
      assignedCasts: assignedNames,
      mainNominationCastNames: ciMainNominations,
      isDouhan: ciIsDouhan || undefined,
      isBanaiShimei: ciIsBanaiShimei || undefined,
      setCount: 1,
      orders: autoOrders,
      setDiscountPerSet: 0,
      timeAdjustmentMinutes: 0,
      extensionHistory: [],
    }
    // Fix D: updateTable が backend 同期するので明示的な tablesApi.update は不要
    updateTable(selected.id, checkInPatch)
    const now = new Date().toISOString()
    setCasts((prev) => prev.map((c) => assignedNames.includes(c.name) ? { ...c, lastAssignedAt: now } : c))
    setShowCheckIn(false)
    setSelected(null)
  }

  // 延長確認ダイアログ用 (指示書§6.2.3: 確認ダイアログ必須 + 指名選択 G-9)
  const [pendingExtend, setPendingExtend] = useState<{ minutes: 30 | 60; castNames: string[] } | null>(null)

  const requestExtend = (minutes: 30 | 60) => {
    if (!selected) return
    // デフォルト指名キャスト: 本指名担当を全員プリセット。本指名が無ければ担当先頭 1 名。
    // 追補02 R8-5 / クロウさん追加要件: バック帰属を複数選択可能とする。
    const defaults =
      selected.mainNominationCastNames.length > 0
        ? [...selected.mainNominationCastNames]
        : selected.assignedCasts.slice(0, 1)
    setPendingExtend({ minutes, castNames: defaults })
  }

  const confirmExtend = () => {
    if (!selected || !pendingExtend) return
    // 共通ロジックは useExtendTable に集約（OrderPage 側からも同じ処理を呼ぶ）
    extendTable(selected, pendingExtend.minutes, pendingExtend.castNames)
    setPendingExtend(null)
    setShowExtend(false)
    // ISSUE-010: from クエリがあれば（UsageDetailPage の延長交渉ボタン経由）元画面に戻る
    if (fromAfterExtend) {
      navigate(fromAfterExtend)
    } else {
      setSelected(null)
    }
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

  // spec.md §2.2.1: 「ご延長交渉」ボタン削除に伴い、INTERIM CHECK SHEET 印字関数も削除。
  // pending banner は常に空のため非表示。
  const pendingCheckTickets: typeof tables = []

  // 追補03 R21: 一括自動印字機能は削除済 (旧 handlePrintPendingChecks)
  const handlePrintPendingChecks = () => {/* no-op (将来削除予定) */}

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

  // 「空き卓にする」(誤開卓 / トラブル時の手動空席戻し)
  // - 計算金額 0 円: 注文なし旨のメッセージで確認モーダル → そのまま空席に戻す
  // - 計算金額あり: 「未収（代金未収受）」として BillingRecord を残してから空席に戻す
  const handleForceCheckout = () => {
    if (!selected) return
    const setUnit = selected.startTime ? getSetPriceForTime(selected.startTime) : 0
    const disc = selected.setDiscountPerSet ?? 0
    const setSubtotal = Math.max(0, setUnit - disc) * selected.guestCount * selected.setCount
    const drinksSubtotal = selected.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
    const subtotal = setSubtotal + drinksSubtotal
    const total = subtotal + Math.floor(subtotal * storeSettings.taxRate)
    setForceCheckoutPending({ total })
  }

  const confirmForceCheckout = () => {
    if (!selected || forceCheckoutPending === null) return
    if (forceCheckoutPending.total > 0) {
      addBillingRecord({
        id: String(Date.now()),
        tableNumber: selected.number,
        total: forceCheckoutPending.total,
        paymentMethod: 'cash',
        cashAmount: 0,
        cardAmount: 0,
        completedAt: new Date().toISOString(),
        date: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
        isUncollected: true,
        castNamesSnapshot: [...selected.assignedCasts],
      })
    }
    resetTable(selected.id)
    setSelected(null)
    setForceCheckoutPending(null)
  }

  const closeRotationModal = () => {
    setShowRotation(false)
    setRotationSelected([])
    setSelected(null)
  }

  const handleAssignCastsBulk = () => {
    if (!selected) return
    // 既に同卓に居るキャストは除外
    const newCasts = rotationSelected.filter((n) => !selected.assignedCasts.includes(n))
    if (newCasts.length === 0) {
      closeRotationModal()
      return
    }
    // 追補02 R2-2/R10-3: 別卓で対応中だった場合はそちらから外す (排他的移動)
    for (const t of tables) {
      if (t.id === selected.id) continue
      const overlap = t.assignedCasts.filter((n) => newCasts.includes(n))
      if (overlap.length === 0) continue
      updateTable(t.id, { assignedCasts: t.assignedCasts.filter((n) => !newCasts.includes(n)) })
    }
    updateTable(selected.id, {
      assignedCasts: [...selected.assignedCasts, ...newCasts],
    })
    const now = new Date().toISOString()
    setCasts((prev) => prev.map((c) => newCasts.includes(c.name) ? { ...c, lastAssignedAt: now } : c))
    closeRotationModal()
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
            ご延長交渉 {pendingCheckTickets.length}件 (50分経過)
          </span>
          <span className="text-xs text-red-300/80">
            {pendingCheckTickets.map((t) => `${t.number}卓`).join(', ')} → タップで一括印字
          </span>
        </button>
      )}

      {/* Profit Widget */}
      <div className="panel flex items-center justify-between px-4 py-2.5 mb-4 text-sm tabular-nums">
        <span>本日 <span className="font-bold">¥{flMetrics.todayProfit.toLocaleString()}</span> <span className={`text-xs ${flColor(flMetrics.flRate)}`}>(FL {flMetrics.flRate.toFixed(1)}%)</span></span>
        <span>今月 <span className="font-bold">¥{flMetrics.monthlyProfit.toLocaleString()}</span> <span className={`text-xs ${flColor(flMetrics.monthlyFlRate)}`}>(FL {flMetrics.monthlyFlRate.toFixed(1)}%)</span></span>
      </div>

      {/* Table Grid — ビデオレビュー C18: 並び順は固定 (id 昇順)
          時間で入れ替わると目で覚えた配置と合わなくなり混乱する。
          状態は色 (statusStyle) で表現。
          spec.md §2.2.4: 卓ボタンを大きめに（min-h-[160px]）してスクロール不要なサイズに。 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...tables].sort((a, b) => a.id - b.id).map((table) => {
          const remaining = table.startTime ? calcRemainingMinutes(table.startTime, table.setCount, table.timeAdjustmentMinutes ?? 0, table.extensionHistory ?? []) : null
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
              className={`relative overflow-hidden ${style.bg} ${style.border} border-2 rounded-[14px] p-5 pt-6 text-left transition-all active:scale-[0.97] min-h-[160px]`}
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
              {table.status !== 'empty' && (() => {
                // PDF: 入店時刻には終わる時間まで表示。担当なしは「フリー」表示。
                const range = table.startTime
                  ? getCurrentSetTimeRange({
                      startTime: table.startTime,
                      setCount: table.setCount,
                      extensionHistory: table.extensionHistory,
                    })
                  : null
                return (
                <div className="mt-2.5 space-y-1">
                  {/* 追補02 R1-7: 「対応中」を第一行で明示。本指名担当は別表示。
                      PDF: 担当が居なければ「フリー」と明示。 */}
                  <div className="text-sm font-medium truncate">
                    {table.assignedCasts.length > 0 ? table.assignedCasts.join(', ') : <span className="text-gray-500">フリー</span>}
                  </div>
                  {table.mainNominationCastNames.length > 0 && (
                    <div className="text-xs text-gold truncate">
                      <span className="text-gold/70">本指名:</span> {table.mainNominationCastNames.join(', ')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <Users size={11} />
                    <span>{table.guestCount}名</span>
                    <span className="text-gray-600">|</span>
                    <Clock size={11} />
                    {/* PDF: 「12:00〜1:00」形式で開始〜終了を併記 */}
                    <span>{range?.startHHMM ?? table.startTime}〜{range?.endHHMM ?? ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {/* spec.md §2.2.4: セット数バッジを 1セット目 / EX1 / EX2 表記で表示 */}
                    <span className="inline-block text-xs bg-white/10 text-gray-200 border border-white/20 px-1.5 py-0.5 rounded">
                      {getSetLabel(table)}
                    </span>
                    <span className="inline-block text-xs bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded">
                      {getNominationBadge(table)}
                    </span>
                  </div>
                  {elapsed >= 50 && (
                    <div className="text-xs text-accent font-bold mt-0.5">50分経過</div>
                  )}
                </div>
                )
              })()}
            </button>
          )
        })}
      </div>

      {/* Detail Modal for occupied tables */}
      <Modal
        open={!!selected && !showCheckIn && !showExtend && !showRotation && !!selected && selected.status !== 'empty'}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.number}卓` : ''}
        size="lg"
      >
        {selected && selected.status !== 'empty' && (
          <>
            {selected.startTime && (() => {
              const rem = calcRemainingMinutes(selected.startTime, selected.setCount, selected.timeAdjustmentMinutes ?? 0, selected.extensionHistory ?? [])
              // PDF/Word 仕様: 「1Set目 12:00〜1:00まで（残り20分）」「EX(2)半 12:00〜12:30まで（…）」
              const range = getCurrentSetTimeRange({
                startTime: selected.startTime,
                setCount: selected.setCount,
                extensionHistory: selected.extensionHistory,
              })
              return (
                <div className={`text-center py-3 rounded-[10px] mb-4 font-bold text-lg ${rem <= 5 ? 'bg-accent/10 text-red-300 border border-accent/30' : rem <= 10 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'panel-gold'}`}>
                  {rem > 0 ? formatSetWithRange(range, rem) : `${range.label} 終了`}
                </div>
              )
            })()}

            {/* ビデオレビュー C3-C7: 卓詳細を編集モード化 — 全フィールドを直接編集可能に */}
            <div className="space-y-3 text-sm">
              {/* 対応中キャスト編集 (C7: 直接抜く + キャスト追加) */}
              <div className="panel p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-gray-500 text-xs">対応中</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.assignedCasts.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 bg-gold/10 border border-gold/30 text-gold rounded-full px-3 py-1 text-xs">
                      {name}
                      <button
                        onClick={() => updateTable(selected.id, { assignedCasts: selected.assignedCasts.filter((n) => n !== name) })}
                        className="hover:text-red-400"
                        aria-label="外す"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setShowRotation(true)}
                    className="inline-flex items-center gap-1 bg-white/5 border border-white/20 text-gray-300 hover:text-white rounded-full px-3 py-1 text-xs"
                  >
                    <Plus size={12} /> 追加
                  </button>
                </div>
              </div>

              {/* 入店時刻 + 人数 + セット料金 + セット数 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="text-gray-500 text-xs mb-1">入店時刻</div>
                  {/* C3: 入店時刻を後から変更可能 */}
                  <input
                    type="time"
                    value={selected.startTime ?? ''}
                    onChange={(e) => updateTable(selected.id, { startTime: e.target.value })}
                    className="bg-primary-dark/60 border border-gold/20 rounded px-2 py-1 text-sm w-full"
                  />
                </div>
                <div className="panel p-3">
                  <div className="text-gray-500 text-xs mb-1">人数</div>
                  {/* C4: 人数を後から増減可能 */}
                  <NumberInput
                    value={selected.guestCount}
                    onChange={(v) => updateTable(selected.id, { guestCount: Math.max(1, v) })}
                    min={1}
                    max={50}
                    unit="名"
                    inputClassName="!py-1 !text-sm"
                  />
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
                  <div className="font-medium">{getSetLabel(selected)}</div>
                </div>
              </div>
            </div>
            {/* セット料金値引き (指示書§1.1 / 追補02 R12: 削除時 0 残留を防ぐ)
                ビデオレビュー D3: 値引き 0 のときは説明文を控えめに */}
            <div className="mt-3 panel p-3">
              <label className="text-xs text-gray-500 block mb-1.5">
                セット料金値引き
                {(selected.setDiscountPerSet ?? 0) > 0 ? ' (1セットあたりの割引額)' : <span className="text-gray-700"> (任意)</span>}
              </label>
              <NumberInput
                value={selected.setDiscountPerSet ?? 0}
                onChange={(v) => updateTable(selected.id, { setDiscountPerSet: v })}
                min={0}
                step={100}
                unit={(selected.setDiscountPerSet ?? 0) > 0 ? '円 / セット' : undefined}
              />
            </div>

            {/* ビデオレビュー D2: 卓詳細からキープボトル表示を削除
                (操作がややこしいため、ボトルキープページに集約) */}

            {/* spec.md §2.2.1: 注文の1行は商品のみ表示。本指名/場内指名/同伴/Help/ヘルプ等の
                指名系 OrderItem は卓詳細モーダルから除外（ホール画面・利用明細で別途表示）。 */}
            {(() => {
              const productOrders = selected.orders.filter((o) => !isChargeOrNominationOrder(o))
              if (productOrders.length === 0) return null
              return (
                <div className="mt-4 panel p-3">
                  <div className="text-gray-500 text-xs mb-2">注文 ({productOrders.length}品)</div>
                  {productOrders.slice(0, 5).map((o, idx) => (
                    <div key={`${o.menuItem.id}-${o.castName ?? ''}-${idx}`} className="flex justify-between text-sm py-0.5">
                      <span className="text-gray-300">{displayOrderName(o)} x{o.quantity}</span>
                      <span>¥{(o.menuItem.price * o.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  {productOrders.length > 5 && (
                    <div className="text-xs text-gray-600 mt-1">...他{productOrders.length - 5}品</div>
                  )}
                </div>
              )
            })()}

            {/* spec.md §2.2.1: 「延長 +30分／+60分」は注文画面側の延長フローと
                同一処理ではないため卓詳細モーダルから削除し、利用明細画面の [延長] に集約。 */}
            <div className="flex gap-2 mt-5 items-center text-xs">
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
                {selected.extensionHistory.map((ex, idx) => {
                  // PDF/Word: 「EX(1) 11:00〜12:00 まで」「EX(2)半 12:00〜12:30 まで」
                  const exLabel = getExtensionLabel(idx, ex.minutes)
                  const d = new Date(ex.timestamp)
                  const startHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                  const endHHMM = addMinutesToHHMM(startHHMM, ex.minutes)
                  return (
                    <div key={ex.id} className="flex justify-between items-center text-xs py-0.5">
                      <span className="text-gray-400">{exLabel} {startHHMM}〜{endHHMM}まで</span>
                      <button onClick={() => handleUndoExtension(ex.id)} className="text-accent flex items-center gap-1"><Undo2 size={10} /> 取消</button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <DarkButton onClick={() => { const id = selected.id; setSelected(null); navigate(`/order?table=${id}&from=${encodeURIComponent('/floor')}`) }} className="flex-1 text-sm flex items-center justify-center gap-1.5">
                <FileText size={15} /> 注文
              </DarkButton>
              <GoldButton onClick={() => { const id = selected.id; setSelected(null); navigate(`/billing?table=${id}`) }} className="flex-1 text-sm flex items-center justify-center gap-1.5">
                <CreditCard size={15} /> 会計
              </GoldButton>
            </div>

            {/* spec.md §2.2.1: 「ご延長交渉」「付け回し」を削除（注文・利用明細側に集約）。 */}
            {user?.role !== 'cast' && (
              <button
                onClick={handleForceCheckout}
                className="w-full mt-2 panel py-2.5 rounded-[10px] font-bold text-sm flex items-center justify-center gap-1.5 text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <X size={15} /> 空き卓にする
              </button>
            )}
          </>
        )}
      </Modal>

      {/* Check-in Modal — ビデオレビュー C1: 入店時は「人数だけ」のシンプル UI に
          キャスト・本指名・同伴・場内指名の設定は卓詳細から後でできるようにした */}
      <Modal
        open={showCheckIn && !!selected}
        onClose={() => { setShowCheckIn(false); setSelected(null) }}
        title={selected ? `${selected.number}卓 入店` : ''}
        size="md"
      >
        {selected && (
          <div className="space-y-5">
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
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCiGuests(n)}
                    className={`py-4 rounded-[10px] text-lg font-bold transition-colors ${
                      ciGuests === n ? 'bg-gold text-primary' : 'panel text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">9 名以上:</span>
                <NumberInput
                  value={ciGuests > 8 ? ciGuests : 0}
                  onChange={(v) => v > 0 && setCiGuests(v)}
                  min={0}
                  max={50}
                  className="w-32"
                  inputClassName="!py-1.5 !text-sm"
                  unit="名"
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 leading-relaxed border-t border-white/10 pt-3">
              ※ 入店後、卓をタップすると担当キャスト・本指名・同伴・場内指名を編集できます。
              全ての変更は会計確定時に確定されます。
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
        title={selected ? `${selected.number}卓 延長` : ''}
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
        onClose={closeRotationModal}
        title={selected ? `付け回し - ${selected.number}卓` : ''}
        size="sm"
      >
        {selected && (
          <>
            <p className="text-sm text-gray-400 mb-4">付け回すキャストを選択してください（複数選択可）</p>
            {freeCasts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">現在空いているキャストはいません</p>
            ) : (
              <div className="space-y-2">
                {freeCasts.map((c) => {
                  const isSelected = rotationSelected.includes(c.name)
                  return (
                    <button
                      key={c.id}
                      onClick={() => setRotationSelected((prev) =>
                        isSelected ? prev.filter((n) => n !== c.name) : [...prev, c.name]
                      )}
                      className={`panel w-full p-3 text-left transition-all flex items-center justify-between ${
                        isSelected ? 'border-gold bg-gold/10' : 'hover:bg-gold/5 hover:border-gold/40'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                          {isSelected && <span className="text-gold">✓</span>}
                          {c.name}
                        </div>
                        <div className="text-xs text-gray-500">→ 卓{selected.number} に付け回し</div>
                      </div>
                      <div className="text-xs text-emerald-400/80 tabular-nums">{formatWaitTime(c.lastAssignedAt)}</div>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <GhostButton onClick={closeRotationModal} className="flex-1">
                キャンセル
              </GhostButton>
              <GoldButton
                onClick={handleAssignCastsBulk}
                disabled={rotationSelected.length === 0}
                className="flex-1"
              >
                {rotationSelected.length > 0 ? `${rotationSelected.length}名を付け回し` : '確定'}
              </GoldButton>
            </div>
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
            <Printer size={15} /> ご延長交渉 {pendingCheckTickets.length}件
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
        {pendingExtend && selected && (() => {
          // ビデオレビュー B7: 延長料金は時間帯セット料金 × 人数 で計算
          const setUnit = selected.startTime ? getSetPriceForTime(selected.startTime) : 0
          const setUnitAdjusted = Math.max(0, setUnit - (selected.setDiscountPerSet ?? 0))
          const fullSetCharge = setUnitAdjusted * selected.guestCount
          const extCharge = pendingExtend.minutes === 60 ? fullSetCharge : Math.round(fullSetCharge / 2)
          // ビデオレビュー C13: 場内指名は基本継承
          const shimeiContinue = selected.mainNominationCastNames.length * 1500
          const banaiContinue = selected.isBanaiShimei ? 500 * selected.assignedCasts.length : 0
          const subtotal = extCharge + shimeiContinue + banaiContinue

          // ビデオレビュー C14: 1 セット目確定金額の表示 (税サ込み)
          const drinkTotal = selected.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
          const setSubtotalCommitted = setUnitAdjusted * selected.guestCount * selected.setCount
          const subtotalAll = setSubtotalCommitted + drinkTotal
          const tax = Math.floor(subtotalAll * storeSettings.taxRate)
          const committedTotal = subtotalAll + tax

          return (
            <div className="space-y-3">
              {/* C14: 1 セット目確定金額 */}
              <div className="panel-gold p-3">
                <div className="text-xs text-gray-300 mb-1">{getSetLabel(selected)} 確定金額 (税サ込)</div>
                <div className="text-xl font-bold text-gold tabular-nums">¥{committedTotal.toLocaleString()}</div>
              </div>

              <div className="panel p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">延長時間</span>
                  <span className="font-bold">+{pendingExtend.minutes}分</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">延長料金 ({selected.guestCount}名 × ¥{setUnitAdjusted.toLocaleString()})</span>
                  <span className="font-bold text-gold tabular-nums">¥{extCharge.toLocaleString()}</span>
                </div>
                {shimeiContinue > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">本指名料 (継承 / {selected.mainNominationCastNames.join(', ')})</span>
                    <span className="tabular-nums text-gray-300">¥{shimeiContinue.toLocaleString()}</span>
                  </div>
                )}
                {banaiContinue > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">場内指名料 (継承 / {selected.assignedCasts.length}名)</span>
                    <span className="tabular-nums text-gray-300">¥{banaiContinue.toLocaleString()}</span>
                  </div>
                )}
                {(shimeiContinue > 0 || banaiContinue > 0) && (
                  <div className="flex justify-between text-sm border-t border-white/10 pt-1.5 mt-1.5">
                    <span className="text-gray-400 font-bold">追加料金 合計</span>
                    <span className="font-bold text-gold tabular-nums">¥{subtotal.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* C12: 本指名 → フリー変更不可。本指名キャストがいる場合はフリー選択肢を出さない
                  クロウさん追加要件: バック帰属先は複数選択可（タップで追加/解除） */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">
                  指名 (バック帰属先) {pendingExtend.castNames.length > 1 && <span className="text-gold ml-1">× {pendingExtend.castNames.length}名</span>}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {selected.mainNominationCastNames.length === 0 && (
                    <CastChip
                      name="フリー"
                      selected={pendingExtend.castNames.length === 0}
                      onClick={() => setPendingExtend({ ...pendingExtend, castNames: [] })}
                    />
                  )}
                  {selected.assignedCasts.map((name) => {
                    const on = pendingExtend.castNames.includes(name)
                    return (
                      <CastChip
                        key={name}
                        name={name}
                        selected={on}
                        onClick={() =>
                          setPendingExtend({
                            ...pendingExtend,
                            castNames: on
                              ? pendingExtend.castNames.filter((n) => n !== name)
                              : [...pendingExtend.castNames, name],
                          })
                        }
                      />
                    )
                  })}
                </div>
                {selected.mainNominationCastNames.length > 0 && (
                  <p className="text-[10px] text-gray-600 mt-1.5">※ 本指名がついている卓はフリーに変更できません（複数指名は可）</p>
                )}
              </div>

              {/* C13: 場内指名は継承するが変更可。トグルで外せる */}
              {selected.isBanaiShimei !== undefined && (
                <div className="panel p-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-400">場内指名 (継承)</span>
                  <button
                    onClick={() => updateTable(selected.id, { isBanaiShimei: !selected.isBanaiShimei })}
                    className={`text-xs px-3 py-1 rounded-full border ${selected.isBanaiShimei ? 'bg-gold/20 border-gold text-gold' : 'bg-white/5 border-white/10 text-gray-500'}`}
                  >
                    {selected.isBanaiShimei ? '✓ 継続' : '解除'}
                  </button>
                </div>
              )}

              <p className="text-sm text-gray-400">延長してよろしいですか?</p>
            </div>
          )
        })()}
      </Modal>

      {/* 「空き卓にする」確認モーダル (誤開卓 / トラブル時の未収管理) */}
      <Modal
        open={!!forceCheckoutPending}
        onClose={() => setForceCheckoutPending(null)}
        title="空き卓にする"
        size="sm"
      >
        <p className="text-sm text-gray-300 mb-4">
          {forceCheckoutPending?.total === 0
            ? '注文がありません。この卓を空き卓に戻しますか？'
            : `¥${forceCheckoutPending?.total.toLocaleString()} を未収として記録して空き卓にします。`}
        </p>
        <div className="flex gap-2">
          <DarkButton onClick={() => setForceCheckoutPending(null)} className="flex-1">キャンセル</DarkButton>
          <button onClick={confirmForceCheckout} className="flex-1 py-3 rounded-lg font-bold text-sm bg-red-500/20 text-red-400 border border-red-500/30">
            空き卓にする
          </button>
        </div>
      </Modal>
    </div>
  )
}

