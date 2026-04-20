import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Pencil, X, Trash2, Printer, Download } from 'lucide-react'
import { openPrintWindow } from '../utils/print'
import type { DailyReport } from '../data/mock'

type RegisterTab = 'closing' | 'history'

export default function RegisterPage() {
  const [activeTab, setActiveTab] = useState<RegisterTab>('closing')

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4">
        <h2 className="text-lg font-bold mb-3 text-[#d4af37]">レジ</h2>
        <div className="flex border-b border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('closing')}
            className={`flex-1 px-4 py-3 text-sm font-bold tracking-wide transition-colors relative ${
              activeTab === 'closing' ? 'text-white' : 'text-gray-500'
            }`}
          >
            締め処理
            {activeTab === 'closing' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-4 py-3 text-sm font-bold tracking-wide transition-colors relative ${
              activeTab === 'history' ? 'text-white' : 'text-gray-500'
            }`}
          >
            日報履歴
            {activeTab === 'history' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>
      </div>

      {activeTab === 'closing' ? <ClosingView /> : <HistoryView />}
    </div>
  )
}

// ─── 締め処理タブ ───

function ClosingView() {
  const { billingRecords: allBillingRecords, dailyPayRequests, storeSettings, expenses, advancePayments, addDailyReport } = useStore()
  const { user } = useAuth()

  const [initialCash, setInitialCash] = useState(storeSettings.initialCash)
  const [actualCash, setActualCash] = useState('')
  const [showEditInitial, setShowEditInitial] = useState(false)
  const [tempInitial, setTempInitial] = useState('')
  const [note, setNote] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  // レジ締めは本日分の会計のみ対象
  const todayStr = new Date().toISOString().slice(0, 10)
  const billingRecords = useMemo(
    () => allBillingRecords.filter((r) => (r.date ?? todayStr) === todayStr),
    [allBillingRecords, todayStr],
  )

  const salesSummary = useMemo(() => {
    const cashSales = billingRecords
      .filter((r) => r.paymentMethod === 'cash')
      .reduce((s, r) => s + r.total, 0)
    const cardSales = billingRecords
      .filter((r) => r.paymentMethod === 'card')
      .reduce((s, r) => s + r.total, 0)
    const mixedCash = billingRecords
      .filter((r) => r.paymentMethod === 'mixed')
      .reduce((s, r) => s + (r.cashAmount ?? 0), 0)
    const mixedCard = billingRecords
      .filter((r) => r.paymentMethod === 'mixed')
      .reduce((s, r) => s + (r.cardAmount ?? 0), 0)
    const totalCardFees = billingRecords.reduce((s, r) => s + (r.cardFee ?? 0), 0)
    return {
      cashSales: cashSales + mixedCash,
      cardSales: cardSales + mixedCard,
      total: cashSales + cardSales + mixedCash + mixedCard,
      totalCardFees,
    }
  }, [billingRecords])

  const dailyPayTotal = useMemo(
    () => dailyPayRequests.reduce((s, r) => s + r.amount, 0),
    [dailyPayRequests],
  )
  const cashExpenseTotal = useMemo(
    () => expenses.filter((e) => e.source === 'register').reduce((s, e) => s + e.amount, 0),
    [expenses],
  )
  const cashAdvanceTotal = useMemo(
    () => advancePayments.filter((p) => p.source === 'register').reduce((s, p) => s + p.amount, 0),
    [advancePayments],
  )

  const theoreticalCash =
    initialCash + salesSummary.cashSales - dailyPayTotal - cashExpenseTotal - cashAdvanceTotal
  const actualCashNum = Number(actualCash) || 0
  const difference = actualCashNum - theoreticalCash
  const hasActualInput = actualCash !== ''

  const paymentMethodLabel = (m: string) => (m === 'cash' ? '現金' : m === 'card' ? 'カード' : '現金+カード')

  const handleSaveDailyReport = () => {
    if (!hasActualInput) return
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    addDailyReport({
      id: Date.now(),
      date,
      initialCash,
      cashSales: salesSummary.cashSales,
      cardSales: salesSummary.cardSales,
      totalSales: salesSummary.total,
      dailyPayTotal,
      cashExpenseTotal,
      cashAdvanceTotal,
      theoreticalCash,
      actualCash: actualCashNum,
      difference,
      note,
      operator: user?.displayName ?? user?.username ?? '-',
      createdAt: now.toISOString(),
    })
    setNote('')
    setActualCash('')
    setSavedMessage('日報を登録しました')
    setTimeout(() => setSavedMessage(''), 2500)
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6">
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-4">
        <div>
          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-500 mb-1">レジ初期値</div>
                <div className="text-lg font-bold tabular-nums">¥{initialCash.toLocaleString()}</div>
              </div>
              <button
                onClick={() => { setShowEditInitial(true); setTempInitial(String(initialCash)) }}
                className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-sm text-gray-400 flex items-center gap-1.5 transition-colors"
              >
                <Pencil size={12} /> 変更
              </button>
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-400">本日の売上</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">現金売上</span>
                <span className="tabular-nums">¥{salesSummary.cashSales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">カード売上</span>
                <span className="tabular-nums">¥{salesSummary.cardSales.toLocaleString()}</span>
              </div>
              {salesSummary.totalCardFees > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">カード手数料合計</span>
                  <span className="text-blue-400 tabular-nums">¥{salesSummary.totalCardFees.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
                <span>売上合計</span>
                <span className="text-[#d4af37] tabular-nums">¥{salesSummary.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {billingRecords.length > 0 && (
            <div className="bg-white/5 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-bold mb-3 text-gray-400">会計明細</h3>
              <div className="divide-y divide-white/5">
                {billingRecords.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm py-1.5">
                    <span className="text-gray-500">卓{r.tableNumber} ({r.timestamp})</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        r.paymentMethod === 'cash' ? 'bg-emerald-500/10 text-emerald-400' :
                        r.paymentMethod === 'card' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-purple-500/10 text-purple-400'
                      }`}>
                        {paymentMethodLabel(r.paymentMethod)}
                      </span>
                      <span className="tabular-nums">¥{r.total.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-400">日払い支払</h3>
            {dailyPayRequests.length === 0 ? (
              <p className="text-sm text-gray-600">日払いなし</p>
            ) : (
              <div className="divide-y divide-white/5 mb-2">
                {dailyPayRequests.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm py-1.5">
                    <span className="text-gray-500">{r.castName} ({r.date})</span>
                    <span className="tabular-nums">¥{r.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
              <span>日払い合計</span>
              <span className="text-red-400 tabular-nums">-¥{dailyPayTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white/10 rounded-lg p-4 mb-4 space-y-2">
            <h3 className="text-sm font-bold mb-2 text-gray-400">レジ計算</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">レジ初期値</span>
              <span className="tabular-nums">¥{initialCash.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">+ 現金売上</span>
              <span className="tabular-nums">¥{salesSummary.cashSales.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">- 日払い支払</span>
              <span className="text-red-400 tabular-nums">-¥{dailyPayTotal.toLocaleString()}</span>
            </div>
            {cashExpenseTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">- 現金経費</span>
                <span className="text-red-400 tabular-nums">-¥{cashExpenseTotal.toLocaleString()}</span>
              </div>
            )}
            {cashAdvanceTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">- レジ現金からの前借り</span>
                <span className="text-red-400 tabular-nums">-¥{cashAdvanceTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="font-bold">理論有高</span>
              <span className="font-bold text-xl text-[#d4af37] tabular-nums">¥{theoreticalCash.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <label className="text-xs text-gray-500 block mb-1.5">実有高（実際のレジ内金額）</label>
            <input
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              placeholder="金額を入力"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-lg font-bold"
            />
          </div>

          {hasActualInput && (
            <div className={`rounded-lg p-4 mb-4 ${difference >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              <div className="flex justify-between items-center">
                <span className="font-bold">過不足</span>
                <span className={`font-bold text-2xl tabular-nums ${difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {difference >= 0 ? '+' : ''}¥{difference.toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1 tabular-nums">
                実有高 ¥{actualCashNum.toLocaleString()} - 理論有高 ¥{theoreticalCash.toLocaleString()}
              </div>
            </div>
          )}

          <div className="bg-white/5 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold mb-3 text-gray-400">日報登録</h3>
            <label className="text-xs text-gray-500 block mb-1.5">備考・メモ（過不足の理由など）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：釣銭間違い、両替ミス、特記事項など"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
            />
            <button
              onClick={handleSaveDailyReport}
              disabled={!hasActualInput}
              className="w-full bg-[#d4af37] disabled:bg-white/10 disabled:text-gray-600 text-black py-3 rounded-lg font-bold"
            >
              日報を登録
            </button>
            {!hasActualInput && (
              <p className="text-xs text-gray-600 mt-2 text-center">実有高を入力すると登録できます</p>
            )}
            {savedMessage && (
              <p className="text-xs text-emerald-400 mt-2 text-center">{savedMessage}</p>
            )}
          </div>
        </div>
      </div>

      {showEditInitial && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowEditInitial(false)}>
          <div className="bg-[#1a1a2e] rounded-lg w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">レジ初期値変更</h2>
              <button onClick={() => setShowEditInitial(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <input
              type="number"
              value={tempInitial}
              onChange={(e) => setTempInitial(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowEditInitial(false)} className="flex-1 bg-white/5 border border-white/10 py-3 rounded-lg font-bold text-gray-500">キャンセル</button>
              <button onClick={() => { setInitialCash(Number(tempInitial) || 100000); setShowEditInitial(false) }} className="flex-1 bg-white text-black py-3 rounded-lg font-bold">変更</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 日報履歴タブ ───

type RangeKey = 'today' | 'week' | 'month' | 'all' | 'custom'

function HistoryView() {
  const { dailyReports, removeDailyReport, storeSettings } = useStore()
  const [range, setRange] = useState<RangeKey>('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    const sorted = [...dailyReports].sort((a, b) => b.date.localeCompare(a.date))
    if (range === 'all') return sorted
    if (range === 'today') return sorted.filter((r) => r.date === todayStr)
    if (range === 'week') {
      const d = new Date(today)
      d.setDate(d.getDate() - 7)
      const from = d.toISOString().slice(0, 10)
      return sorted.filter((r) => r.date >= from)
    }
    if (range === 'month') {
      const prefix = todayStr.slice(0, 7)
      return sorted.filter((r) => r.date.startsWith(prefix))
    }
    if (range === 'custom') {
      return sorted.filter((r) => {
        if (fromDate && r.date < fromDate) return false
        if (toDate && r.date > toDate) return false
        return true
      })
    }
    return sorted
  }, [dailyReports, range, fromDate, toDate, todayStr, today])

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        cashSales: acc.cashSales + r.cashSales,
        difference: acc.difference + r.difference,
        count: acc.count + 1,
      }),
      { totalSales: 0, cashSales: 0, difference: 0, count: 0 },
    )
  }, [filtered])

  const handlePrintReport = (r: DailyReport) => {
    const body = `
      <h2>${storeSettings.storeName || "CLUB GALAXY"} レジ日報</h2>
      <div class="center muted">${r.date} / 登録者: ${r.operator}</div>
      <table>
        <tr><th>レジ初期値</th><td>¥${r.initialCash.toLocaleString()}</td></tr>
        <tr><th>現金売上</th><td>¥${r.cashSales.toLocaleString()}</td></tr>
        <tr><th>カード売上</th><td>¥${r.cardSales.toLocaleString()}</td></tr>
        <tr><th>売上合計</th><td>¥${r.totalSales.toLocaleString()}</td></tr>
        <tr><th>日払い合計</th><td>-¥${r.dailyPayTotal.toLocaleString()}</td></tr>
        <tr><th>現金経費</th><td>-¥${r.cashExpenseTotal.toLocaleString()}</td></tr>
        <tr><th>レジ現金前借り</th><td>-¥${r.cashAdvanceTotal.toLocaleString()}</td></tr>
        <tr><th>理論有高</th><td>¥${r.theoreticalCash.toLocaleString()}</td></tr>
        <tr><th>実有高</th><td>¥${r.actualCash.toLocaleString()}</td></tr>
        <tr><th class="bold">過不足</th><td class="bold">${r.difference >= 0 ? '+' : ''}¥${r.difference.toLocaleString()}</td></tr>
      </table>
      ${r.note ? `<div style="margin-top:10px;"><strong>備考:</strong><br>${r.note.replace(/\n/g, '<br>')}</div>` : ''}
      <div class="sign">店長サイン</div>
    `
    openPrintWindow(body, `日報_${r.date}`, { width: 400, height: 600 })
  }

  const handleExportCSV = () => {
    const BOM = '\uFEFF'
    const headers = ['日付', '登録者', 'レジ初期値', '現金売上', 'カード売上', '売上合計', '日払い', '現金経費', '前借り', '理論有高', '実有高', '過不足', '備考']
    const rows = filtered.map((r) => [
      r.date, r.operator, r.initialCash, r.cashSales, r.cardSales, r.totalSales,
      r.dailyPayTotal, r.cashExpenseTotal, r.cashAdvanceTotal, r.theoreticalCash, r.actualCash, r.difference,
      `"${(r.note || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ].join(','))
    const csv = BOM + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `日報履歴_${todayStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rangeLabel = (k: RangeKey) => {
    switch (k) {
      case 'today': return '今日'
      case 'week': return '今週'
      case 'month': return '今月'
      case 'all': return '全期間'
      case 'custom': return '期間指定'
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6">
      {/* フィルタ */}
      <div className="bg-white/5 rounded-lg p-3 mb-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          {(['today', 'week', 'month', 'all', 'custom'] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                range === k ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'
              }`}
            >
              {rangeLabel(k)}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs" />
            <span className="text-gray-500 text-xs">〜</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs" />
          </div>
        )}
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">対象件数</div>
          <div className="text-lg font-bold tabular-nums">{summary.count}件</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">売上合計</div>
          <div className="text-lg font-bold text-[#d4af37] tabular-nums">¥{summary.totalSales.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">現金売上合計</div>
          <div className="text-lg font-bold tabular-nums">¥{summary.cashSales.toLocaleString()}</div>
        </div>
        <div className={`rounded-lg p-3 ${summary.difference >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          <div className="text-xs text-gray-500 mb-1">過不足累計</div>
          <div className={`text-lg font-bold tabular-nums ${summary.difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summary.difference >= 0 ? '+' : ''}¥{summary.difference.toLocaleString()}
          </div>
        </div>
      </div>

      {/* CSV出力 */}
      {filtered.length > 0 && (
        <button
          onClick={handleExportCSV}
          className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 mb-4 text-sm text-gray-400 flex items-center justify-center gap-2 transition-colors"
        >
          <Download size={14} /> CSV出力（{filtered.length}件）
        </button>
      )}

      {/* 日報一覧 */}
      {filtered.length === 0 ? (
        <div className="bg-white/5 rounded-lg p-8 text-center text-sm text-gray-600">
          対象期間に日報がありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white/5 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-base font-bold">{r.date}</div>
                  <div className="text-xs text-gray-500">登録者: {r.operator}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handlePrintReport(r)}
                    className="bg-white/5 border border-white/10 p-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="日報印刷"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() => removeDailyReport(r.id)}
                    className="bg-white/5 border border-white/10 p-2 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                    title="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">売上合計</span>
                  <span className="tabular-nums">¥{r.totalSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">現金売上</span>
                  <span className="tabular-nums">¥{r.cashSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">カード売上</span>
                  <span className="tabular-nums">¥{r.cardSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">日払い</span>
                  <span className="text-red-400 tabular-nums">-¥{r.dailyPayTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">理論有高</span>
                  <span className="tabular-nums">¥{r.theoreticalCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">実有高</span>
                  <span className="tabular-nums">¥{r.actualCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between col-span-2 pt-1.5 mt-1 border-t border-white/5">
                  <span className="text-gray-500 font-bold">過不足</span>
                  <span className={`font-bold tabular-nums ${r.difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.difference >= 0 ? '+' : ''}¥{r.difference.toLocaleString()}
                  </span>
                </div>
              </div>
              {r.note && (
                <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-400 whitespace-pre-wrap">
                  {r.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
