import { useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { getSetPriceForTime, getSetPriceLabel, nominationLabels, displayOrderName } from '../data/mock'
import type { DiscountLog } from '../data/mock'
import { Printer, CheckCircle, ArrowLeft, CreditCard } from 'lucide-react'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import PrintMethodModal from '../components/PrintMethodModal'

const DISCOUNT_REASON_PRESETS = ['端数カット', 'VIP値引', '店長承認', 'クーポン', 'その他'] as const

type PaymentMethod = 'cash' | 'card' | 'mixed'
type BillingTab = 'total' | 'individual' | 'audit'

export default function BillingPage() {
  const { tables, resetTable, discountLogs, addDiscountLog, addBillingRecord, storeSettings, getNextReceiptNumber, casts } = useStore()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const initialTableId = Number(searchParams.get('table')) || occupiedTables[0]?.id || 0
  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId)
  const [mergeTableIds, setMergeTableIds] = useState<number[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cardInputAmount, setCardInputAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [billingTab, setBillingTab] = useState<BillingTab>('total')
  const [splitCount, setSplitCount] = useState(0)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showPrintChooser, setShowPrintChooser] = useState(false)
  const [receiptName, setReceiptName] = useState('')
  const [receiptPurpose, setReceiptPurpose] = useState('飲食代として')
  const [lastBillingData, setLastBillingData] = useState<{
    tableNumber: string; castNames: string[]; total: number; paymentMethod: PaymentMethod;
    subtotal: number; setFee: number; tax: number; consumptionTax: number; cardFee: number;
    discount: number; orders: { menuItem: { id: number; name: string; price: number }; quantity: number; castName?: string }[];
    nominationLabel: string; startTime: string | null;
    cashAmount: number; cardAmount: number;
    receiptNumber: number; receiptName: string; receiptPurpose: string;
  } | null>(null)

  const receiptRef = useRef<HTMLDivElement>(null)

  const table = tables.find((t) => t.id === selectedTableId)

  if (!table || table.status === 'empty') {
    return (
      <div className="flex flex-col min-h-full">
        <ContextualHeader title="会計" backTo="/floor" />
        <div className="flex-1 p-4 text-center text-gray-500 mt-20">
          <p className="text-base mb-2">会計対象の卓がありません</p>
          <p className="text-sm text-gray-600">ホールから卓を選択してください</p>
          <div className="mt-6 max-w-xs mx-auto">
            <GhostButton onClick={() => setBillingTab('audit')} className="w-full">値引き履歴を表示</GhostButton>
          </div>
        </div>
        {billingTab === 'audit' && <AuditLogView logs={discountLogs} onClose={() => setBillingTab('total')} />}
      </div>
    )
  }

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const discountPerSet = table.setDiscountPerSet ?? 0
  const setPriceAfterDiscount = Math.max(0, setPrice - discountPerSet)
  const setPriceTotal = setPriceAfterDiscount * table.guestCount * table.setCount

  // 指名料・同伴料は自動で orders に含まれているため、ここでは個別に加算しない(指示書§2.3)
  const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)
  const subtotal = drinkTotal  // 内税扱い
  const setFee = setPriceTotal  // 内税扱い
  const taxRate = storeSettings.taxRate
  const cardFeeRate = storeSettings.cardFeeRate
  const subtotalAll = subtotal + setFee  // 全て内税
  const tax = Math.floor(subtotalAll * taxRate)  // 税サ20%外税
  const preCardTotal = subtotalAll + tax - discount
  // 消費税は内税として表示のみ (合計には影響しない)
  const consumptionTax = Math.floor(preCardTotal * 10 / 110)

  const cardFee = paymentMethod === 'card'
    ? Math.floor(preCardTotal * cardFeeRate)
    : paymentMethod === 'mixed'
    ? (() => {
        const cardAmt = Number(cardInputAmount) || 0
        return cardAmt > 0 ? Math.floor(cardAmt * cardFeeRate) : 0
      })()
    : 0

  const total = preCardTotal + cardFee

  const mixedCardAmount = paymentMethod === 'mixed' ? (Number(cardInputAmount) || 0) : 0
  const mixedCardFee = paymentMethod === 'mixed' && mixedCardAmount > 0 ? Math.floor(mixedCardAmount * cardFeeRate) : 0
  const mixedTotalWithFee = paymentMethod === 'mixed' ? preCardTotal + mixedCardFee : total
  const mixedCashAmount = paymentMethod === 'mixed' ? Math.max(0, mixedTotalWithFee - mixedCardAmount) : 0

  const finalTotal = paymentMethod === 'mixed' ? mixedTotalWithFee : total
  const perPerson = splitCount > 0 ? Math.ceil(finalTotal / splitCount) : 0

  const handleComplete = () => {
    if (discount > 0) {
      addDiscountLog({
        id: Date.now(),
        tableNumber: table.number,
        originalTotal: subtotal + setFee + tax + consumptionTax,
        discountAmount: discount,
        reason: discountReason,
        operator: user?.displayName ?? 'スタッフ',
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      })
    }

    // 指示書§5.2: 本指名卓の場合、担当キャストIDを記録 (売上重畳のため)
    const nominatedCastId = table.nomination === 'shimei' && table.castNames[0]
      ? casts.find((c) => c.name === table.castNames[0])?.id
      : undefined

    addBillingRecord({
      id: Date.now(),
      tableNumber: table.number,
      total: finalTotal,
      paymentMethod,
      cashAmount: paymentMethod === 'cash' ? finalTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0,
      cardAmount: paymentMethod === 'card' ? finalTotal : paymentMethod === 'mixed' ? mixedCardAmount : 0,
      cardFee: cardFee > 0 || mixedCardFee > 0 ? (paymentMethod === 'mixed' ? mixedCardFee : cardFee) : undefined,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().slice(0, 10),
      nominatedCastId,
      subtotalBeforeTax: subtotalAll,
      castNamesSnapshot: [...table.castNames],
    })

    setLastBillingData({
      tableNumber: table.number,
      castNames: [...table.castNames],
      total: finalTotal,
      paymentMethod,
      subtotal,
      setFee,
      tax,
      consumptionTax,
      cardFee: paymentMethod === 'mixed' ? mixedCardFee : cardFee,
      discount,
      orders: table.orders.map((o) => ({ menuItem: { id: o.menuItem.id, name: o.menuItem.name, price: o.menuItem.price }, quantity: o.quantity, castName: o.castName })),
      nominationLabel: table.nomination ? nominationLabels[table.nomination] : '',
      startTime: table.startTime,
      cashAmount: paymentMethod === 'cash' ? finalTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0,
      cardAmount: paymentMethod === 'card' ? finalTotal : paymentMethod === 'mixed' ? mixedCardAmount : 0,
      receiptNumber: getNextReceiptNumber(),
      receiptName,
      receiptPurpose,
    })

    resetTable(table.id)
    setShowConfirm(false)
    setShowReceipt(true)
    setDiscount(0)
    setDiscountReason('')
    setSplitCount(0)
  }

  const handlePrintReceipt = () => {
    setShowPrintChooser(true)
  }

  const doPrint = (mode: 'detailed' | 'summary') => {
    setShowPrintChooser(false)
    if (mode === 'summary') document.body.classList.add('print-summary-mode')
    else document.body.classList.remove('print-summary-mode')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('print-summary-mode')
    }, 50)
  }

  const paymentLabel = (m: PaymentMethod) => m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

  if (showReceipt && lastBillingData) {
    const d = lastBillingData
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-4 text-center">
            <CheckCircle size={28} className="mx-auto mb-2 text-emerald-400" />
            <p className="text-emerald-400 font-bold text-sm mb-1">会計完了</p>
            <p className="text-2xl font-bold text-[#d4af37] tabular-nums">¥{d.total.toLocaleString()}</p>
          </div>

          {/* Printable receipt */}
          <div ref={receiptRef} className="bg-white text-black rounded-lg p-6 mb-4 print-receipt">
            <div className="text-center mb-4 border-b border-gray-300 pb-3">
              <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{storeSettings.storeName}</h2>
              {storeSettings.storeAddress && <p className="text-xs text-gray-500">{storeSettings.storeAddress}</p>}
              {storeSettings.storePhone && <p className="text-xs text-gray-500">TEL: {storeSettings.storePhone}</p>}
              <p className="text-xs text-gray-500 mt-1">登録番号: {storeSettings.invoiceNumber}</p>
            </div>
            <div className="text-sm space-y-1 mb-3 border-b border-gray-200 pb-3">
              <div className="flex justify-between"><span>日時:</span><span>{new Date().toLocaleString('ja-JP')}</span></div>
              <div className="flex justify-between"><span>卓番号:</span><span>{d.tableNumber}</span></div>
              <div className="flex justify-between"><span>人数:</span><span>{d.orders.length > 0 ? '-' : '-'}名</span></div>
              <div className="flex justify-between"><span>伝票No:</span><span>{d.receiptNumber}</span></div>
            </div>
            <div className="text-sm mb-3 border-b border-gray-200 pb-3">
              <div className="flex justify-between"><span>宛名:</span><span>{d.receiptName || '　　　　　　　　　'}様</span></div>
              <div className="flex justify-between"><span>但書:</span><span>{d.receiptPurpose}</span></div>
            </div>
            <div className="text-sm space-y-1 mb-3 border-b border-gray-200 pb-3 print-detail-lines">
              <div className="font-bold mb-1">明細</div>
              <div className="flex justify-between"><span>セット料金</span><span>¥{d.setFee.toLocaleString()}</span></div>
              {d.orders.map((o, idx) => (
                <div key={`${o.menuItem.id}-${idx}`} className="flex justify-between">
                  <span>{o.castName ? `${o.menuItem.name}${o.castName}` : o.menuItem.name} x{o.quantity}</span>
                  <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                </div>
              ))}
            </div>
            <div className="text-sm space-y-1 mb-3 border-b border-gray-200 pb-3">
              <div className="flex justify-between"><span>注文小計(内税)</span><span>¥{d.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>セット料金(内税)</span><span>¥{d.setFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>TAX ({(taxRate * 100).toFixed(0)}%)</span><span>¥{d.tax.toLocaleString()}</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>※消費税10%(内税内訳)</span><span>¥{d.consumptionTax.toLocaleString()}</span></div>
              {d.discount > 0 && <div className="flex justify-between text-red-600"><span>値引き</span><span>-¥{d.discount.toLocaleString()}</span></div>}
            </div>
            <div className="text-center mb-3 border-b border-gray-200 pb-3">
              <div className="text-xs text-gray-500 mb-1">合計金額</div>
              <div className="font-bold text-2xl">¥ {d.total.toLocaleString()} -</div>
            </div>
            <div className="text-sm mb-3 border-b border-gray-200 pb-3">
              <div className="flex justify-between"><span>[内訳] 小計</span><span>¥{d.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>TAX({(taxRate * 100).toFixed(0)}%)</span><span>¥{d.tax.toLocaleString()}</span></div>
            </div>
            <p className="text-center text-xs text-gray-500 mt-3">本日もご来店いただき、</p>
            <p className="text-center text-xs text-gray-500">誠にありがとうございました。</p>
          </div>

          {/* Store journal (hidden in customer receipt, shown separately) */}
          <div className="bg-gray-100 text-black rounded-lg p-6 mb-4 print-journal">
            <div className="text-center mb-3 border-b border-gray-300 pb-2">
              <h3 className="text-sm font-bold">【店舗控え】詳細ジャーナル</h3>
              <p className="text-xs text-gray-500">伝票No. {d.receiptNumber}</p>
            </div>
            <div className="text-xs space-y-1 mb-2">
              <div className="flex justify-between"><span>卓:</span><span>{d.tableNumber}</span></div>
              <div className="flex justify-between"><span>担当:</span><span>{d.castNames.join(', ')}</span></div>
              <div className="flex justify-between"><span>日時:</span><span>{new Date().toLocaleString('ja-JP')}</span></div>
            </div>
            <div className="text-xs space-y-1 mb-2 border-t border-gray-300 pt-2">
              <div className="flex justify-between"><span>小計:</span><span>¥{d.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>セット:</span><span>¥{d.setFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>TAX:</span><span>¥{d.tax.toLocaleString()}</span></div>
              <div className="flex justify-between text-gray-600"><span>※消費税(内税内訳):</span><span>¥{d.consumptionTax.toLocaleString()}</span></div>
              {d.cardFee > 0 && <div className="flex justify-between"><span>カード手数料:</span><span>¥{d.cardFee.toLocaleString()}</span></div>}
              {d.discount > 0 && <div className="flex justify-between text-red-600"><span>値引き:</span><span>-¥{d.discount.toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold border-t border-gray-300 pt-1"><span>合計:</span><span>¥{d.total.toLocaleString()}</span></div>
            </div>
            <div className="text-xs space-y-1 border-t border-gray-300 pt-2">
              <div className="flex justify-between font-bold"><span>支払方法:</span><span>{paymentLabel(d.paymentMethod)}</span></div>
              {d.cashAmount > 0 && <div className="flex justify-between"><span>現金:</span><span>¥{d.cashAmount.toLocaleString()}</span></div>}
              {d.cardAmount > 0 && <div className="flex justify-between"><span>カード:</span><span>¥{d.cardAmount.toLocaleString()}</span></div>}
              {d.cardFee > 0 && <div className="flex justify-between"><span>カード手数料(経費3.5%):</span><span>¥{Math.floor(d.cardAmount * 0.035).toLocaleString()}</span></div>}
            </div>
          </div>

          <button onClick={handlePrintReceipt} className="w-full bg-white text-black py-4 rounded-lg text-lg font-bold mb-3 flex items-center justify-center gap-2">
            <Printer size={20} /> 領収書印刷
          </button>
          <button onClick={() => {
            setShowReceipt(false)
            setLastBillingData(null)
            setSelectedTableId(occupiedTables.find((t) => t.id !== table.id)?.id ?? 0)
          }} className="w-full bg-white/5 py-3 rounded-lg text-sm text-gray-400 font-bold">閉じる</button>
        </div>

        <PrintMethodModal
          open={showPrintChooser}
          onClose={() => setShowPrintChooser(false)}
          onPrintDetailed={() => doPrint('detailed')}
          onPrintSummary={() => doPrint('summary')}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        title={`卓 ${table.number} の会計`}
        backTo={`/table/${table.id}`}
        right={
          <select
            value={selectedTableId}
            onChange={(e) => { setSelectedTableId(Number(e.target.value)); setDiscount(0); setDiscountReason(''); setSplitCount(0); setPaymentMethod('cash'); setCardInputAmount('') }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
          >
            {occupiedTables.map((t) => (
              <option key={t.id} value={t.id}>卓 {t.number} ({t.castNames.join(',')})</option>
            ))}
          </select>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {[
          { key: 'total' as const, label: '合計' },
          { key: 'individual' as const, label: '個別明細' },
          { key: 'audit' as const, label: '値引き履歴' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setBillingTab(tab.key)}
            className={`flex-1 py-3 text-sm font-bold tracking-wide transition-colors relative ${
              billingTab === tab.key ? 'text-white' : 'text-gray-500'
            }`}
          >
            {tab.label}
            {billingTab === tab.key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {billingTab === 'audit' ? (
        <AuditLogView logs={discountLogs} />
      ) : billingTab === 'individual' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-500">担当: {table.castNames.join(', ')}</span>
              <span className="text-gray-500">{table.guestCount}名</span>
            </div>
            <h3 className="text-sm font-bold mb-3 text-gray-400">卓 {table.number} 内訳</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>セット料金 <span className="text-gray-600">({table.startTime ? getSetPriceLabel(table.startTime) : '-'})</span></span>
                <span className="tabular-nums">¥{setPriceTotal.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-600 ml-2">
                {discountPerSet > 0
                  ? `¥${setPrice.toLocaleString()} - 値引¥${discountPerSet.toLocaleString()} = ¥${setPriceAfterDiscount.toLocaleString()} x ${table.guestCount}名 x ${table.setCount}セット`
                  : `¥${setPrice.toLocaleString()} x ${table.guestCount}名 x ${table.setCount}セット`}
              </div>
              {table.orders.length > 0 && (
                <>
                  <div className="border-t border-white/5 pt-2 mt-2">
                    <div className="text-xs text-gray-500 mb-1">注文</div>
                  </div>
                  {table.orders.map((o, idx) => (
                    <div key={`${o.menuItem.id}-${idx}`} className="flex justify-between text-sm">
                      <span className="text-gray-300">{displayOrderName(o)}{o.quantity > 1 && <span className="text-gray-500"> x{o.quantity}</span>}</span>
                      <span className="tabular-nums">{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">注文小計(内税)</span><span className="tabular-nums">¥{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">セット料金(内税)</span><span className="tabular-nums">¥{setFee.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TAX（小計+セット×{(taxRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-xs text-gray-600"><span>※消費税10%内訳(内税・合計に含む)</span><span className="tabular-nums">¥{consumptionTax.toLocaleString()}</span></div>
                {(paymentMethod === 'card' && cardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{cardFee.toLocaleString()}</span></div>}
                {(paymentMethod === 'mixed' && mixedCardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>}
                {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span className="tabular-nums">-¥{discount.toLocaleString()}</span></div>}
                <div className="flex justify-between font-bold text-lg pt-1"><span>合計</span><span className="text-[#d4af37] tabular-nums">¥{finalTotal.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Total tab — TRUST 2-column layout */
        <div className="flex-1 overflow-y-auto p-4 pb-4">
          <div className="max-w-6xl mx-auto">
            {/* Table info bar */}
            <div className="panel p-3 mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-gray-300">
                <span className="text-gray-500">担当:</span> {table.castNames.join(', ') || '-'}
              </div>
              <div className="text-xs text-gray-500">
                {table.startTime}〜 / {table.nomination ? nominationLabels[table.nomination] : 'フリー'} / {table.guestCount}名
                {table.setCount > 1 && ` / ${table.setCount}セット`}
              </div>
            </div>

            {/* Central gold total band */}
            <div className="panel-gold p-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#1a1a2e]/70 tracking-wider">合計 (お支払い額)</div>
                {discount > 0 && (
                  <div className="text-xs text-[#1a1a2e]/60 tabular-nums">
                    正規 ¥{(finalTotal + discount).toLocaleString()} − 値引 ¥{discount.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="text-3xl font-extrabold text-[#1a1a2e] tabular-nums">
                ¥{finalTotal.toLocaleString()}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* LEFT column: 明細 / 現金 / 値引 */}
              <div className="space-y-4">
                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">明細</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span>セット料金 <span className="text-gray-500 text-xs">({table.startTime ? getSetPriceLabel(table.startTime) : '-'}) x{table.guestCount}名 x{table.setCount}</span>
                        {discountPerSet > 0 && <span className="text-amber-300 text-xs"> (値引¥{discountPerSet.toLocaleString()}/セット)</span>}
                      </span>
                      <span className="tabular-nums">¥{setPriceTotal.toLocaleString()}</span>
                    </div>
                    {table.orders.map((o, idx) => (
                      <div key={`${o.menuItem.id}-${idx}`} className="flex justify-between">
                        <span className="text-gray-300">{displayOrderName(o)}{o.quantity > 1 && <span className="text-gray-500"> x{o.quantity}</span>}</span>
                        <span className="tabular-nums">{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                      </div>
                    ))}
                    <div className="border-t border-white/5 pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-gray-500"><span>注文小計</span><span className="tabular-nums">¥{subtotal.toLocaleString()}</span></div>
                      <div className="flex justify-between text-gray-500"><span>セット料金</span><span className="tabular-nums">¥{setFee.toLocaleString()}</span></div>
                      <div className="flex justify-between text-gray-500"><span>TAX ({(taxRate * 100).toFixed(0)}%)</span><span className="tabular-nums">¥{tax.toLocaleString()}</span></div>
                      <div className="flex justify-between text-xs text-gray-600"><span>※消費税内訳</span><span className="tabular-nums">¥{consumptionTax.toLocaleString()}</span></div>
                    </div>
                  </div>
                </div>

                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">現金 / 支払方法</h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(['cash', 'card', 'mixed'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setPaymentMethod(m); setCardInputAmount('') }}
                        className={`py-2.5 rounded-lg text-sm font-bold tracking-wide border transition-colors ${
                          paymentMethod === m
                            ? 'bg-[#d4af37] text-[#1a1a2e] border-[#d4af37]'
                            : 'bg-white/5 border-white/10 text-gray-400'
                        }`}
                      >
                        {m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === 'mixed' && (
                    <div className="mt-2">
                      <label className="text-xs text-gray-500 block mb-1.5">カード決済金額</label>
                      <input
                        type="number"
                        value={cardInputAmount}
                        onChange={(e) => setCardInputAmount(e.target.value)}
                        placeholder="カード金額を入力"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums"
                      />
                      {mixedCardAmount > 0 && (
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex justify-between text-blue-300"><span>カード手数料</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">カード支払</span><span className="tabular-nums">¥{mixedCardAmount.toLocaleString()}</span></div>
                          <div className="flex justify-between font-bold"><span>現金支払</span><span className="tabular-nums">¥{mixedCashAmount.toLocaleString()}</span></div>
                        </div>
                      )}
                    </div>
                  )}
                  {paymentMethod === 'card' && (
                    <div className="text-xs text-gray-500 mt-1">
                      ※外部端末(S1EP)に ¥{finalTotal.toLocaleString()} を手入力
                    </div>
                  )}
                </div>

                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">値引き (理由必須)</h3>
                  <input
                    type="number"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                    placeholder="値引額"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 tabular-nums"
                  />
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {DISCOUNT_REASON_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountReason(p)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          discountReason === p
                            ? 'bg-[#d4af37] text-[#1a1a2e] border-[#d4af37]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="値引き理由（必須・自由記入可）"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                  {discount > 0 && !discountReason.trim() && (
                    <p className="text-xs text-red-400 mt-2">※値引きを行うには理由の入力が必須です</p>
                  )}
                </div>
              </div>

              {/* RIGHT column: カード / 割り勘 / 合算 / 領収書 */}
              <div className="space-y-4">
                {(paymentMethod === 'card' || paymentMethod === 'mixed') && (cardFee > 0 || mixedCardFee > 0) && (
                  <div className="panel p-4 border-blue-500/20">
                    <h3 className="text-xs text-blue-300 tracking-wider mb-2 flex items-center gap-1.5">
                      <CreditCard size={14} /> カード手数料 (+{(cardFeeRate * 100).toFixed(0)}%)
                    </h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">手数料加算</span>
                      <span className="tabular-nums text-blue-300">¥{(paymentMethod === 'mixed' ? mixedCardFee : cardFee).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">割り勘アシスト</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSplitCount(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                          splitCount === n
                            ? 'bg-white text-black'
                            : 'bg-white/5 border border-white/10 text-gray-400'
                        }`}
                      >
                        {n === 0 ? 'なし' : `${n}人`}
                      </button>
                    ))}
                  </div>
                  {splitCount > 0 && (
                    <div className="mt-2 text-sm font-bold tabular-nums text-[#d4af37]">
                      1人あたり: ¥{perPerson.toLocaleString()}
                    </div>
                  )}
                </div>

                {occupiedTables.length > 1 && (
                  <div className="panel p-4">
                    <h3 className="text-xs text-gray-400 tracking-wider mb-2">合算会計</h3>
                    <div className="flex flex-wrap gap-2">
                      {occupiedTables.filter((t) => t.id !== selectedTableId).map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 text-sm bg-white/5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/10">
                          <input
                            type="checkbox"
                            checked={mergeTableIds.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) setMergeTableIds((prev) => [...prev, t.id])
                              else setMergeTableIds((prev) => prev.filter((id) => id !== t.id))
                            }}
                          />
                          卓{t.number}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">領収書情報</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">宛名</label>
                      <input
                        type="text"
                        value={receiptName}
                        onChange={(e) => setReceiptName(e.target.value)}
                        placeholder="宛名（空欄可）"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">但書</label>
                      <input
                        type="text"
                        value={receiptPurpose}
                        onChange={(e) => setReceiptPurpose(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {billingTab === 'total' && (
        <BottomActionBar
          leftLabel={discount > 0 ? '値引き後合計' : '合計'}
          leftValue={`¥${finalTotal.toLocaleString()}`}
          center={
            <DangerButton
              onClick={() => setShowConfirm(true)}
              disabled={discount > 0 && !discountReason.trim()}
              className="text-base px-6 flex items-center gap-2"
            >
              <CheckCircle size={18} /> 会計確定
            </DangerButton>
          }
          right={
            <DarkButton onClick={() => navigate(`/table/${table.id}`)} className="text-sm">
              明細へ戻る
            </DarkButton>
          }
        />
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-lg w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-3">会計確定</h2>
            <p className="text-sm text-gray-400 mb-2">卓 {table.number} の会計を確定しますか？</p>
            <p className="text-2xl font-bold text-[#d4af37] mb-2 tabular-nums">¥{finalTotal.toLocaleString()}</p>
            {splitCount > 0 && <p className="text-sm text-gray-400 mb-2 tabular-nums">割り勘: ¥{perPerson.toLocaleString()} x {splitCount}人</p>}
            <p className="text-sm text-gray-500 mb-2">支払方法: {paymentLabel(paymentMethod)}</p>
            {paymentMethod === 'mixed' && mixedCardAmount > 0 && (
              <p className="text-sm text-gray-500 mb-2 tabular-nums">現金: ¥{mixedCashAmount.toLocaleString()} / カード: ¥{mixedCardAmount.toLocaleString()}</p>
            )}
            {(cardFee > 0 || mixedCardFee > 0) && <p className="text-sm text-blue-400 mb-2 tabular-nums">カード手数料: ¥{(paymentMethod === 'mixed' ? mixedCardFee : cardFee).toLocaleString()}</p>}
            {discount > 0 && <p className="text-sm text-red-400 mb-4 tabular-nums">値引き: -¥{discount.toLocaleString()} ({discountReason})</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">戻る</button>
              <button onClick={handleComplete} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AuditLogView({ logs, onClose }: { logs: DiscountLog[]; onClose?: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      {onClose && (
        <button onClick={onClose} className="text-sm text-gray-500 mb-3 flex items-center gap-1 hover:text-white transition-colors">
          <ArrowLeft size={14} /> 戻る
        </button>
      )}
      <h3 className="text-sm font-bold mb-3 text-gray-400">値引き監査ログ</h3>
      <p className="text-xs text-gray-600 mb-3">※このログは編集・削除できません</p>
      {logs.length === 0 ? (
        <div className="text-center text-gray-600 mt-8">
          <p>値引き履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold">卓 {log.tableNumber}</span>
                <span className="text-gray-500 text-xs">{log.timestamp}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">正規料金: </span>
                  <span className="tabular-nums">¥{log.originalTotal.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">値引き額: </span>
                  <span className="text-red-400 tabular-nums">-¥{log.discountAmount.toLocaleString()}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">理由: </span>
                  <span>{log.reason}</span>
                </div>
                <div>
                  <span className="text-gray-500">操作者: </span>
                  <span>{log.operator}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
