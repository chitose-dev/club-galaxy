import { useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { getSetPriceForTime, getSetPriceLabel, displayOrderName } from '../data/mock'
import type { DiscountLog, BillingRecord, IssuedReceipt } from '../data/mock'
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
  const { tables, resetTable, discountLogs, addDiscountLog, addBillingRecord, billingRecords, issuedReceipts, addIssuedReceipt, storeSettings, getNextReceiptNumber, casts, chargeItems } = useStore()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const initialTableId = Number(searchParams.get('table')) || occupiedTables[0]?.id || 0
  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId)
  const [mergeTableIds, setMergeTableIds] = useState<number[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  // ビデオレビュー C15: 「現金額入力 → 残額をカードに」方式に変更 (旧: カード額入力)
  const [cashInputAmount, setCashInputAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  // PDF D: 現金+カード時に「カード支払額 (差額+手数料)」を端数カットできるようにする。
  // カット分は固定理由「端数カット」として discount に合算し、監査ログに別エントリで残す。
  const [cardEndCut, setCardEndCut] = useState(0)
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
    /** PDF C: 領収書分割発行用。会計時の人数と元 BillingRecord.id を保持。 */
    guestCount: number; billingRecordId: string;
  } | null>(null)

  // PDF C: 領収書分割発行モーダル状態。
  // - showSplitIssue: モーダル開閉
  // - splitSlots: 1..guestCount の各スロットの宛名/但し書き/金額入力
  // - splitContext: 対象会計の情報スナップショット（履歴からも呼べるようにする）
  const [showSplitIssue, setShowSplitIssue] = useState(false)
  type SplitSlot = { amount: string; recipientName: string; purpose: string }
  const [splitSlots, setSplitSlots] = useState<SplitSlot[]>([])
  const [splitContext, setSplitContext] = useState<{
    billingRecordId: string
    tableNumber: string
    total: number
    consumptionTax: number
    receiptNumber: number
    guestCount: number
    storeSettingsSnapshot: { storeName: string; storeAddress: string; storePhone: string }
  } | null>(null)
  // 1 スロット印刷用に動的オーバーライド（receiptPrintBlock を再利用するため）
  const [splitPrintOverride, setSplitPrintOverride] = useState<{
    recipientName: string; purpose: string; amount: number
  } | null>(null)

  const receiptRef = useRef<HTMLDivElement>(null)

  const paymentLabel = (m: PaymentMethod) => m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

  const table = tables.find((t) => t.id === selectedTableId)

  // 会計完了ポップアップ裏に控える印刷用HTML (追補02 R6: IMG_1032 準拠)
  // 早期 return (会計対象なし状態) でも完了直後に会計履歴からの再印刷が動くよう、
  // この宣言は table の有無判定より先に置く必要がある。
  const receiptPrintBlock = lastBillingData ? (() => {
    // ビデオレビュー W2: ダイソー風 横長レシートに再変更
    //   - 横長 (左右に情報配置)
    //   - 「領収書」見出しを右上 + No
    //   - 年月日 / 担当不要 / ○○様 ¥金額 / うち消費税 / 但書「飲食代として」
    //   - 印影スペース / 左下に CLUB GALAXY・住所・電話番号
    // PDF C: splitPrintOverride が指定されている間は、宛名/但し書き/金額を
    // それで差し替えて 1 枚ずつ印刷する。stamp 判定 / 消費税表示は金額に
    // 連動するため、override.amount を使って再計算する。
    const displayReceiptName = splitPrintOverride?.recipientName ?? lastBillingData.receiptName
    const displayReceiptPurpose = splitPrintOverride?.purpose ?? lastBillingData.receiptPurpose
    const displayTotal = splitPrintOverride?.amount ?? lastBillingData.total
    // 消費税内訳は会計総額ベースで決まるため、override の場合は表示しない方が安全。
    const displayConsumptionTax = splitPrintOverride ? null : lastBillingData.consumptionTax
    const stampRequired = displayTotal > 50000

    return (
    <div className="print-only">
      <div ref={receiptRef} className="bg-white text-black p-5 mb-4 print-receipt" style={{ fontFamily: 'serif', minWidth: 600 }}>
        {/* 横長 2 列レイアウト */}
        <div className="flex justify-between items-start mb-3 border-b-2 border-black pb-2">
          {/* 左: 年月日 + 宛名 */}
          <div>
            <div className="text-xs mb-1">
              {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="text-base">
              <span className="inline-block min-w-[160px] border-b border-black px-2">
                {displayReceiptName || '　上様　'}
              </span>
              <span className="ml-1">様</span>
            </div>
          </div>
          {/* 右: 領収書見出し + No */}
          <div className="text-right">
            <h2 className="text-2xl font-bold tracking-[0.5em]">領収書</h2>
            <div className="text-xs mt-1">No. {String(lastBillingData.receiptNumber).padStart(6, '0')}</div>
          </div>
        </div>

        {/* 中央: 金額大表示 */}
        <div className="flex justify-center my-3">
          <div className="text-3xl font-bold tracking-wider">
            ¥ {displayTotal.toLocaleString()} －
          </div>
        </div>

        <div className="text-sm text-center mb-3">
          但し、{displayReceiptPurpose || '飲食代'}として
        </div>
        {displayConsumptionTax !== null && (
          <div className="text-xs text-center text-gray-600 mb-3">
            うち消費税 (10%): ¥{displayConsumptionTax.toLocaleString()}
          </div>
        )}

        {/* 下部: 左に店舗情報 / 右に印紙 */}
        <div className="flex justify-between items-end pt-3 border-t border-dashed border-gray-400">
          <div className="text-xs">
            <div className="font-bold tracking-widest">{storeSettings.storeName}</div>
            {storeSettings.storeAddress && <div>{storeSettings.storeAddress}</div>}
            {storeSettings.storePhone && <div>TEL: {storeSettings.storePhone}</div>}
            <div className="text-gray-600">登録番号: {storeSettings.invoiceNumber}</div>
          </div>
          <div className="flex items-end gap-3">
            {/* 印影スペース */}
            <div className="border border-gray-400 rounded-full w-16 h-16 flex items-center justify-center text-[10px] text-gray-400">
              印
            </div>
            {/* 印紙 */}
            <div
              className={`border-2 rounded-sm px-3 py-2 text-center text-[10px] ${stampRequired ? 'border-black text-black' : 'border-gray-300 text-gray-300'}`}
              style={{ minWidth: 80 }}
            >
              収入印紙<br />{stampRequired ? '貼付欄' : '(不要)'}
            </div>
          </div>
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

  // 未収回収モード: ?uncollectedId=<id> が付いている場合、対象未収レコードの
  // 通常会計（recovered 化）専用 UI を表示する（通常の卓選択 UI を bypass）
  const uncollectedId = searchParams.get('uncollectedId')
  const uncollectedRecord = uncollectedId
    ? billingRecords.find((r) => r.id === uncollectedId && r.isUncollected) ?? null
    : null
  if (uncollectedRecord) {
    return <UncollectedRecoveryView record={uncollectedRecord} />
  }

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

  // Fix B (ふうや指摘): 本指名料・同伴料・場内指名料は orders に依存せず、
  //   table の mainNominationCastNames / isDouhan / isBanaiShimei /
  //   assignedCasts から直接計算する。これにより「入店後に編集」で
  //   本指名等を変更しても会計に正しく反映される。FloorPage 側の
  //   入店時 auto order 追加 (本指名料/同伴料/場内指名料) は廃止済み。
  const honShimeiUnit = chargeItems.find((c) => c.id === 'shimei')?.price ?? 0
  const douhanUnit = chargeItems.find((c) => c.id === 'douhan')?.price ?? 0
  const banaiShimeiUnit = chargeItems.find((c) => c.id === 'banai')?.price ?? 0
  const calcNominationFees = (t: import('../data/mock').Table) => {
    const honShimei = (t.mainNominationCastNames?.length ?? 0) * honShimeiUnit
    const douhan = t.isDouhan ? (t.assignedCasts?.length ?? 0) * douhanUnit : 0
    const banai = t.isBanaiShimei ? (t.assignedCasts?.length ?? 0) * banaiShimeiUnit : 0
    return honShimei + douhan + banai
  }
  const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)
  const nominationFees = calcNominationFees(table)

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
  const mergedNominationFees = mergedTables.reduce((s, t) => s + calcNominationFees(t), 0)

  const subtotal = drinkTotal + mergedDrinkTotal + nominationFees + mergedNominationFees  // 内税扱い
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
    : 0

  // ビデオレビュー C15: 現金額入力 → 残額を自動的にカードへ
  //   例: preCardTotal = 38,400、現金 30,000 → カード差額 = 8,400、手数料 = 840
  //   会計総額 = preCardTotal + カード手数料 (= 元金 + 残額の手数料)
  const mixedCashAmount = paymentMethod === 'mixed' ? (Number(cashInputAmount) || 0) : 0
  const mixedCardAmount = paymentMethod === 'mixed' ? Math.max(0, preCardTotal - mixedCashAmount) : 0
  const mixedCardFee = paymentMethod === 'mixed' && mixedCardAmount > 0 ? Math.floor(mixedCardAmount * cardFeeRate) : 0
  // PDF D: 「カード支払額」= カード差額 + カード手数料。先方が電卓を叩かなくても
  // 1 行で見える値として算出する。端数カット (cardEndCut) はこの値からのみ引く。
  // 差額/手数料そのものはカット対象にせず、cardEndCut を「最終のカード金額の値引き」
  // として扱うことで、cascading な再計算を避ける。
  const mixedCardPaymentRaw = paymentMethod === 'mixed' ? mixedCardAmount + mixedCardFee : 0
  const safeCardEndCut = paymentMethod === 'mixed' ? Math.min(cardEndCut, mixedCardPaymentRaw) : 0
  const mixedCardPaymentFinal = Math.max(0, mixedCardPaymentRaw - safeCardEndCut)
  const mixedTotalWithFee = paymentMethod === 'mixed'
    ? mixedCashAmount + mixedCardPaymentFinal
    : preCardTotal + cardFee

  const total = preCardTotal + cardFee

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
    // PDF D: 端数カット分も値引きとして別エントリで監査ログに残す。
    // 操作した人と金額が後追いできるようにする。
    if (paymentMethod === 'mixed' && safeCardEndCut > 0) {
      addDiscountLog({
        id: Date.now() + 1,
        tableNumber: table.number,
        originalTotal: subtotal + setFee + tax + consumptionTax + mixedCardFee,
        discountAmount: safeCardEndCut,
        reason: '端数カット (カード支払額)',
        operator: user?.displayName ?? 'スタッフ',
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    // BillingRecord / ReceiptSnapshot に保存する discount は VIP 値引等の
    // discount に端数カット分を合算した「実効値引き総額」。
    const effectiveDiscount = discount + safeCardEndCut

    // spec.md §5.5: 本指名キャスト全員分の ID をスナップショット保存。
    // 売上帰属は mainNominationCastNames で subtotalBeforeTax を均等按分（会計時スナップショット方式）。
    // 後方互換のため nominatedCastId（先頭1名）も継続して保存する。
    const nomNames = table.mainNominationCastNames
    const nominatedCastIdsSnapshot = nomNames
      .map((n) => casts.find((c) => c.name === n)?.id)
      .filter((id): id is number => typeof id === 'number')
    const nominatedCastId = nominatedCastIdsSnapshot[0]
    // 均等按分（端数は最後のキャストに寄せる）。本指名なしのフリー卓は誰にも帰属しない。
    const buildAttribution = (subtotal: number): Record<string, number> => {
      if (nomNames.length === 0) return {}
      const each = Math.floor(subtotal / nomNames.length)
      const acc: Record<string, number> = {}
      nomNames.forEach((n, i) => {
        acc[n] = i === nomNames.length - 1 ? subtotal - each * (nomNames.length - 1) : each
      })
      return acc
    }
    const salesAttributionByCast = buildAttribution(subtotalAll)

    const receiptNumberForRecord = getNextReceiptNumber()

    // JST 基準で YYYY-MM-DD を算出（toISOString は UTC を返すため +9h オフセット）
    const nowIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 追補02 R13-5 完全対応: 合算会計の場合、各構成卓ごとに独立した
    //   BillingRecord を生成し、売上・バック帰属を卓単位で保持する。
    //   代表卓レコード = 領収書番号と支払方法を持つ "main" レコード。
    //   合算対象卓レコード = 各卓の subtotal/setFee/orders/nominatedCastId
    //     を持つ "shadow" レコード (paymentMethod は 'mixed'、total は卓単位の税込小計)。
    // PDF C: 分割発行で参照するため、BillingRecord.id を変数化する。
    const billingId = String(Date.now())
    addBillingRecord({
      id: billingId,
      tableNumber: table.number,
      total: finalTotal,
      paymentMethod,
      cashAmount: paymentMethod === 'cash' ? finalTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0,
      // PDF D: cardAmount は実際に決済された金額（端数カット後）。
      // 端数カットがなければ mixedCardAmount + mixedCardFee と同じ。
      cardAmount: paymentMethod === 'card' ? finalTotal : paymentMethod === 'mixed' ? mixedCardPaymentFinal : 0,
      cardFee: cardFee > 0 || mixedCardFee > 0 ? (paymentMethod === 'mixed' ? mixedCardFee : cardFee) : undefined,
      completedAt: new Date().toISOString(),
      date: nowIso,
      nominatedCastId,
      nominatedCastIdsSnapshot,
      subtotalBeforeTax: subtotalAll,
      castNamesSnapshot: [...table.assignedCasts],
      salesAttributionByCast,
      // 延長指名バック按分の集計元（computeDailyWork が参照）。
      // ExtensionEntry をディープコピーして会計後の状態変更から切り離す。
      extensionHistorySnapshot: (table.extensionHistory ?? []).map((e) => ({ ...e })),
      // 再印刷用スナップショット
      receiptSnapshot: {
        receiptNumber: receiptNumberForRecord,
        receiptName,
        receiptPurpose,
        subtotal,
        setFee,
        tax,
        consumptionTax,
        // PDF D: VIP 値引等の discount に端数カット分も合算した実効値引きを保存。
        // 監査ログ側に内訳（discount / 端数カット）が別エントリで残るため、
        // 集計時はこの total で「いくら値引きされたか」を把握する。
        discount: effectiveDiscount,
        orders: table.orders.map((o) => ({
          menuItem: {
            id: o.menuItem.id,
            name: o.menuItem.name,
            price: o.menuItem.price,
            subcategory: o.menuItem.subcategory,
            backType: o.menuItem.category === 'cast' ? o.menuItem.backType : undefined,
            bottleBackBasePerUnit: o.menuItem.category === 'guest' ? o.menuItem.bottleBackBasePerUnit : undefined,
          },
          quantity: o.quantity,
          castName: o.castName,
        })),
        startTime: table.startTime,
        nominationLabel: getNominationLabel(table),
        completedAt: new Date().toLocaleString('ja-JP'),
        // A2: 本指名ボトルバック計算のため、会計時の本指名キャスト名を
        // ロックして保存する。castNamesSnapshot は assigned 全員を含んで
        // しまうため、本指名限定のこちらを使う。
        mainNominationCastNamesSnapshot: [...table.mainNominationCastNames],
      },
    })

    // 追補02 R13-5 完全対応: 合算対象卓ごとに shadow レコードを生成
    for (const mid of mergeTableIds) {
      const mt = tables.find((t) => t.id === mid)
      if (!mt || !mt.startTime) continue
      const mSet = getSetPriceForTime(mt.startTime)
      const mDisc = mt.setDiscountPerSet ?? 0
      const mSetTotal = Math.max(0, mSet - mDisc) * mt.guestCount * mt.setCount
      const mDrink = mt.orders.reduce((s, o) => s + o.menuItem.price * o.quantity, 0)
      const mSubtotal = mSetTotal + mDrink
      const mTax = Math.floor(mSubtotal * taxRate)
      const mTotal = mSubtotal + mTax
      const mNomNames = mt.mainNominationCastNames
      const mNomIds = mNomNames
        .map((n) => casts.find((c) => c.name === n)?.id)
        .filter((id): id is number => typeof id === 'number')
      // shadow レコードも spec.md §5.5 に従い卓単位で salesAttributionByCast を計算
      const mAttribution: Record<string, number> = {}
      if (mNomNames.length > 0) {
        const mEach = Math.floor(mSubtotal / mNomNames.length)
        mNomNames.forEach((n, i) => {
          mAttribution[n] = i === mNomNames.length - 1 ? mSubtotal - mEach * (mNomNames.length - 1) : mEach
        })
      }
      addBillingRecord({
        id: String(Date.now() + mid),
        tableNumber: mt.number,
        total: mTotal,
        paymentMethod: 'mixed', // 代表卓に合算されたため "mixed" でマーク
        cashAmount: 0,
        cardAmount: 0,
        completedAt: new Date().toISOString(),
        date: nowIso,
        nominatedCastId: mNomIds[0],
        nominatedCastIdsSnapshot: mNomIds,
        subtotalBeforeTax: mSubtotal,
        castNamesSnapshot: [...mt.assignedCasts],
        salesAttributionByCast: mAttribution,
        // 合算対象卓 (shadow) も卓単位で延長履歴を保持し按分対象に含める。
        extensionHistorySnapshot: (mt.extensionHistory ?? []).map((e) => ({ ...e })),
        // shadow レコードには receiptSnapshot を付けない (代表卓 1 枚で印字済)
      })
    }

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
      // PDF D: lastBillingData にも実効値引きを反映（会計完了モーダルの値引き行が
      // 実際の値引き総額と一致するようにするため）。
      discount: effectiveDiscount,
      orders: table.orders.map((o) => ({ menuItem: { id: o.menuItem.id, name: o.menuItem.name, price: o.menuItem.price }, quantity: o.quantity, castName: o.castName })),
      nominationLabel: getNominationLabel(table),
      startTime: table.startTime,
      cashAmount: paymentMethod === 'cash' ? finalTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0,
      // PDF D: cardAmount は「実際にカードで決済された金額」を保存。
      // 端数カットが入った場合は mixedCardPaymentFinal (差額+手数料−カット) を使う。
      cardAmount: paymentMethod === 'card' ? finalTotal : paymentMethod === 'mixed' ? mixedCardPaymentFinal : 0,
      receiptNumber: receiptNumberForRecord,
      receiptName,
      receiptPurpose,
      // PDF C: 分割発行モーダル初期化用
      guestCount: table.guestCount,
      billingRecordId: billingId,
    })

    // 追補02 R13-4: 合算対象卓は会計確定と同時に精算済 (resetTable で空き状態へ) に
    // R13-5 将来対応メモ: 合算時の売上・バック帰属を正確に卓単位で保持するため、
    //   別 PR で各 mergedTable ごとに BillingRecord を生成する改修を予定。
    //   現状は代表卓 1 枚のレコードに合算総額をまとめている。
    for (const mid of mergeTableIds) {
      resetTable(mid)
    }
    resetTable(table.id)
    setShowConfirm(false)
    setShowReceipt(true)
    setDiscount(0)
    setDiscountReason('')
    setCardEndCut(0)
    setSplitCount(0)
    setMergeTableIds([])
  }

  const handleDismissReceipt = () => {
    setShowReceipt(false)
    setLastBillingData(null)
    // ビデオレビュー C17: 会計完了後は常にホール画面に戻る (次の卓自動遷移をやめる)
    navigate('/floor')
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
      // 履歴復元時は guestCount を知らないため、発行枚数の上限は orders 件数や
      // 安全な数値で代用する。分割発行は会計直後の方が現実的だが、履歴側でも
      // 動作するように 1 以上の正の整数で埋める。
      guestCount: Math.max(1, (record.castNamesSnapshot?.length ?? 1)),
      billingRecordId: record.id,
    })
    // ポップアップは出さず、直接印刷フローに乗せる
    setTimeout(() => doPrint(mode), 30)
  }

  // PDF C: 分割発行モーダルを開く。会計直後 / 履歴いずれからも呼べる。
  // splitSlots は guestCount 件のスロットで初期化、初期金額は人数割（端数は最終枠）。
  const openSplitIssue = (ctx: {
    billingRecordId: string
    tableNumber: string
    total: number
    consumptionTax: number
    receiptNumber: number
    guestCount: number
  }) => {
    const n = Math.max(1, ctx.guestCount)
    const each = Math.floor(ctx.total / n)
    const slots: SplitSlot[] = Array.from({ length: n }).map((_, i) => ({
      amount: String(i === n - 1 ? ctx.total - each * (n - 1) : each),
      recipientName: '',
      purpose: '飲食代として',
    }))
    setSplitSlots(slots)
    setSplitContext({
      billingRecordId: ctx.billingRecordId,
      tableNumber: ctx.tableNumber,
      total: ctx.total,
      consumptionTax: ctx.consumptionTax,
      receiptNumber: ctx.receiptNumber,
      guestCount: n,
      storeSettingsSnapshot: {
        storeName: storeSettings.storeName,
        storeAddress: storeSettings.storeAddress,
        storePhone: storeSettings.storePhone,
      },
    })
    setShowSplitIssue(true)
  }

  // 分割スロット 1 枚を「発行 & 印刷」する。
  // 既存の receiptPrintBlock を splitPrintOverride で動的差し替えし、
  // 印刷後に IssuedReceipt を保存する。
  const issueAndPrintSplit = (index: number) => {
    if (!splitContext) return
    const slot = splitSlots[index]
    if (!slot) return
    const amount = Math.max(0, Math.floor(Number(slot.amount) || 0))
    if (amount <= 0) {
      alert('金額が 0 円です。0 円より大きい金額を入力してください。')
      return
    }
    setSplitPrintOverride({
      recipientName: slot.recipientName,
      purpose: slot.purpose,
      amount,
    })
    // 印刷ダイアログ起動 → ダイアログ閉じた直後にオーバーライド解除 + 記録保存
    document.body.classList.add('print-summary-mode')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('print-summary-mode')
      setSplitPrintOverride(null)
      addIssuedReceipt({
        id: `${splitContext.billingRecordId}-${Date.now()}-${index}`,
        billingRecordId: splitContext.billingRecordId,
        tableNumber: splitContext.tableNumber,
        sequenceIndex: index + 1,
        amount,
        recipientName: slot.recipientName,
        purpose: slot.purpose,
        issuedAt: new Date().toISOString(),
        issuedBy: user?.displayName ?? 'スタッフ',
        storeSettingsSnapshot: { ...splitContext.storeSettingsSnapshot },
      })
    }, 80)
  }

  // 分割スロットの編集
  const updateSplitSlot = (index: number, patch: Partial<SplitSlot>) => {
    setSplitSlots((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }
  const addSplitSlot = () => {
    if (!splitContext) return
    // クロウ指示: 「人数分まで」は guestCount を上限とする。
    if (splitSlots.length >= splitContext.guestCount) return
    setSplitSlots((prev) => [...prev, { amount: '0', recipientName: '', purpose: '飲食代として' }])
  }
  const removeSplitSlot = (index: number) => {
    setSplitSlots((prev) => prev.filter((_, i) => i !== index))
  }

  // 当該 BillingRecord で既に発行済みの領収書（一覧表示用）
  const issuedForCurrent = splitContext
    ? issuedReceipts.filter((r) => r.billingRecordId === splitContext.billingRecordId)
    : []


  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        accent="billing"
        title={`卓 ${table.number} の会計`}
        backTo={`/table/${table.id}`}
        right={
          <select
            value={selectedTableId}
            onChange={(e) => { setSelectedTableId(Number(e.target.value)); setDiscount(0); setDiscountReason(''); setSplitCount(0); setPaymentMethod('cash'); setCashInputAmount(''); setCardEndCut(0) }}
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
          issuedReceipts={issuedReceipts}
          isOwner={user?.role === 'owner'}
          onReprint={(record) => reprintFromHistory(record, 'summary')}
          onReprintDetailed={(record) => reprintFromHistory(record, 'detailed')}
          onSplitIssue={(record) => {
            if (!record.receiptSnapshot) {
              alert('この会計レコードは分割発行用のデータを保持していません')
              return
            }
            // 履歴側からの分割発行: lastBillingData を復元（印刷フローのため）
            // しつつ、openSplitIssue を直接呼ぶ。doPrint はトリガしない。
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
              guestCount: Math.max(1, record.castNamesSnapshot?.length ?? 1),
              billingRecordId: record.id,
            })
            openSplitIssue({
              billingRecordId: record.id,
              tableNumber: record.tableNumber,
              total: record.total,
              consumptionTax: s.consumptionTax,
              receiptNumber: s.receiptNumber,
              guestCount: Math.max(1, record.castNamesSnapshot?.length ?? 1),
            })
          }}
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
              {/* Fix B: 指名料・同伴料・場内指名料 (table 属性から計算、orders に依存しない) */}
              {((table.mainNominationCastNames?.length ?? 0) > 0 && honShimeiUnit > 0)
               || (table.isDouhan && douhanUnit > 0 && table.assignedCasts.length > 0)
               || (table.isBanaiShimei && banaiShimeiUnit > 0 && table.assignedCasts.length > 0) ? (
                <div className="border-t border-white/5 pt-2 mt-2">
                  <div className="text-xs text-gray-500 mb-1">指名・同伴料</div>
                </div>
              ) : null}
              {(table.mainNominationCastNames?.length ?? 0) > 0 && honShimeiUnit > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">本指名料 <span className="text-gray-500 text-xs">x{table.mainNominationCastNames.length}名 ({table.mainNominationCastNames.join(', ')})</span></span>
                  <span className="tabular-nums">¥{(table.mainNominationCastNames.length * honShimeiUnit).toLocaleString()}</span>
                </div>
              )}
              {table.isDouhan && douhanUnit > 0 && table.assignedCasts.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">同伴料 <span className="text-gray-500 text-xs">x{table.assignedCasts.length}名</span></span>
                  <span className="tabular-nums">¥{(table.assignedCasts.length * douhanUnit).toLocaleString()}</span>
                </div>
              )}
              {table.isBanaiShimei && banaiShimeiUnit > 0 && table.assignedCasts.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">場内指名料 <span className="text-gray-500 text-xs">x{table.assignedCasts.length}名</span></span>
                  <span className="tabular-nums">¥{(table.assignedCasts.length * banaiShimeiUnit).toLocaleString()}</span>
                </div>
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
                {table.mainNominationCastNames.length > 0 && (
                  <span className="text-gold/80 ml-2">（本指名: {table.mainNominationCastNames.join(', ')}）</span>
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
                    {/* Fix B: 指名料・同伴料・場内指名料 (table 属性から計算、orders に依存しない) */}
                    {(table.mainNominationCastNames?.length ?? 0) > 0 && honShimeiUnit > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-300">本指名料 <span className="text-gray-500 text-xs">x{table.mainNominationCastNames.length}名 ({table.mainNominationCastNames.join(', ')})</span></span>
                        <span className="tabular-nums">¥{(table.mainNominationCastNames.length * honShimeiUnit).toLocaleString()}</span>
                      </div>
                    )}
                    {table.isDouhan && douhanUnit > 0 && table.assignedCasts.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-300">同伴料 <span className="text-gray-500 text-xs">x{table.assignedCasts.length}名</span></span>
                        <span className="tabular-nums">¥{(table.assignedCasts.length * douhanUnit).toLocaleString()}</span>
                      </div>
                    )}
                    {table.isBanaiShimei && banaiShimeiUnit > 0 && table.assignedCasts.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-300">場内指名料 <span className="text-gray-500 text-xs">x{table.assignedCasts.length}名</span></span>
                        <span className="tabular-nums">¥{(table.assignedCasts.length * banaiShimeiUnit).toLocaleString()}</span>
                      </div>
                    )}
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
                    onChange={(m) => { setPaymentMethod(m); setCashInputAmount(''); setCardEndCut(0) }}
                    items={[
                      { key: 'cash', label: '現金' },
                      { key: 'card', label: 'カード' },
                      { key: 'mixed', label: '現金+カード' },
                    ]}
                    className="mb-3 w-full [&>button]:flex-1"
                  />
                  {paymentMethod === 'mixed' && (
                    <div className="mt-2">
                      <Field label="現金額 (残額をカード決済)">
                        <Input
                          type="number"
                          value={cashInputAmount}
                          onChange={(e) => {
                            // 現金額を変えると差額・手数料が変わり、旧 cardEndCut の
                            // 値が新カード支払額に対して意味を失うので一旦解除する。
                            setCashInputAmount(e.target.value)
                            setCardEndCut(0)
                          }}
                          placeholder="現金で受け取る金額"
                          className="tabular-nums"
                        />
                      </Field>
                      {/* ビデオレビュー C16: ハスカット (端数カット) ボタン
                          残額 (= preCardTotal - 現金) の 100 円未満端数を切り捨てる */}
                      <div className="flex gap-1.5 mt-2">
                        {[1000, 5000, 10000, 30000].map((qa) => (
                          <button
                            key={qa}
                            onClick={() => {
                              // クイック加算でも現金が変わる → カード支払額が変わるため、
                              // 旧 cardEndCut は解除する。
                              setCashInputAmount(String((Number(cashInputAmount) || 0) + qa))
                              setCardEndCut(0)
                            }}
                            className="flex-1 text-xs panel py-1.5 hover:bg-white/10 rounded"
                          >
                            +{qa.toLocaleString()}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            // ハスカット: 現金額を調整して、カード残額を 1000 円単位の丸い数字に
                            const cur = Number(cashInputAmount) || 0
                            const remainder = Math.max(0, preCardTotal - cur)
                            const trim = remainder % 1000
                            setCashInputAmount(String(cur + trim))
                            // ハスカット後はカード残額(差額)が変わる → カード支払額の
                            // 端数カット計算が古くなるので解除する。
                            setCardEndCut(0)
                          }}
                          className="text-xs px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded"
                          title="残額の 1000 円未満を現金に吸収して丸める"
                        >
                          ハスカット
                        </button>
                      </div>
                      {mixedCashAmount > 0 && (
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex justify-between font-bold"><span>現金受取</span><span className="tabular-nums">¥{mixedCashAmount.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">カード差額</span><span className="tabular-nums">¥{mixedCardAmount.toLocaleString()}</span></div>
                          <div className="flex justify-between text-blue-300"><span>カード手数料 (+{(cardFeeRate * 100).toFixed(0)}%)</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>
                          {/* PDF D: カード差額+手数料を「カード支払額」として 1 行表示。
                              先方が電卓で計算しなくても客に提示する金額が一目で分かる。 */}
                          <div className="flex justify-between border-t border-white/10 pt-1 mt-1 font-bold text-gold">
                            <span>カード支払額（差額+手数料）</span>
                            {safeCardEndCut > 0 ? (
                              <span className="tabular-nums">
                                <span className="text-gray-500 line-through mr-1">¥{mixedCardPaymentRaw.toLocaleString()}</span>
                                ¥{mixedCardPaymentFinal.toLocaleString()}
                              </span>
                            ) : (
                              <span className="tabular-nums">¥{mixedCardPaymentRaw.toLocaleString()}</span>
                            )}
                          </div>
                          {/* PDF D: 端数カットボタン。カード支払額の 1000 円未満を
                              切り捨て、そのカット分は値引きとして会計記録に残る。
                              既に表示用の値は cardEndCut を引いた形で出るので、
                              ボタンは「適用」「解除」のトグル UI にする。 */}
                          {safeCardEndCut === 0 && mixedCardPaymentRaw % 1000 > 0 && (
                            <button
                              onClick={() => setCardEndCut(mixedCardPaymentRaw % 1000)}
                              className="w-full text-xs px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded mt-1"
                              title="カード支払額の 1000 円未満を端数カット (値引きとして会計記録に残る)"
                            >
                              端数カット ¥{(mixedCardPaymentRaw % 1000).toLocaleString()} 値引き → ¥{(mixedCardPaymentRaw - (mixedCardPaymentRaw % 1000)).toLocaleString()}
                            </button>
                          )}
                          {safeCardEndCut > 0 && (
                            <div className="flex items-center justify-between text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                              <span>端数カット ¥{safeCardEndCut.toLocaleString()} を値引きとして記録</span>
                              <button
                                onClick={() => setCardEndCut(0)}
                                className="underline"
                              >
                                解除
                              </button>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-white/10 pt-1 mt-1 font-bold text-gold"><span>合計（現金+カード）</span><span className="tabular-nums">¥{mixedTotalWithFee.toLocaleString()}</span></div>
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
          <p className="text-sm text-gray-400">{table.number}卓 の会計を確定しますか？</p>
          <p className="text-2xl font-bold text-gold tabular-nums">¥{finalTotal.toLocaleString()}</p>
          {splitCount > 0 && <p className="text-sm text-gray-400 tabular-nums">割り勘: ¥{perPerson.toLocaleString()} x {splitCount}人</p>}
          <p className="text-sm text-gray-500">支払方法: {paymentLabel(paymentMethod)}</p>
          {/* PDF D: 現金+カード時は「カード支払額（差額+手数料-端数カット）」を
              実際にカードで決済する額として明示する。差額/手数料/端数カットは
              内訳として併記し、会計画面と表記を揃える。 */}
          {paymentMethod === 'mixed' && mixedCardAmount > 0 && (
            <div className="text-sm space-y-0.5">
              <p className="text-gray-500 tabular-nums">現金: ¥{mixedCashAmount.toLocaleString()}</p>
              <p className="text-gold tabular-nums font-bold">カード支払額: ¥{mixedCardPaymentFinal.toLocaleString()}</p>
              <p className="text-xs text-gray-500 tabular-nums">　└ 内訳: 差額 ¥{mixedCardAmount.toLocaleString()} + 手数料 ¥{mixedCardFee.toLocaleString()}{safeCardEndCut > 0 ? ` − 端数カット ¥${safeCardEndCut.toLocaleString()}` : ''}</p>
            </div>
          )}
          {paymentMethod === 'card' && cardFee > 0 && (
            <p className="text-sm text-blue-400 tabular-nums">カード手数料: ¥{cardFee.toLocaleString()}</p>
          )}
          {discount > 0 && <p className="text-sm text-red-400 tabular-nums">値引き: -¥{discount.toLocaleString()} ({discountReason})</p>}
          {paymentMethod === 'mixed' && safeCardEndCut > 0 && (
            <p className="text-sm text-amber-300 tabular-nums">端数カット: -¥{safeCardEndCut.toLocaleString()} （値引きとして記録）</p>
          )}
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
            {/* PDF C: 領収書を 1 組から人数分まで複数枚発行できる導線。 */}
            <button
              onClick={() => openSplitIssue({
                billingRecordId: lastBillingData.billingRecordId,
                tableNumber: lastBillingData.tableNumber,
                total: lastBillingData.total,
                consumptionTax: lastBillingData.consumptionTax,
                receiptNumber: lastBillingData.receiptNumber,
                guestCount: lastBillingData.guestCount,
              })}
              className="w-full btn-dark py-2.5 flex items-center justify-center gap-2 text-sm"
            >
              <Printer size={14} /> 領収書を分割発行（人数分まで）
            </button>
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

      {/* PDF C: 領収書 分割発行モーダル — 人数分まで複数枚、金額任意、合計不一致許容、発行履歴を残す */}
      <Modal
        open={showSplitIssue && !!splitContext}
        onClose={() => { setShowSplitIssue(false); setSplitContext(null); setSplitSlots([]) }}
        size="lg"
        title="領収書 分割発行"
        footer={
          <GhostButton onClick={() => { setShowSplitIssue(false); setSplitContext(null); setSplitSlots([]) }} className="flex-1">閉じる</GhostButton>
        }
      >
        {splitContext && (() => {
          const totalIssued = splitSlots.reduce((s, x) => s + Math.max(0, Math.floor(Number(x.amount) || 0)), 0)
          const remainder = splitContext.total - totalIssued
          // 上限: splitContext.guestCount（直近会計 / 履歴いずれも openSplitIssue で固定済み）
          const maxSlots = splitContext.guestCount
          return (
            <div className="space-y-3">
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>卓 {splitContext.tableNumber} / 伝票No. {splitContext.receiptNumber}</div>
                <div className="flex gap-3 tabular-nums">
                  <span>会計総額: <span className="text-gold font-bold">¥{splitContext.total.toLocaleString()}</span></span>
                  <span>発行合計: <span className={totalIssued > splitContext.total ? 'text-red-400 font-bold' : 'text-blue-300 font-bold'}>¥{totalIssued.toLocaleString()}</span></span>
                  <span>未発行: <span className={remainder < 0 ? 'text-red-400 font-bold' : 'text-gray-300 font-bold'}>¥{remainder.toLocaleString()}</span></span>
                </div>
                <div className="text-[10px] text-gray-500">※ 発行合計が会計総額と一致しないケースも許容（例: 一部のみ領収書発行）</div>
              </div>
              <div className="space-y-2">
                {splitSlots.map((slot, i) => (
                  <div key={i} className="panel p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gold font-bold">枚目 #{i + 1}</span>
                      {splitSlots.length > 1 && (
                        <button
                          onClick={() => removeSplitSlot(i)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          枠を削除
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="宛名">
                        <Input
                          type="text"
                          value={slot.recipientName}
                          onChange={(e) => updateSplitSlot(i, { recipientName: e.target.value })}
                          placeholder="空欄=上様"
                        />
                      </Field>
                      <Field label="但し書き">
                        <Input
                          type="text"
                          value={slot.purpose}
                          onChange={(e) => updateSplitSlot(i, { purpose: e.target.value })}
                        />
                      </Field>
                      <Field label="金額 (円)">
                        <Input
                          type="number"
                          value={slot.amount}
                          onChange={(e) => updateSplitSlot(i, { amount: e.target.value })}
                          className="tabular-nums"
                        />
                      </Field>
                    </div>
                    <button
                      onClick={() => issueAndPrintSplit(i)}
                      className="w-full btn-gold py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Printer size={13} /> この枠を発行 & 印刷
                    </button>
                  </div>
                ))}
                {splitSlots.length < maxSlots && (
                  <button
                    onClick={addSplitSlot}
                    className="w-full btn-dark py-2 text-xs text-gray-400 hover:text-white"
                  >
                    + 枠を追加（最大 {maxSlots} 枚 / 人数分）
                  </button>
                )}
              </div>
              {issuedForCurrent.length > 0 && (
                <div className="panel p-3">
                  <h4 className="text-xs text-gray-400 tracking-wider mb-2">この会計の発行履歴（{issuedForCurrent.length} 件）</h4>
                  <div className="space-y-1 text-xs">
                    {issuedForCurrent.map((r) => (
                      <div key={r.id} className="flex justify-between text-gray-300 tabular-nums">
                        <span>#{r.sequenceIndex} {r.recipientName || '上様'} / {r.purpose}</span>
                        <span>¥{r.amount.toLocaleString()} <span className="text-gray-500">({new Date(r.issuedAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })} {r.issuedBy})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

function BillingHistoryView({
  records,
  issuedReceipts,
  isOwner,
  onReprint,
  onReprintDetailed,
  onSplitIssue,
}: {
  records: BillingRecord[]
  issuedReceipts: IssuedReceipt[]
  isOwner: boolean
  onReprint: (record: BillingRecord) => void
  onReprintDetailed: (record: BillingRecord) => void
  onSplitIssue: (record: BillingRecord) => void
}) {
  const { voidBillingRecord } = useStore()
  const [voidTarget, setVoidTarget] = useState<BillingRecord | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState('')
  const [voiding, setVoiding] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...records].sort((a, b) => {
    const ad = a.date ?? today
    const bd = b.date ?? today
    if (ad !== bd) return bd.localeCompare(ad)
    return b.completedAt.localeCompare(a.completedAt)
  })
  const paymentLabel = (m: BillingRecord['paymentMethod']) =>
    m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'

  const handleVoidConfirm = async () => {
    if (!voidTarget) return
    const reason = voidReason.trim()
    if (!reason) {
      setVoidError('理由を入力してください')
      return
    }
    setVoiding(true)
    setVoidError('')
    try {
      await voidBillingRecord(voidTarget.id, reason)
      setVoidTarget(null)
      setVoidReason('')
    } catch (e) {
      // バックエンドの 422 ALREADY_CLOSED / 409 ALREADY_VOIDED もここで表示する
      setVoidError(e instanceof Error ? e.message : '取消に失敗しました')
    } finally {
      setVoiding(false)
    }
  }
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
            const isVoided = !!r.voidedAt
            return (
              <div key={r.id} className={`panel p-3 ${isVoided ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      卓 {r.tableNumber}
                      {r.receiptSnapshot && (
                        <span className="text-xs text-gray-500">
                          伝票No. {r.receiptSnapshot.receiptNumber}
                        </span>
                      )}
                      {isVoided && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          取消済
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.date ?? '本日'} {new Date(r.completedAt).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'})} / {paymentLabel(r.paymentMethod)}
                      {r.castNamesSnapshot && r.castNamesSnapshot.length > 0 && (
                        <span className="ml-2">担当: {r.castNamesSnapshot.join(', ')}</span>
                      )}
                    </div>
                    {isVoided && r.voidReason && (
                      <div className="text-[11px] text-red-300/80 mt-1">取消理由: {r.voidReason}</div>
                    )}
                  </div>
                  <div className={`font-bold tabular-nums ${isVoided ? 'text-gray-500 line-through' : 'text-gold'}`}>¥{r.total.toLocaleString()}</div>
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
                  {/* PDF C: 分割発行モーダルを開く。再印刷データがあれば履歴からでも可能。 */}
                  <button
                    onClick={() => onSplitIssue(r)}
                    disabled={!reprintable || isVoided}
                    className="flex-1 btn-dark py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={12} /> 分割発行
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => { setVoidTarget(r); setVoidReason(''); setVoidError('') }}
                      disabled={isVoided}
                      className="px-3 py-2 text-xs font-bold rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      取消
                    </button>
                  )}
                </div>
                {/* PDF C: 当該会計の発行履歴件数を見出しの直下に出す（数だけ） */}
                {(() => {
                  const cnt = issuedReceipts.filter((ir) => ir.billingRecordId === r.id).length
                  if (cnt === 0) return null
                  return (
                    <p className="text-[10px] text-gray-500 mt-1 text-center">
                      📄 領収書 {cnt} 件発行済（分割発行モーダルで内訳閲覧）
                    </p>
                  )
                })()}
                {!reprintable && (
                  <p className="text-[10px] text-gray-600 mt-1 text-center">※ 再印刷データなし</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-lg p-4 max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-white">会計記録を取消</h3>
            <div className="text-xs text-gray-400">
              卓 {voidTarget.tableNumber} / ¥{voidTarget.total.toLocaleString()}
              {voidTarget.receiptSnapshot && (
                <span className="ml-2">伝票No. {voidTarget.receiptSnapshot.receiptNumber}</span>
              )}
            </div>
            <div className="text-xs text-amber-300/80">
              取消後は売上集計から除外されます。レジ締め済みの場合は先に「日報・レジ締め」で解除してください。
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">取消理由（必須）</label>
              <input
                value={voidReason}
                onChange={(e) => { setVoidReason(e.target.value); setVoidError('') }}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                placeholder="例: 誤って会計を確定した"
                autoFocus
              />
              {voidError && <div className="text-xs text-red-400 mt-1">{voidError}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setVoidTarget(null); setVoidReason(''); setVoidError('') }}
                disabled={voiding}
                className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-400 disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                onClick={handleVoidConfirm}
                disabled={!voidReason.trim() || voiding}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-40"
              >
                {voiding ? '処理中…' : '取消する'}
              </button>
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

// ────────────────────────────────────────────────────────────
// 未収回収モード: AdminPage > 未収管理「回収」ボタン経由で呼ばれる
// 通常会計と同等の UI（割引 / mixed 決済 / 印刷オプション）。orders は元レコード
// に含まれないため省略し、レシートには金額・宛名・但書のみ印字する簡易版。
// ────────────────────────────────────────────────────────────
function UncollectedRecoveryView({ record }: { record: BillingRecord }) {
  const { addBillingRecord, updateBillingRecord, addDiscountLog, storeSettings } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashInputAmount, setCashInputAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [receiptName, setReceiptName] = useState('')
  const [receiptPurpose, setReceiptPurpose] = useState('飲食代として')
  const [printedTotal, setPrintedTotal] = useState(0)

  const baseTotal = record.total
  const cardFeeRate = storeSettings.cardFeeRate
  const preCardTotal = Math.max(0, baseTotal - discount)
  const mixedCash = method === 'mixed' ? Number(cashInputAmount) || 0 : 0
  const mixedCard = method === 'mixed' ? Math.max(0, preCardTotal - mixedCash) : 0
  const mixedCardFee = method === 'mixed' && mixedCard > 0 ? Math.floor(mixedCard * cardFeeRate) : 0
  const cardFee = method === 'card' ? Math.floor(preCardTotal * cardFeeRate) : 0
  const finalTotal = method === 'mixed' ? preCardTotal + mixedCardFee : preCardTotal + cardFee

  const discountValid = discount === 0 || discountReason.trim().length > 0
  const mixedValid = method !== 'mixed' || (mixedCash > 0 && mixedCash < preCardTotal)
  const canConfirm = discountValid && mixedValid && finalTotal >= 0

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch {
      return iso
    }
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    if (discount > 0) {
      addDiscountLog({
        id: Date.now(),
        tableNumber: record.tableNumber,
        originalTotal: baseTotal,
        discountAmount: discount,
        reason: discountReason,
        operator: user?.displayName ?? 'スタッフ',
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    addBillingRecord({
      id: String(Date.now()),
      tableNumber: record.tableNumber,
      total: finalTotal,
      paymentMethod: method,
      cashAmount: method === 'cash' ? finalTotal : method === 'mixed' ? mixedCash : 0,
      cardAmount: method === 'card' ? finalTotal : method === 'mixed' ? mixedCard : 0,
      cardFee: cardFee > 0 || mixedCardFee > 0 ? (method === 'mixed' ? mixedCardFee : cardFee) : undefined,
      completedAt: new Date().toISOString(),
      date: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
      isUncollected: false,
      ...(record.castNamesSnapshot ? { castNamesSnapshot: [...record.castNamesSnapshot] } : {}),
    })
    updateBillingRecord(record.id, { uncollectedStatus: 'recovered' })
    setPrintedTotal(finalTotal)
    setShowReceiptDialog(true)
  }

  const handlePrint = () => {
    // 簡易レシート (orders なし、金額・宛名・但書のみ)
    const consumptionTax = Math.floor(printedTotal - printedTotal / (1 + (storeSettings.taxRate || 0)))
    const html = `
      <div style="font-family: serif; padding: 16px; max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px;">
          <div>
            <div style="font-size: 12px; margin-bottom: 4px;">${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div style="font-size: 14px;"><span style="display: inline-block; min-width: 160px; border-bottom: 1px solid #000; padding: 0 8px;">${escapeForReceipt(receiptName) || '　上様　'}</span><span style="margin-left: 4px;">様</span></div>
          </div>
          <div style="text-align: right;"><h2 style="font-size: 22px; font-weight: bold; letter-spacing: 0.5em; margin: 0;">領収書</h2><div style="font-size: 11px; margin-top: 4px;">未収回収</div></div>
        </div>
        <div style="text-align: center; margin: 16px 0;"><div style="font-size: 28px; font-weight: bold; letter-spacing: 0.1em;">¥ ${printedTotal.toLocaleString()} －</div></div>
        <div style="font-size: 12px; line-height: 1.6;">
          <div>但 <span style="border-bottom: 1px solid #000; padding: 0 8px;">${escapeForReceipt(receiptPurpose)}</span></div>
          <div>として上記正に領収いたしました</div>
          <div style="margin-top: 8px; color: #444;">うち消費税等 ¥${consumptionTax.toLocaleString()}</div>
        </div>
        <div style="margin-top: 24px; font-size: 11px; color: #444;">${escapeForReceipt(storeSettings.storeName)}</div>
      </div>
    `
    openReceiptWindow(html, '領収書（未収回収）')
    navigate('/admin?tab=uncollected')
  }

  const handleSkipPrint = () => {
    navigate('/admin?tab=uncollected')
  }

  if (showReceiptDialog) {
    return (
      <div className="flex flex-col min-h-full">
        <ContextualHeader accent="billing" title="回収完了" />
        <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
          <div className="panel p-4 space-y-3 text-center">
            <CheckCircle size={48} className="mx-auto text-emerald-400" />
            <div className="text-lg font-bold text-white">¥{printedTotal.toLocaleString()} を回収しました</div>
            <div className="text-xs text-gray-400">未収レコードを「回収済み」に更新しました</div>
          </div>
          <div className="panel p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">領収書を発行しますか？</h3>
            <Field label="宛名">
              <Input value={receiptName} onChange={(e) => setReceiptName(e.target.value)} placeholder="上様" />
            </Field>
            <Field label="但書">
              <Input value={receiptPurpose} onChange={(e) => setReceiptPurpose(e.target.value)} placeholder="飲食代として" />
            </Field>
          </div>
          <div className="flex gap-2">
            <DarkButton onClick={handleSkipPrint} className="flex-1">印刷せず閉じる</DarkButton>
            <button onClick={handlePrint} className="flex-1 py-3 rounded-lg text-sm font-bold bg-white text-black flex items-center justify-center gap-1.5">
              <Printer size={15} /> 印刷
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader accent="billing" title="未収回収" backTo="/admin?tab=uncollected" />
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        <div className="panel p-4 space-y-2">
          <h3 className="text-sm font-bold text-white mb-2">未収情報</h3>
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex justify-between"><span>卓番号</span><span className="text-white">{record.tableNumber}</span></div>
            <div className="flex justify-between"><span>発生日時</span><span className="text-white">{formatDateTime(record.completedAt)}</span></div>
            <div className="flex justify-between"><span>担当キャスト</span><span className="text-white">{(record.castNamesSnapshot ?? []).join(', ') || '-'}</span></div>
            {record.uncollectedReason && (
              <div className="flex justify-between"><span>事由</span><span className="text-amber-300/80">{record.uncollectedReason}</span></div>
            )}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-white/10">
            <span className="text-sm text-gray-400">未収金額</span>
            <span className="text-base font-bold text-red-400 tabular-nums">¥{baseTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="panel p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">割引</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">金額</span>
            <input
              type="number"
              value={discount || ''}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-right tabular-nums"
            />
            <span className="text-xs text-gray-500">円</span>
          </div>
          {discount > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">理由（必須）</label>
              <select
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
              >
                <option value="">-- 選択 --</option>
                {DISCOUNT_REASON_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="panel p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">支払い方法</h3>
          <div className="flex gap-2">
            {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 py-3 rounded-lg text-xs font-bold ${method === m ? 'bg-white text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
              >
                {m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード'}
              </button>
            ))}
          </div>
          {method === 'mixed' && (
            <div className="space-y-2">
              <Field label="現金額（残額は自動的にカード決済）">
                <Input
                  type="number"
                  value={cashInputAmount}
                  onChange={(e) => setCashInputAmount(e.target.value)}
                  placeholder="現金額"
                />
              </Field>
              <div className="text-xs text-gray-400 space-y-0.5">
                <div className="flex justify-between"><span>カード差額</span><span className="tabular-nums">¥{mixedCard.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>カード手数料 ({Math.round(cardFeeRate * 100)}%)</span><span className="tabular-nums">¥{mixedCardFee.toLocaleString()}</span></div>
              </div>
            </div>
          )}
          {method === 'card' && cardFee > 0 && (
            <div className="text-xs text-gray-400 flex justify-between">
              <span>カード手数料 ({Math.round(cardFeeRate * 100)}%)</span>
              <span className="tabular-nums">¥{cardFee.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="panel p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">回収合計</span>
            <span className="text-2xl font-bold text-gold tabular-nums">¥{finalTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <DarkButton onClick={() => navigate('/admin?tab=uncollected')} className="flex-1">キャンセル</DarkButton>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 py-3 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            回収確定
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeForReceipt(s: string | undefined | null): string {
  if (!s) return ''
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}

function openReceiptWindow(html: string, title: string) {
  const w = window.open('', '_blank', 'width=400,height=600')
  if (!w) {
    alert('ポップアップがブロックされました。ブラウザの設定で許可してください。')
    return
  }
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${escapeForReceipt(title)}</title>
    <style>@page { size: 80mm auto; margin: 0; } body { margin: 0; padding: 8px; font-family: sans-serif; font-size: 11px; }</style>
    </head><body>${html}</body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 50)
}
