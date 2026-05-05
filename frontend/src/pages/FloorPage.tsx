import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { tablesApi } from '../api/tables'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  EXTENSION_OPTIONS,
  SET_DURATION_MINUTES,
  chargeItems,
  displayOrderName,
} from '../data/mock'
import { getNominationBadge, getNominationLabel } from '../utils/nomination'
import { getSetLabel } from '../utils/setCountLabel'
import { Clock, Users, Plus, Printer, RotateCcw, ChevronRight, FileText, CreditCard, Undo2, X } from 'lucide-react'
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
  const { tables, casts, setCasts, updateTable, flMetrics, storeSettings, moveCast, resetTable, addBillingRecord } = useStore()
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
  const [forceCheckoutPending, setForceCheckoutPending] = useState<{ total: number } | null>(null)
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

    // 追補02 R1/R9: 本指名・場内指名・同伴は排他ではなく組み合わせ可能。
    //   本指名 → 本指名料 (本指名担当に紐付け)
    //   場内指名 → 場内指名料 (担当キャスト全員分)
    //   同伴 → 同伴料 (担当キャスト全員分、本指名と共存可)
    const pushChargeOrder = (chargeId: 'shimei' | 'banai' | 'douhan', castName?: string) => {
      const chargeItem = chargeItems.find((c) => c.id === chargeId)
      if (!chargeItem) return
      autoOrders.push({
        menuItem: {
          id: nextChargeId++,
          name: chargeItem.label, price: chargeItem.price,
          cost: chargeItem.cost ?? 300, castBack: 0,
          category: 'guest' as const, subcategory: 'warimono' as const,
        },
        quantity: 1,
        castName,
      })
    }
    // R24: 本指名担当が複数いる場合、各人分の本指名料を orders に計上
    for (const name of ciMainNominations) {
      pushChargeOrder('shimei', name)
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
    updateTable(selected.id, checkInPatch)
    tablesApi.update(selected.id, checkInPatch).catch(console.error)
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
    setPendingExtend({ minutes, castName: selected.mainNominationCastNames[0] ?? selected.assignedCasts[0] })
  }

  const confirmExtend = () => {
    if (!selected || !pendingExtend) return
    const { minutes, castName } = pendingExtend
    // ビデオレビュー B7: 延長料金は固定額ではなく、時間帯セット料金 × 人数 で計算
    //   例: 8 名様、20:00〜セット (4,000円/名) → +60分延長で ¥32,000
    //   30 分延長は半額相当
    const setUnit = selected.startTime ? getSetPriceForTime(selected.startTime) : 0
    const setUnitAdjusted = Math.max(0, setUnit - (selected.setDiscountPerSet ?? 0))
    const fullSetCharge = setUnitAdjusted * selected.guestCount
    const charge = minutes === 60 ? fullSetCharge : Math.round(fullSetCharge / 2)
    const entryId = Date.now()
    const orderId = 2000 + entryId  // 延長料金は注文IDの2000番台
    const newEntry = {
      id: entryId,
      minutes,
      timestamp: new Date().toISOString(),
      nominatedCastName: castName,
      orderMenuItemId: orderId,
    } as const
    // 延長料金注文（ビデオレビュー B7: 人数連動）
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

    // ISSUE-004 反映:
    //   - 本指名キャストのみ assignedCasts に継承、それ以外は待機戻し（フリー・場内指名は継承しない）
    //   - 同伴・場内指名フラグは解除
    //   - orders はクリア（デフォルト動作）→ 本指名料を再計上 + 延長料金を追加
    const continuing = selected.mainNominationCastNames
    const leaving = selected.assignedCasts.filter((n) => !continuing.includes(n))
    for (const name of leaving) {
      moveCast(name, null)
    }
    const shimei = chargeItems.find((c) => c.id === 'shimei')
    const newOrders: Table['orders'] = []
    // クロウレビュー対応: ハードコード `901 + idx` を Date.now() ベース採番に変更
    //   extensionOrder.menuItem.id (= 2000 + entryId) と衝突しないよう十分大きな値域
    let nextChargeId = Date.now()
    if (shimei) {
      continuing.forEach((name) => {
        newOrders.push({
          menuItem: {
            id: nextChargeId++,
            name: shimei.label,
            price: shimei.price,
            cost: shimei.cost ?? 300,
            castBack: 0,
            category: 'guest' as const,
            subcategory: 'warimono' as const,
          },
          quantity: 1,
          castName: name,
        })
      })
    }
    newOrders.push(extensionOrder)

    const extendPatch = {
      status: 'occupied' as const,
      extensionHistory: [...(selected.extensionHistory ?? []), newEntry],
      orders: newOrders,
      assignedCasts: continuing,
      isDouhan: undefined,
      isBanaiShimei: undefined,
    }
    updateTable(selected.id, extendPatch)
    tablesApi.update(selected.id, extendPatch).catch(console.error)
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

  /**
   * 追補02 R7: ご延長交渉 (INTERIM CHECK SHEET) サーマル印字
   *
   * 旧「チェック票」を画像 IMG_1033 準拠のレイアウトに刷新:
   *   - ヘッダー「【ご延長確認】【ただいまの料金】 INTERIM CHECK SHEET」
   *   - 【只今の料金】ブロック: キャスト名付き内訳 + 合計 (税サ別)
   *   - 【ご延長予算(目安)】ブロック: 30 分の場合 / 60 分の場合
   *   - 注記 ※ドリンク、指名料は別途 / ※税サ別
   */
  const handlePrintCheckTicket = (table: Table) => {
    const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
    const discountPerSet = table.setDiscountPerSet ?? 0
    const adjustedSetPrice = Math.max(0, setPrice - discountPerSet)
    const setSubtotal = adjustedSetPrice * table.guestCount * table.setCount

    // ─── 内訳 (指名料 / ドリンク / チャージ 等に分類) ───
    const nominationOrders = table.orders.filter((o) => /指名|同伴|シングルチャージ/.test(o.menuItem.name))
    const castDrinkOrders = table.orders.filter((o) => o.menuItem.category === 'cast')
    const guestDrinkOrders = table.orders.filter((o) => o.menuItem.category === 'guest' && !nominationOrders.includes(o))

    const nominationTotal = nominationOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
    const castDrinkTotal = castDrinkOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
    const guestDrinkTotal = guestDrinkOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)

    const grandTotal = setSubtotal + nominationTotal + castDrinkTotal + guestDrinkTotal

    // 延長予算試算: 時間帯別セット料金 × 人数 × (30分=0.5セット、60分=1セット)
    // 本指名がいれば本指名料も継続で加算
    const nominationContinueCharge = table.mainNominationCastNames.length * 1500
    const banaiContinueCharge = table.isBanaiShimei ? 500 * table.assignedCasts.length : 0
    const ext30Price = Math.round(adjustedSetPrice * table.guestCount * 0.5) + nominationContinueCharge + banaiContinueCharge
    const ext60Price = adjustedSetPrice * table.guestCount + nominationContinueCharge + banaiContinueCharge

    const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

    const castNameSuffix = (o: typeof table.orders[0]) => (o.castName ? `（${o.castName}）` : '（ゲスト）')

    const body = `
      <div class="title-block">
        <div class="title-ja">【 ご延長確認 】【 ただいまの料金 】</div>
        <div class="title-en">INTERIM CHECK SHEET</div>
      </div>
      <div class="divider-double"></div>
      <div class="row"><span>卓番:</span><span>${table.number}</span></div>
      <div class="row"><span>現在時刻:</span><span>${now}</span></div>

      <div class="section-title">─── 【 只今の料金 】 ───</div>
      <div class="section-sub">（内訳）</div>
      <div class="row"><span>セット(${table.setCount * SET_DURATION_MINUTES}分)</span><span>¥ ${setSubtotal.toLocaleString()}</span></div>
      ${nominationOrders.map((o) => `<div class="row"><span>${o.menuItem.name}${castNameSuffix(o)}</span><span>¥ ${(o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
      ${castDrinkOrders.map((o) => `<div class="row"><span>Lドリンク${castNameSuffix(o)}</span><span>¥ ${(o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
      ${guestDrinkOrders.map((o) => `<div class="row"><span>ドリンク${castNameSuffix(o)}</span><span>¥ ${(o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
      <div class="divider"></div>
      <div class="row total"><span>合計 (Total)</span><span>¥ ${grandTotal.toLocaleString()}</span></div>
      <div class="note">（税サ別）</div>

      <div class="section-title">─── 【 ご延長予算 （目安）】 ───</div>
      <div class="hint">ご延長の確認をさせていただきます。</div>
      <div class="row"><span>30 分の場合</span><span>¥ ${ext30Price.toLocaleString()}</span></div>
      <div class="row"><span>60 分の場合</span><span>¥ ${ext60Price.toLocaleString()}</span></div>
      <div class="note-list">
        <div>※ドリンク、指名料は別途</div>
        <div>※税サ別</div>
      </div>

      <div class="divider-double"></div>
      <div class="footer">ご来店ありがとうございます。</div>
      <div class="footer store-name">${storeSettings.storeName}</div>
      <div class="divider-dash"></div>
    `
    const extraStyles = `
      body { max-width: 300px; margin: 0 auto; font-family: 'Noto Sans JP', sans-serif; }
      .title-block { text-align: center; margin: 6px 0; }
      .title-ja { font-size: 14px; font-weight: bold; }
      .title-en { font-size: 11px; letter-spacing: 0.1em; margin-top: 2px; }
      .divider-double { border-top: 2px double #000; margin: 8px 0; }
      .divider { border-top: 1px solid #000; margin: 6px 0; }
      .divider-dash { border-top: 1px dashed #ccc; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; border: none; padding: 0; text-align: left; }
      .section-title { text-align: center; font-size: 13px; font-weight: bold; margin: 10px 0 4px; }
      .section-sub { text-align: center; font-size: 11px; color: #666; margin-bottom: 4px; }
      .total { font-size: 15px; font-weight: bold; margin-top: 4px; }
      .note { text-align: right; font-size: 10px; color: #666; margin-top: 2px; }
      .hint { font-size: 11px; color: #444; margin-bottom: 6px; }
      .note-list { margin-top: 8px; font-size: 10px; color: #555; }
      .footer { text-align: center; font-size: 11px; }
      .store-name { font-weight: bold; margin-top: 2px; }
    `
    openPrintWindow(body, 'ご延長交渉', { width: 350, height: 600, extraStyles })
  }

  // 50分経過で未印字の「ご延長交渉」対象卓 (追補02 R7-1: 旧「チェック票」)
  // 追補03 R21: 自動「ご延長交渉」印字機能は削除 (チェック票と重複)。
  // 手動でのご延長交渉印字は卓詳細の「ご延長交渉」ボタンから可能。
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

  const handleAssignCast = (castName: string) => {
    if (!selected) return
    if (selected.assignedCasts.includes(castName)) return
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
            ご延長交渉 {pendingCheckTickets.length}件 (50分経過)
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

      {/* Table Grid — ビデオレビュー C18: 並び順は固定 (id 昇順)
          時間で入れ替わると目で覚えた配置と合わなくなり混乱する。
          状態は色 (statusStyle) で表現。 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...tables].sort((a, b) => a.id - b.id).map((table) => {
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

              {/* 指名タイプ編集 (C5: フリー⇄本指名/同伴/場内指名 切替) */}
              <div className="panel p-3">
                <div className="text-gray-500 text-xs mb-2">指名タイプ</div>
                <div className="text-xs text-gold mb-2">{getNominationLabel(selected)}</div>
                {selected.assignedCasts.length === 0 ? (
                  <div className="text-xs text-gray-500">担当を追加すると本指名を指定できます</div>
                ) : (
                  <>
                    <div className="text-[10px] text-gray-500 mb-1">本指名担当 (複数選択可)</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selected.assignedCasts.map((name) => {
                        const isMain = selected.mainNominationCastNames.includes(name)
                        return (
                          <button
                            key={name}
                            onClick={() => updateTable(selected.id, {
                              mainNominationCastNames: isMain
                                ? selected.mainNominationCastNames.filter((n) => n !== name)
                                : [...selected.mainNominationCastNames, name],
                            })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${isMain ? 'bg-gold/20 border-gold text-gold' : 'bg-white/5 border-white/10 text-gray-400'}`}
                          >
                            {isMain ? '★ ' : ''}{name}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => updateTable(selected.id, { isDouhan: !selected.isDouhan })}
                    className={`text-xs px-2.5 py-1 rounded-full border ${selected.isDouhan ? 'bg-gold/20 border-gold text-gold' : 'bg-white/5 border-white/10 text-gray-400'}`}
                  >
                    {selected.isDouhan ? '✓ ' : ''}同伴
                  </button>
                  {/* ビデオレビュー N7: 本指名と場内指名は排他 (本指名キャストには場内指名つかない) */}
                  <button
                    onClick={() => updateTable(selected.id, { isBanaiShimei: !selected.isBanaiShimei })}
                    disabled={selected.mainNominationCastNames.length > 0}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      selected.mainNominationCastNames.length > 0
                        ? 'bg-white/5 border-white/10 text-gray-700 cursor-not-allowed'
                        : selected.isBanaiShimei
                        ? 'bg-gold/20 border-gold text-gold'
                        : 'bg-white/5 border-white/10 text-gray-400'
                    }`}
                    title={selected.mainNominationCastNames.length > 0 ? '本指名がある卓には場内指名はつきません' : ''}
                  >
                    {selected.isBanaiShimei ? '✓ ' : ''}場内指名
                  </button>
                </div>
                {selected.mainNominationCastNames.length > 0 && selected.isBanaiShimei && (
                  <div className="text-[10px] text-amber-400 mt-1">
                    ※ 本指名がついているため場内指名は外してください
                  </div>
                )}
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
                  {/* ビデオレビュー C9-C11: 1セット目 / EX1半 / EX1 / EX2半 / EX2 表記 */}
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
                onClick={() => handlePrintCheckTicket(selected)}
                className="flex-1 py-3 rounded-[10px] font-bold text-sm flex items-center justify-center gap-1.5 transition-colors panel text-gray-300"
              >
                <Printer size={15} /> ご延長交渉
              </button>
              <button onClick={() => setShowRotation(true)} className="flex-1 panel py-3 rounded-[10px] font-bold text-sm flex items-center justify-center gap-1.5 text-gray-300 hover:bg-white/10 transition-colors">
                <RotateCcw size={15} /> 付け回し
              </button>
            </div>
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

      {/* Check-in Modal — Fix A (ふうや指摘):
          入店時にキャスト・本指名・同伴・場内指名を選択できる UI を復活。
          state は元から残っていた (ciCastNames / ciMainNominations / ciIsDouhan
          / ciIsBanaiShimei) ため UI のみ再実装。confirmCheckIn 内ロジックは既に
          chargeItems を auto order に追加する形になっている。 */}
      <Modal
        open={showCheckIn && !!selected}
        onClose={() => { setShowCheckIn(false); setSelected(null) }}
        title={selected ? `卓 ${selected.number} 入店` : ''}
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

            {/* 担当キャスト */}
            <div>
              <label className="text-sm text-gray-200 block mb-2 font-medium">
                担当キャスト <span className="text-xs text-gray-500">(複数選択可、任意)</span>
              </label>
              {activeCasts.length === 0 ? (
                <p className="text-xs text-gray-500">出勤中のキャストがいません。入店後に「対応中キャスト編集」から追加できます。</p>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {activeCasts.map((c) => {
                    const selected = ciCastNames.includes(c.name)
                    return (
                      <CastChip
                        key={c.id}
                        name={c.name}
                        selected={selected}
                        onClick={() => {
                          if (selected) {
                            // 解除時は本指名・場内指名から外す
                            setCiCastNames((prev) => prev.filter((n) => n !== c.name))
                            setCiMainNominations((prev) => prev.filter((n) => n !== c.name))
                          } else {
                            setCiCastNames((prev) => [...prev, c.name])
                          }
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* 本指名 (担当キャストの中から複数選択可) */}
            {ciCastNames.length > 0 && (
              <div>
                <label className="text-sm text-gray-200 block mb-2 font-medium">
                  本指名 <span className="text-xs text-gray-500">(担当キャストから選択、複数可)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {ciCastNames.map((name) => {
                    const selected = ciMainNominations.includes(name)
                    return (
                      <CastChip
                        key={name}
                        name={name}
                        selected={selected}
                        onClick={() => {
                          if (selected) {
                            setCiMainNominations((prev) => prev.filter((n) => n !== name))
                          } else {
                            setCiMainNominations((prev) => [...prev, name])
                          }
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 同伴 / 場内指名 トグル */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCiIsDouhan((v) => !v)}
                className={`py-3 rounded-[10px] text-sm font-bold transition-colors ${
                  ciIsDouhan ? 'bg-gold text-primary' : 'panel text-gray-300 hover:bg-white/10'
                }`}
              >
                {ciIsDouhan ? '✓ 同伴あり' : '同伴'}
              </button>
              <button
                onClick={() => setCiIsBanaiShimei((v) => !v)}
                disabled={ciCastNames.length === 0}
                className={`py-3 rounded-[10px] text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  ciIsBanaiShimei ? 'bg-gold text-primary' : 'panel text-gray-300 hover:bg-white/10'
                }`}
                title={ciCastNames.length === 0 ? '担当キャスト選択後に有効' : ''}
              >
                {ciIsBanaiShimei ? '✓ 場内指名あり' : '場内指名'}
              </button>
            </div>

            <div className="text-xs text-gray-500 leading-relaxed border-t border-white/10 pt-3">
              ※ 担当キャスト・本指名・同伴・場内指名は入店後の卓編集からも変更できます。
              指名料・同伴料は入店時に自動計算され注文として記録されます。
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

              {/* C12: 本指名 → フリー変更不可。本指名キャストがいる場合はフリー選択肢を出さない */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">指名 (バック帰属先)</label>
                <div className="flex gap-2 flex-wrap">
                  {selected.mainNominationCastNames.length === 0 && (
                    <CastChip
                      name="フリー"
                      selected={!pendingExtend.castName}
                      onClick={() => setPendingExtend({ ...pendingExtend, castName: undefined })}
                    />
                  )}
                  {selected.assignedCasts.map((name) => (
                    <CastChip
                      key={name}
                      name={name}
                      selected={pendingExtend.castName === name}
                      onClick={() => setPendingExtend({ ...pendingExtend, castName: name })}
                    />
                  ))}
                </div>
                {selected.mainNominationCastNames.length > 0 && (
                  <p className="text-[10px] text-gray-600 mt-1.5">※ 本指名がついている卓はフリーに変更できません</p>
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

