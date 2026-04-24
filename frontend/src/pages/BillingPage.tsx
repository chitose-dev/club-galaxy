import { useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { getSetPriceForTime, getSetPriceLabel, displayOrderName } from '../data/mock'
import type { DiscountLog, BillingRecord } from '../data/mock'
import { getNominationLabel } from '../utils/nomination'
import { Printer, CheckCircle, ArrowLeft, CreditCard } from 'lucide-react'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DangerButton, DarkButton, GhostButton } from '../components/Buttons'
import PrintMethodModal from '../components/PrintMethodModal'
import Modal from '../components/Modal'
import Tabs from '../components/Tabs'
import { Input, Field } from '../components/Input'

const DISCOUNT_REASON_PRESETS = ['端数カット', 'VIP値引', '店長承認', 'クーポン', 'その他'] as const

type PaymentMethod = 'cash' | 'card' | 'mixed'
type BillingTab = 'total' | 'individual' | 'audit' | 'history'

export default function BillingPage() {
  const { tables, resetTable, discountLogs, addDiscountLog, addBillingRecord, billingRecords, storeSettings, getNextReceiptNumber, casts } = useStore()
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

  const paymentLabel = (m: PaymentMethod) => m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

  const table = tables.find((t) => t.id === selectedTableId)

  // 会計完了ポップアップ裏に控える印刷用HTML (追補02 R6: IMG_1032 準拠)
  // 早期 return (会計対象なし状態) でも完了直後に会計履歴からの再印刷が動くよう、
  // この宣言は table の有無判定より先に置く必要がある。
  const receiptPrintBlock = lastBillingData ? (() => {
    const extensionOrders = lastBillingData.orders.filter((o) => o.menuItem.id >= 2000 && o.menuItem.id < 3000)
    const nominationOrders = lastBillingData.orders.filter(
      (o) => !extensionOrders.includes(o) && /指名|同伴|シングルチャージ/.test(o.menuItem.name),
    )
    const drinkOrders = lastBillingData.orders.filter(
      (o) => !extensionOrders.includes(o) && !nominationOrders.includes(o),
    )

    const nominationTotal = nominationOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
    const drinkTotal = drinkOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
    const extensionTotal = extensionOrders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)

    const ext30Count = extensionOrders.filter((o) => /\+30分/.test(o.menuItem.name)).reduce((s, o) => s + o.quantity, 0)
    const ext60Count = extensionOrders.filter((o) => /\+60分/.test(o.menuItem.name)).reduce((s, o) => s + o.quantity, 0)
    const extNominationCount = extensionOrders.filter((o) => o.castName).length

    const nowSubtotal = lastBillingData.setFee + nominationTotal + drinkTotal
    const stampRequired = lastBillingData.total > 50000
    const paymentBlockTitle = `[ ${paymentLabel(lastBillingData.paymentMethod)}支払い ]`

    return (
    <div className="print-only">
      <div ref={receiptRef} className="bg-white text-black p-6 mb-4 print-receipt" style={{ fontFamily: 'serif' }}>
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold tracking-widest">{storeSettings.storeName}</h2>
          <div className="text-2xl font-bold tracking-[0.5em] mt-1 mb-1">領 収 証</div>
        </div>
        <div className="flex justify-between text-xs mb-1">
          <span>{new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span>No. {String(lastBillingData.receiptNumber).padStart(6, '0')}</span>
        </div>
        {storeSettings.storeAddress && <div className="text-xs">{storeSettings.storeAddress}</div>}
        {storeSettings.storePhone && <div className="text-xs">TEL: {storeSettings.storePhone}</div>}
        <div className="text-xs mb-2">登録番号: {storeSettings.invoiceNumber}</div>
        <div className="border-t border-dashed border-gray-500 my-2" />

        <div className="text-sm my-3">
          <span>宛名 : </span>
          <span className="inline-block min-w-[180px] text-center border-b border-black pb-0.5">
            {lastBillingData.receiptName || '　上様　'}
          </span>
          <span className="ml-2">様</span>
        </div>

        <div className="text-lg mb-2">
          <span>金額 : </span>
          <span className="text-2xl font-bold tracking-wider">¥ {lastBillingData.total.toLocaleString()} －</span>
        </div>

        <div className="text-sm mb-3">
          但し、{lastBillingData.receiptPurpose || 'ご飲食代'}として上記正に領収いたしました
        </div>

        <div className="flex items-start justify-between mb-3">
          <div className="text-sm pt-6">ご来店ありがとうございました。</div>
          <div
            className={`border-2 rounded-sm px-4 py-3 text-center text-xs ${stampRequired ? 'border-black text-black' : 'border-gray-300 text-gray-300'}`}
            style={{ minWidth: 90 }}
          >
            収入印紙<br />{stampRequired ? '貼付欄' : '(不要)'}
          </div>
        </div>
        <div className="border-t border-dashed border-gray-500 my-2" />

        {/* ─── [ ただいまの料金 ] ─── */}
        <div className="text-sm mb-3 print-detail-lines">
          <div className="font-bold mb-1">[ ただいまの料金 ]</div>
          <div className="flex justify-between ml-2">
            <span>基本料金（セット）</span>
            <span>¥ {lastBillingData.setFee.toLocaleString()}</span>
          </div>
          {nominationTotal > 0 && (
            <div className="flex justify-between ml-2">
              <span>指名料</span>
              <span>¥ {nominationTotal.toLocaleString()}</span>
            </div>
          )}
          {drinkTotal > 0 && (
            <div className="flex justify-between ml-2">
              <span>ドリンク</span>
              <span>¥ {drinkTotal.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between ml-2 border-t border-gray-400 mt-1 pt-1 font-bold">
            <span>小計</span>
            <span>¥ {nowSubtotal.toLocaleString()}</span>
          </div>
        </div>

        {/* ─── [ 延長料金 ] ─── */}
        {extensionTotal > 0 && (
          <div className="text-sm mb-3">
            <div className="font-bold mb-1">[ 延長料金 ]</div>
            {ext30Count > 0 && (
              <div className="flex justify-between ml-2">
                <span>延長（30 分）× {ext30Count}</span>
                <span>¥ {(1000 * ext30Count).toLocaleString()}</span>
              </div>
            )}
            {ext60Count > 0 && (
              <div className="flex justify-between ml-2">
                <span>延長（60 分）× {ext60Count}</span>
                <span>¥ {(3000 * ext60Count).toLocaleString()}</span>
              </div>
            )}
            {extNominationCount > 0 && (
              <div className="flex justify-between ml-2">
                <span>延長指名料</span>
                <span className="text-xs text-gray-500">※バック帰属先あり</span>
              </div>
            )}
            <div className="flex justify-between ml-2 border-t border-gray-400 mt-1 pt-1 font-bold">
              <span>延長小計</span>
              <span>¥ {extensionTotal.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* 税・値引き */}
        <div className="text-xs mb-3 text-gray-600">
          <div className="flex justify-between ml-2">
            <span>TAX ({(storeSettings.taxRate * 100).toFixed(0)}% 内税)</span>
            <span>¥ {lastBillingData.tax.toLocaleString()}</span>
          </div>
          {lastBillingData.discount > 0 && (
            <div className="flex justify-between ml-2 text-red-600">
              <span>値引き</span>
              <span>-¥ {lastBillingData.discount.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="text-sm font-bold border-t border-gray-400 pt-2">
          {paymentBlockTitle}
        </div>
      </div>

      {/* 店舗控え詳細ジャーナル */}
      <div className="bg-gray-100 text-black rounded-lg p-6 mb-4 print-journal">
        <div className="text-center mb-3 border-b border-gray-300 pb-2">
          <h3 className="text-sm font-bold">【店舗控え】詳細ジャーナル</h3>
          <p className="text-xs text-gray-500">伝票No. {lastBillingData.receiptNumber}</p>
        </div>
        <div className="text-xs space-y-1 mb-2">
          <div className="flex justify-between"><span>卓:</span><span>{lastBillingData.tableNumber}</span></div>
          <div className="flex justify-between"><span>担当:</span><span>{lastBillingData.castNames.join(', ')}</span></div>
          <div className="flex justify-between"><span>日時:</span><span>{new Date().toLocaleString('ja-JP')}</span></div>
        </div>
        <div className="text-xs space-y-1 mb-2 border-t border-gray-300 pt-2">
          <div className="flex justify-between"><span>小計:</span><span>¥{lastBillingData.subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>セット:</span><span>¥{lastBillingData.setFee.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>TAX:</span><span>¥{lastBillingData.tax.toLocaleString()}</span></div>
          <div className="flex justify-between text-gray-600"><span>※消費税(内税内訳):</span><span>¥{lastBillingData.consumptionTax.toLocaleString()}</span></div>
          {lastBillingData.cardFee > 0 && <div className="flex justify-between"><span>カード手数料:</span><span>¥{lastBillingData.cardFee.toLocaleString()}</span></div>}
          {lastBillingData.discount > 0 && <div className="flex justify-between text-red-600"><span>値引き:</span><span>-¥{lastBillingData.discount.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold border-t border-gray-300 pt-1"><span>合計:</span><span>¥{lastBillingData.total.toLocaleString()}</span></div>
        </div>
        <div className="text-xs space-y-1 border-t border-gray-300 pt-2">
          <div className="flex justify-between font-bold"><span>支払方法:</span><span>{paymentLabel(lastBillingData.paymentMethod)}</span></div>
          {lastBillingData.cashAmount > 0 && <div className="flex justify-between"><span>現金:</span><span>¥{lastBillingData.cashAmount.toLocaleString()}</span></div>}
          {lastBillingData.cardAmount > 0 && <div className="flex justify-between"><span>カード:</span><span>¥{lastBillingData.cardAmount.toLocaleString()}</span></div>}
          {lastBillingData.cardFee > 0 && <div className="flex justify-between"><span>カード手数料(経費3.5%):</span><span>¥{Math.floor(lastBillingData.cardAmount * 0.035).toLocaleString()}</span></div>}
        </div>
      </div>
    </div>
    )
  })() : null

  if (!table || table.status === 'empty') {
    return (
      <div className="flex flex-col min-h-full">
        <ContextualHeader accent="billing" title="会計" backTo="/floor" />
        <div className="flex-1 p-4 text-center text-gray-500 mt-20">
          <p className="text-base mb-2">会計対象の卓がありません</p>
          <p className="text-sm text-gray-600">ホールから卓を選択してください</p>
          <div className="mt-6 max-w-xs mx-auto">
            <GhostButton onClick={() => setBillingTab('audit')} className="w-full">値引き履歴を表示</GhostButton>
          </div>
        </div>
        {billingTab === 'audit' && <AuditLogView logs={discountLogs} onClose={() => setBillingTab('total')} />}

        {/* 会計完了後、次の卓がなくこの分岐に来た場合もポップアップを表示できるようにする */}
        <Modal
          open={showReceipt && !!lastBillingData}
          onClose={() => { setShowReceipt(false); setLastBillingData(null) }}
          size="sm"
          dismissible={false}
          title="会計完了"
          footer={
            <GhostButton onClick={() => { setShowReceipt(false); setLastBillingData(null); navigate('/floor') }} className="flex-1">閉じる</GhostButton>
          }
        >
          {lastBillingData && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle size={40} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-xs text-gray-400 tracking-wider mb-1">お支払い額</p>
                <p className="text-3xl font-extrabold text-gold tabular-nums">¥{lastBillingData.total.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">卓 {lastBillingData.tableNumber} / 伝票No. {lastBillingData.receiptNumber}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => doPrint('summary')} className="btn-gold py-3 flex items-center justify-center gap-2 text-sm">
                  <Printer size={16} /> 領収書印刷
                </button>
                <button onClick={() => doPrint('detailed')} className="btn-dark py-3 flex items-center justify-center gap-2 text-sm">
                  <Printer size={16} /> 明細再印刷
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* 印刷用 HTML (会計完了直後、卓が empty に遷移した後でも再印刷できるように) */}
        {receiptPrintBlock}
      </div>
    )
  }

  const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const discountPerSet = table.setDiscountPerSet ?? 0
  const setPriceAfterDiscount = Math.max(0, setPrice - discountPerSet)
  const setPriceTotal = setPriceAfterDiscount * table.guestCount * table.setCount

  // 指名料・同伴料は自動で orders に含まれているため、ここでは個別に加算しない(指示書§2.3)
  const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)

  // 追補02 R13: 合算会計 - mergeTableIds に指定された卓の小計を加算
  const mergedTables = tables.filter((t) => mergeTableIds.includes(t.id))
  const mergedSetFee = mergedTables.reduce((acc, t) => {
    if (!t.startTime) return acc
    const mSet = getSetPriceForTime(t.startTime)
    const mDiscount = t.setDiscountPerSet ?? 0
    return acc + Math.max(0, mSet - mDiscount) * t.guestCount * t.setCount
  }, 0)
  const mergedDrinkTotal = mergedTables.reduce(
    (acc, t) => acc + t.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0),
    0,
  )

  const subtotal = drinkTotal + mergedDrinkTotal  // 内税扱い
  const setFee = setPriceTotal + mergedSetFee  // 内税扱い
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

    // 追補02 R1-3: 本指名担当 (mainNominationCastName) の売上は常にその担当キャストに帰属。
    // 担当キャストが他卓へ移動しても、本指名担当としての記録は不変 (assignedCasts ではなく mainNominationCastName を見る)。
    const nominatedCastId = table.mainNominationCastName
      ? casts.find((c) => c.name === table.mainNominationCastName)?.id
      : undefined

    const receiptNumberForRecord = getNextReceiptNumber()

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
      castNamesSnapshot: [...table.assignedCasts],
      // 再印刷用スナップショット
      receiptSnapshot: {
        receiptNumber: receiptNumberForRecord,
        receiptName,
        receiptPurpose,
        subtotal,
        setFee,
        tax,
        consumptionTax,
        discount,
        orders: table.orders.map((o) => ({ menuItem: { id: o.menuItem.id, name: o.menuItem.name, price: o.menuItem.price }, quantity: o.quantity, castName: o.castName })),
        startTime: table.startTime,
        nominationLabel: getNominationLabel(table),
        completedAt: new Date().toLocaleString('ja-JP'),
      },
    })

    setLastBillingData({
      tableNumber: table.number,
      castNames: [...table.assignedCasts],
      total: finalTotal,
      paymentMethod,
      subtotal,
      setFee,
      tax,
      consumptionTax,
      cardFee: paymentMethod === 'mixed' ? mixedCardFee : cardFee,
      discount,
      orders: table.orders.map((o) => ({ menuItem: { id: o.menuItem.id, name: o.menuItem.name, price: o.menuItem.price }, quantity: o.quantity, castName: o.castName })),
      nominationLabel: getNominationLabel(table),
      startTime: table.startTime,
      cashAmount: paymentMethod === 'cash' ? finalTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0,
      cardAmount: paymentMethod === 'card' ? finalTotal : paymentMethod === 'mixed' ? mixedCardAmount : 0,
      receiptNumber: receiptNumberForRecord,
      receiptName,
      receiptPurpose,
    })

    // 追補02 R13-4: 合算対象卓は会計確定と同時に精算済 (resetTable で空き状態へ) に
    // R13-5 将来対応メモ: 合算時の売上・バック帰属を正確に卓単位で保持するため、
    //   別 PR で各 mergedTable ごとに BillingRecord を生成する改修を予定。
    //   現状は代表卓 1 枚のレコードに合算総額をまとめている。
    for (const mid of mergeTableIds) {
      resetTable(mid)
    }
    const excludeIds = new Set<number>([table.id, ...mergeTableIds])
    const nextOccupied = occupiedTables.find((t) => !excludeIds.has(t.id))
    resetTable(table.id)
    setShowConfirm(false)
    setShowReceipt(true)
    setDiscount(0)
    setDiscountReason('')
    setSplitCount(0)
    setMergeTableIds([])
    // 会計完了後、次の卓があれば自動選択 (ポップアップを閉じたらそのまま次の卓の会計画面へ)
    if (nextOccupied) setSelectedTableId(nextOccupied.id)
  }

  const handleDismissReceipt = () => {
    setShowReceipt(false)
    setLastBillingData(null)
    // 次の卓もなければホールに戻る
    if (occupiedTables.length === 0) navigate('/floor')
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

  // 履歴レコードから lastBillingData を復元して印刷
  const reprintFromHistory = (record: BillingRecord, mode: 'detailed' | 'summary') => {
    if (!record.receiptSnapshot) {
      alert('この会計レコードは再印刷用のデータを保持していません (システム導入前の履歴)')
      return
    }
    const s = record.receiptSnapshot
    setLastBillingData({
      tableNumber: record.tableNumber,
      castNames: record.castNamesSnapshot ?? [],
      total: record.total,
      paymentMethod: record.paymentMethod,
      subtotal: s.subtotal,
      setFee: s.setFee,
      tax: s.tax,
      consumptionTax: s.consumptionTax,
      cardFee: record.cardFee ?? 0,
      discount: s.discount,
      orders: s.orders,
      nominationLabel: s.nominationLabel,
      startTime: s.startTime,
      cashAmount: record.cashAmount ?? 0,
      cardAmount: record.cardAmount ?? 0,
      receiptNumber: s.receiptNumber,
      receiptName: s.receiptName,
      receiptPurpose: s.receiptPurpose,
    })
    // ポップアップは出さず、直接印刷フローに乗せる
    setTimeout(() => doPrint(mode), 30)
  }


  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        accent="billing"
        title={`卓 ${table.number} の会計`}
        backTo={`/table/${table.id}`}
        right={
          <select
            value={selectedTableId}
            onChange={(e) => { setSelectedTableId(Number(e.target.value)); setDiscount(0); setDiscountReason(''); setSplitCount(0); setPaymentMethod('cash'); setCardInputAmount('') }}
            className="bg-primary-dark/60 border border-gold/20 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {occupiedTables.map((t) => (
              <option key={t.id} value={t.id}>卓 {t.number} ({t.assignedCasts.join(',')})</option>
            ))}
          </select>
        }
      />

      <Tabs<BillingTab>
        value={billingTab}
        onChange={setBillingTab}
        items={[
          { key: 'total', label: '合計' },
          { key: 'individual', label: '個別明細' },
          { key: 'audit', label: '値引き履歴' },
          { key: 'history', label: '会計履歴' },
        ]}
        className="px-2"
      />

      {billingTab === 'history' ? (
        <BillingHistoryView
          records={billingRecords}
          onReprint={(record) => reprintFromHistory(record, 'summary')}
          onReprintDetailed={(record) => reprintFromHistory(record, 'detailed')}
        />
      ) : billingTab === 'audit' ? (
        <AuditLogView logs={discountLogs} />
      ) : billingTab === 'individual' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="panel p-4 mb-4">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-500">担当: {table.assignedCasts.join(', ')}</span>
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
                <div className="flex justify-between font-bold text-lg pt-1"><span>合計</span><span className="text-gold tabular-nums">¥{finalTotal.toLocaleString()}</span></div>
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
                <span className="text-gray-500">担当:</span> {table.assignedCasts.join(', ') || '-'}
                {table.mainNominationCastName && (
                  <span className="text-gold/80 ml-2">（本指名: {table.mainNominationCastName}）</span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {table.startTime}〜 / {getNominationLabel(table)} / {table.guestCount}名
                {table.setCount > 1 && ` / ${table.setCount}セット`}
              </div>
            </div>

            {/* Central gold total band — 支払額を最も目立たせる */}
            <div
              className="rounded-[10px] p-4 mb-4 flex items-center justify-between border border-gold/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_12px_rgba(212,175,55,0.15)]"
              style={{
                background: 'linear-gradient(180deg, var(--color-gold-light) 0%, var(--color-gold) 55%, var(--color-gold-dark) 100%)',
              }}
            >
              <div>
                <div className="text-xs text-primary/80 tracking-wider font-semibold">合計 (お支払い額)</div>
                {discount > 0 && (
                  <div className="text-xs text-primary/70 tabular-nums mt-0.5">
                    正規 ¥{(finalTotal + discount).toLocaleString()} − 値引 ¥{discount.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="text-3xl font-extrabold text-primary tabular-nums tracking-tight">
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
                  <Tabs<PaymentMethod>
                    variant="pills"
                    value={paymentMethod}
                    onChange={(m) => { setPaymentMethod(m); setCardInputAmount('') }}
                    items={[
                      { key: 'cash', label: '現金' },
                      { key: 'card', label: 'カード' },
                      { key: 'mixed', label: '現金+カード' },
                    ]}
                    className="mb-3 w-full [&>button]:flex-1"
                  />
                  {paymentMethod === 'mixed' && (
                    <div className="mt-2">
                      <Field label="カード決済金額">
                        <Input
                          type="number"
                          value={cardInputAmount}
                          onChange={(e) => setCardInputAmount(e.target.value)}
                          placeholder="カード金額を入力"
                          className="tabular-nums"
                        />
                      </Field>
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
                  <Input
                    type="number"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                    placeholder="値引額"
                    className="mb-2 tabular-nums"
                  />
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {DISCOUNT_REASON_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountReason(p)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          discountReason === p
                            ? 'bg-gold text-primary border-gold'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="値引き理由（必須・自由記入可）"
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
                    <div className="mt-2 text-sm font-bold tabular-nums text-gold">
                      1人あたり: ¥{perPerson.toLocaleString()}
                    </div>
                  )}
                </div>

                {occupiedTables.length > 1 && (
                  <div className="panel p-4">
                    <h3 className="text-xs text-gray-400 tracking-wider mb-2">合算会計</h3>
                    <div className="space-y-1.5">
                      {occupiedTables.filter((t) => t.id !== selectedTableId).map((t) => {
                        const mSet = t.startTime ? getSetPriceForTime(t.startTime) : 0
                        const mDisc = t.setDiscountPerSet ?? 0
                        const mSetTotal = Math.max(0, mSet - mDisc) * t.guestCount * t.setCount
                        const mDrink = t.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
                        const mSub = mSetTotal + mDrink
                        return (
                          <label key={t.id} className="flex items-center justify-between gap-2 text-sm bg-white/5 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={mergeTableIds.includes(t.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setMergeTableIds((prev) => [...prev, t.id])
                                  else setMergeTableIds((prev) => prev.filter((id) => id !== t.id))
                                }}
                              />
                              <span>卓 {t.number}</span>
                              <span className="text-xs text-gray-500">({t.assignedCasts.join(', ') || 'フリー'} / {t.guestCount}名)</span>
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums">¥{mSub.toLocaleString()}</span>
                          </label>
                        )
                      })}
                    </div>
                    {mergeTableIds.length > 0 && (
                      <div className="mt-2 text-xs text-gold flex justify-between">
                        <span>{mergeTableIds.length} 卓 合算中</span>
                        <span className="tabular-nums">+¥{(mergedSetFee + mergedDrinkTotal).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="panel p-4">
                  <h3 className="text-xs text-gray-400 tracking-wider mb-3">領収書情報</h3>
                  <div className="space-y-2">
                    <Field label="宛名">
                      <Input
                        type="text"
                        value={receiptName}
                        onChange={(e) => setReceiptName(e.target.value)}
                        placeholder="宛名（空欄可）"
                      />
                    </Field>
                    <Field label="但書">
                      <Input
                        type="text"
                        value={receiptPurpose}
                        onChange={(e) => setReceiptPurpose(e.target.value)}
                      />
                    </Field>
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
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        size="sm"
        title="会計確定"
        footer={
          <>
            <GhostButton onClick={() => setShowConfirm(false)} className="flex-1">戻る</GhostButton>
            <DangerButton onClick={handleComplete} className="flex-1">確定</DangerButton>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-400">卓 {table.number} の会計を確定しますか？</p>
          <p className="text-2xl font-bold text-gold tabular-nums">¥{finalTotal.toLocaleString()}</p>
          {splitCount > 0 && <p className="text-sm text-gray-400 tabular-nums">割り勘: ¥{perPerson.toLocaleString()} x {splitCount}人</p>}
          <p className="text-sm text-gray-500">支払方法: {paymentLabel(paymentMethod)}</p>
          {paymentMethod === 'mixed' && mixedCardAmount > 0 && (
            <p className="text-sm text-gray-500 tabular-nums">現金: ¥{mixedCashAmount.toLocaleString()} / カード: ¥{mixedCardAmount.toLocaleString()}</p>
          )}
          {(cardFee > 0 || mixedCardFee > 0) && <p className="text-sm text-blue-400 tabular-nums">カード手数料: ¥{(paymentMethod === 'mixed' ? mixedCardFee : cardFee).toLocaleString()}</p>}
          {discount > 0 && <p className="text-sm text-red-400 tabular-nums">値引き: -¥{discount.toLocaleString()} ({discountReason})</p>}
        </div>
      </Modal>

      {/* 会計完了ポップアップ — 領収書/明細再印刷/閉じる */}
      <Modal
        open={showReceipt && !!lastBillingData}
        onClose={handleDismissReceipt}
        size="sm"
        dismissible={false}
        title="会計完了"
        footer={
          <GhostButton onClick={handleDismissReceipt} className="flex-1">閉じる</GhostButton>
        }
      >
        {lastBillingData && (
          <div className="space-y-4">
            <div className="text-center">
              <CheckCircle size={40} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-xs text-gray-400 tracking-wider mb-1">お支払い額</p>
              <p className="text-3xl font-extrabold text-gold tabular-nums">¥{lastBillingData.total.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">卓 {lastBillingData.tableNumber} / 伝票No. {lastBillingData.receiptNumber}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => doPrint('summary')}
                className="btn-gold py-3 flex items-center justify-center gap-2 text-sm"
              >
                <Printer size={16} /> 領収書印刷
              </button>
              <button
                onClick={() => doPrint('detailed')}
                className="btn-dark py-3 flex items-center justify-center gap-2 text-sm"
              >
                <Printer size={16} /> 明細再印刷
              </button>
            </div>
            <p className="text-[11px] text-gray-500 text-center">※ 印刷後もこのポップアップから何度でも再印刷できます</p>
          </div>
        )}
      </Modal>

      {/* 印刷用の領収書HTML (画面非表示・印刷時のみ可視) */}
      {receiptPrintBlock}

      <PrintMethodModal
        open={showPrintChooser}
        onClose={() => setShowPrintChooser(false)}
        onPrintDetailed={() => doPrint('detailed')}
        onPrintSummary={() => doPrint('summary')}
      />
    </div>
  )
}

function BillingHistoryView({
  records,
  onReprint,
  onReprintDetailed,
}: {
  records: BillingRecord[]
  onReprint: (record: BillingRecord) => void
  onReprintDetailed: (record: BillingRecord) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...records].sort((a, b) => {
    const ad = a.date ?? today
    const bd = b.date ?? today
    if (ad !== bd) return bd.localeCompare(ad)
    return b.timestamp.localeCompare(a.timestamp)
  })
  const paymentLabel = (m: BillingRecord['paymentMethod']) =>
    m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h3 className="text-sm font-bold mb-2 text-gray-400">会計履歴</h3>
      <p className="text-xs text-gray-600 mb-3">
        ※ 会計確定後の領収書・明細をここから再印刷できます。システム導入前の履歴は再印刷不可。
      </p>
      {sorted.length === 0 ? (
        <div className="text-center text-gray-600 mt-8">
          <p>会計履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const reprintable = !!r.receiptSnapshot
            return (
              <div key={r.id} className="panel p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-bold">
                      卓 {r.tableNumber}
                      {r.receiptSnapshot && (
                        <span className="ml-2 text-xs text-gray-500">
                          伝票No. {r.receiptSnapshot.receiptNumber}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.date ?? '本日'} {r.timestamp} / {paymentLabel(r.paymentMethod)}
                      {r.castNamesSnapshot && r.castNamesSnapshot.length > 0 && (
                        <span className="ml-2">担当: {r.castNamesSnapshot.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-gold font-bold tabular-nums">¥{r.total.toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onReprint(r)}
                    disabled={!reprintable}
                    className="flex-1 btn-gold py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={12} /> 領収書再印刷
                  </button>
                  <button
                    onClick={() => onReprintDetailed(r)}
                    disabled={!reprintable}
                    className="flex-1 btn-dark py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={12} /> 明細再印刷
                  </button>
                </div>
                {!reprintable && (
                  <p className="text-[10px] text-gray-600 mt-1 text-center">※ 再印刷データなし</p>
                )}
              </div>
            )
          })}
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
            <div key={log.id} className="panel p-3">
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
