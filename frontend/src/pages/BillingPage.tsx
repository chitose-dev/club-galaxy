import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { getSetPriceForTime, getSetPriceLabel, nominationLabels } from '../data/mock'
import type { DiscountLog } from '../data/mock'
import { Printer, CheckCircle, ArrowLeft } from 'lucide-react'

type PaymentMethod = 'cash' | 'card' | 'mixed'
type BillingTab = 'total' | 'individual' | 'audit'

export default function BillingPage() {
  const { tables, resetTable, discountLogs, addDiscountLog, addBillingRecord, chargeItems, storeSettings, getNextReceiptNumber } = useStore()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

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
  const [receiptName, setReceiptName] = useState('')
  const [receiptPurpose, setReceiptPurpose] = useState('飲食代として')
  const [lastBillingData, setLastBillingData] = useState<{
    tableNumber: string; castNames: string[]; total: number; paymentMethod: PaymentMethod;
    subtotal: number; setFee: number; tax: number; consumptionTax: number; cardFee: number;
    discount: number; orders: { menuItem: { id: number; name: string; price: number }; quantity: number }[];
    nominationLabel: string; startTime: string | null;
    cashAmount: number; cardAmount: number;
    receiptNumber: number; receiptName: string; receiptPurpose: string;
  } | null>(null)

  const receiptRef = useRef<HTMLDivElement>(null)

  const table = tables.find((t) => t.id === selectedTableId)

  if (!table || table.status === 'empty') {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 text-center text-gray-500 mt-20">
          <p className="text-base mb-2">会計対象の卓がありません</p>
          <p className="text-sm text-gray-600">フロアから卓を選択してください</p>
        </div>
        <div className="p-4">
          <button onClick={() => setBillingTab('audit')} className="w-full bg-white/5 py-3 rounded-lg text-sm text-gray-500 font-bold">値引き履歴を表示</button>
        </div>
        {billingTab === 'audit' && <AuditLogView logs={discountLogs} onClose={() => setBillingTab('total')} />}
      </div>
    )
  }

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const setPriceTotal = setPrice * table.guestCount * table.setCount

  const nominationCharge = (() => {
    if (!table.nomination) return 0
    const found = chargeItems.find((c) => c.id === table.nomination)
    return found?.price ?? 0
  })()

  const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)
  const subtotal = drinkTotal + nominationCharge
  const setFee = setPriceTotal
  const taxRate = storeSettings.taxRate
  const cardFeeRate = storeSettings.cardFeeRate
  const tax = Math.floor(subtotal * taxRate)
  const consumptionTax = Math.floor((subtotal + setFee + tax) * 0.1)
  const preCardTotal = subtotal + setFee + tax + consumptionTax - discount

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
      orders: table.orders.map((o) => ({ menuItem: { id: o.menuItem.id, name: o.menuItem.name, price: o.menuItem.price }, quantity: o.quantity })),
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
    window.print()
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
            <div className="text-sm space-y-1 mb-3 border-b border-gray-200 pb-3">
              <div className="font-bold mb-1">明細</div>
              <div className="flex justify-between"><span>セット料金</span><span>¥{d.setFee.toLocaleString()}</span></div>
              {d.nominationLabel && <div className="flex justify-between"><span>{d.nominationLabel}</span><span>(指名料込)</span></div>}
              {d.orders.map((o) => (
                <div key={o.menuItem.id} className="flex justify-between">
                  <span>{o.menuItem.name} x{o.quantity}</span>
                  <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                </div>
              ))}
            </div>
            <div className="text-sm space-y-1 mb-3 border-b border-gray-200 pb-3">
              <div className="flex justify-between"><span>小計</span><span>¥{d.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>セット料金</span><span>¥{d.setFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>TAX ({(taxRate * 100).toFixed(0)}%)</span><span>¥{d.tax.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>消費税 (10%)</span><span>¥{d.consumptionTax.toLocaleString()}</span></div>
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
              <div className="flex justify-between"><span>消費税:</span><span>¥{d.consumptionTax.toLocaleString()}</span></div>
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
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table selector */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-xs text-gray-500">卓:</span>
        <select value={selectedTableId} onChange={(e) => { setSelectedTableId(Number(e.target.value)); setDiscount(0); setDiscountReason(''); setSplitCount(0); setPaymentMethod('cash'); setCardInputAmount('') }} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm">
          {occupiedTables.map((t) => (
            <option key={t.id} value={t.id}>{t.number} ({t.castNames.join(',')})</option>
          ))}
        </select>
      </div>

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
              <div className="text-xs text-gray-600 ml-2">¥{setPrice.toLocaleString()} x {table.guestCount}名 x {table.setCount}セット</div>
              {nominationCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{table.nomination ? nominationLabels[table.nomination] : ''}</span>
                  <span className="tabular-nums">¥{nominationCharge.toLocaleString()}</span>
                </div>
              )}
              {table.orders.length > 0 && (
                <>
                  <div className="border-t border-white/5 pt-2 mt-2">
                    <div className="text-xs text-gray-500 mb-1">ドリンク注文</div>
                  </div>
                  {table.orders.map((o) => (
                    <div key={o.menuItem.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">{o.menuItem.name}{o.quantity > 1 && <span className="text-gray-500"> x{o.quantity}</span>}</span>
                      <span className="tabular-nums">{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">小計（ドリンク+指名料）</span><span className="tabular-nums">¥{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">セット料金</span><span className="tabular-nums">¥{setFee.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TAX（小計×{(taxRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">消費税（(小計+セット+TAX)×10%）</span><span className="tabular-nums">¥{consumptionTax.toLocaleString()}</span></div>
                {(paymentMethod === 'card' && cardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{cardFee.toLocaleString()}</span></div>}
                {(paymentMethod === 'mixed' && mixedCardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>}
                {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span className="tabular-nums">-¥{discount.toLocaleString()}</span></div>}
                <div className="flex justify-between font-bold text-lg pt-1"><span>合計</span><span className="text-[#d4af37] tabular-nums">¥{finalTotal.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Total tab */
        <div className="flex-1 overflow-y-auto p-4 pb-6">
          {/* Table info */}
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">担当: {table.castNames.join(', ')}</span>
              <span className="text-gray-500">{table.guestCount}名</span>
            </div>
            <div className="text-xs text-gray-600">
              {table.startTime}〜 / {table.nomination ? nominationLabels[table.nomination] : 'フリー'}
              {table.setCount > 1 && ` / ${table.setCount}セット`}
            </div>
          </div>

          {/* Detail breakdown */}
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-400">明細</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>セット料金 ({table.startTime ? getSetPriceLabel(table.startTime) : '-'})<span className="text-gray-600"> x{table.guestCount}名 x{table.setCount}セット</span></span>
                <span className="tabular-nums">¥{setPriceTotal.toLocaleString()}</span>
              </div>
              {nominationCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{table.nomination ? nominationLabels[table.nomination] : ''}</span>
                  <span className="tabular-nums">¥{nominationCharge.toLocaleString()}</span>
                </div>
              )}
              {table.orders.map((o) => (
                <div key={o.menuItem.id} className="flex justify-between text-sm">
                  <span className="text-gray-300">{o.menuItem.name}{o.quantity > 1 && <span className="text-gray-500"> x{o.quantity}</span>}</span>
                  <span className="tabular-nums">{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                </div>
              ))}
              <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">小計（ドリンク+指名料）</span><span className="tabular-nums">¥{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">セット料金</span><span className="tabular-nums">¥{setFee.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TAX（小計×{(taxRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">税抜合計</span><span className="tabular-nums">¥{(subtotal + setFee + tax).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">消費税（税抜合計×10%）</span><span className="tabular-nums">¥{consumptionTax.toLocaleString()}</span></div>
                {(paymentMethod === 'card' && cardFee > 0) && (
                  <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{cardFee.toLocaleString()}</span></div>
                )}
                {(paymentMethod === 'mixed' && mixedCardFee > 0) && (
                  <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>
                )}
                <div className="border-t border-white/10 pt-1 flex justify-between font-bold"><span>合計</span><span className="text-[#d4af37] tabular-nums">¥{(finalTotal + discount).toLocaleString()}</span></div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span className="tabular-nums">-¥{discount.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold text-red-400"><span>値引き後合計</span><span className="tabular-nums">¥{finalTotal.toLocaleString()}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="flex gap-2 mb-4">
            {(['cash', 'card', 'mixed'] as const).map((m) => (
              <button key={m} onClick={() => { setPaymentMethod(m); setCardInputAmount('') }} className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-colors ${paymentMethod === m ? 'bg-white text-black border-white' : 'border-white/10 text-gray-500'}`}>
                {m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'}
              </button>
            ))}
          </div>

          {/* Card fee notice */}
          {paymentMethod === 'card' && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-400 font-bold mb-1">カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）: ¥{cardFee.toLocaleString()}</p>
              <p className="text-xs text-gray-500">※外部端末(S1EP)に ¥{finalTotal.toLocaleString()} を手入力してください</p>
            </div>
          )}

          {/* Mixed payment */}
          {paymentMethod === 'mixed' && (
            <div className="bg-white/5 rounded-lg p-4 mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">カード決済金額</label>
              <input type="number" value={cardInputAmount} onChange={(e) => setCardInputAmount(e.target.value)} placeholder="カード金額を入力" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-2" />
              {mixedCardAmount > 0 && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">手数料込合計</span><span className="tabular-nums">¥{mixedTotalWithFee.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">カード支払</span><span className="tabular-nums">¥{mixedCardAmount.toLocaleString()}</span></div>
                  <div className="flex justify-between font-bold"><span>現金支払</span><span className="tabular-nums">¥{mixedCashAmount.toLocaleString()}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Split */}
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gray-400">割り勘</h3>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-500">人数:</span>
              <div className="flex gap-1">
                {[0, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => setSplitCount(n)} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${splitCount === n ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-500'}`}>
                    {n === 0 ? 'なし' : `${n}人`}
                  </button>
                ))}
              </div>
            </div>
            {splitCount > 0 && (
              <div className="mt-2 text-sm font-bold tabular-nums">
                1人あたり: ¥{perPerson.toLocaleString()} ({splitCount}人)
              </div>
            )}
          </div>

          {/* Discount */}
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gray-400">特別値引き</h3>
            <input type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="値引き金額" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="値引き理由（必須）" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
            {discount > 0 && !discountReason && <p className="text-xs text-red-400 mt-1">金額と理由の両方を入力してください</p>}
          </div>

          {/* Merge tables (合算会計) */}
          {occupiedTables.length > 1 && (
            <div className="bg-white/5 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-bold mb-2 text-gray-400">合算会計</h3>
              <p className="text-xs text-gray-600 mb-2">他の卓を合算する場合、チェックを入れてください</p>
              <div className="flex flex-wrap gap-2">
                {occupiedTables.filter((t) => t.id !== selectedTableId).map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm bg-white/5 px-3 py-1.5 rounded-lg">
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

          {/* Receipt info */}
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gray-400">領収書情報</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">宛名</label>
                <input type="text" value={receiptName} onChange={(e) => setReceiptName(e.target.value)} placeholder="宛名（空欄可）" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">但書</label>
                <input type="text" value={receiptPurpose} onChange={(e) => setReceiptPurpose(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-white/10 rounded-lg p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-gray-500">小計（ドリンク+指名料）</span><span className="tabular-nums">¥{subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">セット料金</span><span className="tabular-nums">¥{setFee.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">TAX（小計×{(taxRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{tax.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">税抜合計</span><span className="tabular-nums">¥{(subtotal + setFee + tax).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">消費税（税抜合計×10%）</span><span className="tabular-nums">¥{consumptionTax.toLocaleString()}</span></div>
            {(paymentMethod === 'card' && cardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{cardFee.toLocaleString()}</span></div>}
            {(paymentMethod === 'mixed' && mixedCardFee > 0) && <div className="flex justify-between text-sm text-blue-400"><span>カード手数料（+{(cardFeeRate * 100).toFixed(0)}%）</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>}
            {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span className="tabular-nums">-¥{discount.toLocaleString()}</span></div>}
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="font-bold text-lg">{discount > 0 ? '値引き後合計' : '合計'}</span>
              <span className="font-bold text-2xl text-[#d4af37] tabular-nums">¥{finalTotal.toLocaleString()}</span>
            </div>
            {paymentMethod === 'mixed' && mixedCardAmount > 0 && (
              <div className="text-sm text-gray-500 tabular-nums">
                現金: ¥{mixedCashAmount.toLocaleString()} / カード: ¥{mixedCardAmount.toLocaleString()}
              </div>
            )}
          </div>

          <button onClick={() => setShowConfirm(true)} disabled={discount > 0 && !discountReason} className="w-full mt-4 bg-[#e94560] py-4 rounded-lg text-lg font-bold active:bg-[#c73550] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            会計確定
          </button>
        </div>
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
