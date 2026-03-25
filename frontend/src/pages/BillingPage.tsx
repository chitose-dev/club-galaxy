import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { getSetPriceForTime, getSetPriceLabel, chargeItems, nominationLabels } from '../data/mock'

type PaymentMethod = 'cash' | 'card'
type BillingTab = 'total' | 'individual' | 'audit'

export default function BillingPage() {
  const { tables, resetTable, discountLogs, addDiscountLog, addBillingRecord } = useStore()
  const [searchParams] = useSearchParams()

  const occupiedTables = tables.filter((t) => t.status !== 'empty')
  const initialTableId = Number(searchParams.get('table')) || occupiedTables[0]?.id || 0
  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cardAmount, setCardAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [billingTab, setBillingTab] = useState<BillingTab>('total')
  const [splitCount, setSplitCount] = useState(0)

  const table = tables.find((t) => t.id === selectedTableId)

  if (!table || table.status === 'empty') {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 text-center text-gray-400 mt-20">
          <p className="text-lg mb-2">会計対象の卓がありません</p>
          <p className="text-sm">フロアから卓を選択してください</p>
        </div>
        {/* 監査ログタブは常に見える */}
        <div className="p-4">
          <button onClick={() => setBillingTab('audit')} className="w-full bg-white/5 py-3 rounded-lg text-sm text-gray-400 font-bold">値引き履歴を表示</button>
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
  const subtotal = drinkTotal + nominationCharge // 小計 = ドリンク合計 + 指名料
  const setFee = setPriceTotal // セット料金
  const tax = Math.floor(subtotal * 0.2) // TAX = 小計×20%
  const consumptionTax = Math.floor((subtotal + setFee + tax) * 0.1) // 消費税 = (小計+セット料金+TAX)×10%
  const total = subtotal + setFee + tax + consumptionTax - discount

  const perPerson = splitCount > 0 ? Math.ceil(total / splitCount) : 0

  const handleComplete = () => {
    // 値引きがある場合は監査ログに追加
    if (discount > 0) {
      addDiscountLog({
        id: Date.now(),
        tableNumber: table.number,
        originalTotal: subtotal + setFee + tax + consumptionTax,
        discountAmount: discount,
        reason: discountReason,
        operator: 'スタッフ',
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    // 会計記録追加
    addBillingRecord({
      id: Date.now(),
      tableNumber: table.number,
      total,
      paymentMethod,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    })
    resetTable(table.id)
    setShowConfirm(false)
    setDiscount(0)
    setDiscountReason('')
    setSplitCount(0)
    setSelectedTableId(occupiedTables.find((t) => t.id !== table.id)?.id ?? 0)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 卓選択 */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-sm text-gray-400">卓:</span>
        <select value={selectedTableId} onChange={(e) => { setSelectedTableId(Number(e.target.value)); setDiscount(0); setDiscountReason(''); setSplitCount(0) }} className="bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm">
          {occupiedTables.map((t) => (
            <option key={t.id} value={t.id}>{t.number} ({t.castNames.join(',')})</option>
          ))}
        </select>
      </div>

      {/* タブ: 合計/個別/監査ログ */}
      <div className="flex border-b border-gray-700">
        {[
          { key: 'total' as const, label: '合計' },
          { key: 'individual' as const, label: '個別明細' },
          { key: 'audit' as const, label: '値引き履歴' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setBillingTab(tab.key)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              billingTab === tab.key ? 'text-[#d4af37] border-b-2 border-[#d4af37]' : 'text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {billingTab === 'audit' ? (
        <AuditLogView logs={discountLogs} />
      ) : billingTab === 'individual' ? (
        /* 個別会計（卓内訳） */
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-400">担当: {table.castNames.join(', ')}</span>
              <span className="text-gray-400">{table.guestCount}名</span>
            </div>
            <h3 className="text-sm font-bold mb-3 text-gray-300">卓 {table.number} 内訳</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>セット料金 <span className="text-gray-500">({table.startTime ? getSetPriceLabel(table.startTime) : '-'})</span></span>
                <span>¥{setPriceTotal.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-2">¥{setPrice.toLocaleString()} x {table.guestCount}名 x {table.setCount}セット</div>
              {nominationCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{table.nomination ? nominationLabels[table.nomination] : ''}</span>
                  <span>¥{nominationCharge.toLocaleString()}</span>
                </div>
              )}
              {table.orders.length > 0 && (
                <>
                  <div className="border-t border-gray-700 pt-2 mt-2">
                    <div className="text-xs text-gray-400 mb-1">ドリンク注文</div>
                  </div>
                  {table.orders.map((o) => (
                    <div key={o.menuItem.id} className="flex justify-between text-sm">
                      <span>{o.menuItem.name}{o.quantity > 1 && <span className="text-gray-400"> x{o.quantity}</span>}</span>
                      <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="border-t border-gray-700 pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-400">小計（ドリンク+指名料）</span><span>¥{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">セット料金</span><span>¥{setFee.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">TAX（小計×20%）</span><span>¥{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">消費税（(小計+セット+TAX)×10%）</span><span>¥{consumptionTax.toLocaleString()}</span></div>
                {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span>-¥{discount.toLocaleString()}</span></div>}
                <div className="flex justify-between font-bold text-lg pt-1"><span>合計</span><span className="text-[#d4af37]">¥{total.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 合計タブ */
        <div className="flex-1 overflow-y-auto p-4 pb-6">
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">担当: {table.castNames.join(', ')}</span>
              <span className="text-gray-400">{table.guestCount}名</span>
            </div>
            <div className="text-xs text-gray-500">
              {table.startTime}〜 / {table.nomination ? nominationLabels[table.nomination] : 'フリー'}
              {table.setCount > 1 && ` / ${table.setCount}セット`}
            </div>
          </div>

          {/* 明細 */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-300">明細</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>セット料金 ({table.startTime ? getSetPriceLabel(table.startTime) : '-'})<span className="text-gray-400"> x{table.guestCount}名 x{table.setCount}セット</span></span>
                <span>¥{setPriceTotal.toLocaleString()}</span>
              </div>
              {nominationCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{table.nomination ? nominationLabels[table.nomination] : ''}</span>
                  <span>¥{nominationCharge.toLocaleString()}</span>
                </div>
              )}
              {table.orders.map((o) => (
                <div key={o.menuItem.id} className="flex justify-between text-sm">
                  <span>{o.menuItem.name}{o.quantity > 1 && <span className="text-gray-400"> x{o.quantity}</span>}</span>
                  <span>{o.menuItem.price === 0 ? 'セット内' : `¥${(o.menuItem.price * o.quantity).toLocaleString()}`}</span>
                </div>
              ))}
              {/* 合計内訳 */}
              <div className="border-t border-gray-700 pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-400">小計（ドリンク+指名料）</span><span>¥{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">セット料金</span><span>¥{setFee.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">TAX（小計×20%）</span><span>¥{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">税抜合計</span><span>¥{(subtotal + setFee + tax).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">消費税（税抜合計×10%）</span><span>¥{consumptionTax.toLocaleString()}</span></div>
                <div className="border-t border-gray-600 pt-1 flex justify-between font-bold"><span>合計</span><span className="text-[#d4af37]">¥{(total + discount).toLocaleString()}</span></div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span>-¥{discount.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold text-red-400"><span>値引き後合計</span><span>¥{total.toLocaleString()}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 支払方法 */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setPaymentMethod('cash')} className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-colors ${paymentMethod === 'cash' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-gray-600 text-gray-400'}`}>現金</button>
            <button onClick={() => setPaymentMethod('card')} className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-colors ${paymentMethod === 'card' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-gray-600 text-gray-400'}`}>カード (S1EP)</button>
          </div>

          {paymentMethod === 'card' && (
            <div className="bg-white/5 rounded-xl p-4 mb-4">
              <label className="text-xs text-gray-400 block mb-1">カード決済金額（端末に手入力）</label>
              <input type="number" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} placeholder={`¥${total.toLocaleString()}`} className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-500 mt-1">※外部端末(S1EP)に上記金額を手入力してください</p>
            </div>
          )}

          {/* 割り勘 */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gray-300">割り勘</h3>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-400">人数:</span>
              <div className="flex gap-1">
                {[0, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => setSplitCount(n)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${splitCount === n ? 'bg-[#d4af37] text-black' : 'bg-white/10 text-gray-300'}`}>
                    {n === 0 ? 'なし' : `${n}人`}
                  </button>
                ))}
              </div>
            </div>
            {splitCount > 0 && (
              <div className="mt-2 text-sm text-[#d4af37] font-bold">
                1人あたり: ¥{perPerson.toLocaleString()} ({splitCount}人)
              </div>
            )}
          </div>

          {/* 特別値引き */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold mb-2 text-gray-300">特別値引き</h3>
            <input type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="値引き金額" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="値引き理由（必須）" className="w-full bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
            {discount > 0 && !discountReason && <p className="text-xs text-red-400 mt-1">金額と理由の両方を入力してください</p>}
          </div>

          {/* 合計 */}
          <div className="bg-[#16213e] rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-400">小計（ドリンク+指名料）</span><span>¥{subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">セット料金</span><span>¥{setFee.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">TAX（小計×20%）</span><span>¥{tax.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">税抜合計</span><span>¥{(subtotal + setFee + tax).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">消費税（税抜合計×10%）</span><span>¥{consumptionTax.toLocaleString()}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-red-400"><span>値引き</span><span>-¥{discount.toLocaleString()}</span></div>}
            <div className="border-t border-gray-600 pt-2 flex justify-between">
              <span className="font-bold text-lg">{discount > 0 ? '値引き後合計' : '合計'}</span>
              <span className="font-bold text-2xl text-[#d4af37]">¥{total.toLocaleString()}</span>
            </div>
          </div>

          <button onClick={() => setShowConfirm(true)} disabled={discount > 0 && !discountReason} className="w-full mt-4 bg-[#e94560] py-4 rounded-xl text-lg font-bold active:bg-[#c73550] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">会計確定</button>
        </div>
      )}

      {/* 確認モーダル */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-3">会計確定</h2>
            <p className="text-sm text-gray-300 mb-2">卓 {table.number} の会計を確定しますか？</p>
            <p className="text-2xl font-bold text-[#d4af37] mb-2">¥{total.toLocaleString()}</p>
            {splitCount > 0 && <p className="text-sm text-gray-300 mb-2">割り勘: ¥{perPerson.toLocaleString()} x {splitCount}人</p>}
            <p className="text-sm text-gray-400 mb-4">支払方法: {paymentMethod === 'cash' ? '現金' : 'カード'}</p>
            {discount > 0 && <p className="text-sm text-red-400 mb-4">値引き: -¥{discount.toLocaleString()} ({discountReason})</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-white/10 py-3 rounded-lg font-bold text-gray-400">戻る</button>
              <button onClick={handleComplete} className="flex-1 bg-[#e94560] py-3 rounded-lg font-bold">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 監査ログ表示コンポーネント
function AuditLogView({ logs, onClose }: { logs: import('../data/mock').DiscountLog[]; onClose?: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      {onClose && (
        <button onClick={onClose} className="text-sm text-gray-400 mb-3">&larr; 戻る</button>
      )}
      <h3 className="text-sm font-bold mb-3 text-gray-300">値引き監査ログ</h3>
      {logs.length === 0 ? (
        <div className="text-center text-gray-500 mt-8">
          <p>値引き履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold">卓 {log.tableNumber}</span>
                <span className="text-gray-400 text-xs">{log.timestamp}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">正規料金: </span>
                  <span>¥{log.originalTotal.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">値引き額: </span>
                  <span className="text-red-400">-¥{log.discountAmount.toLocaleString()}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400">理由: </span>
                  <span>{log.reason}</span>
                </div>
                <div>
                  <span className="text-gray-400">操作者: </span>
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
