import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { type BackType } from '../data/mock'
import { computeDailyWork } from '../utils/dailyWork'
import { getJstTodayDateString, getTodayBusinessDay } from '../utils/businessDay'
import { getBackRate } from '../utils/backRate'
import ContextualHeader from '../components/ContextualHeader'
import { calcHourlyPay } from '../utils/payroll'
import VisitBreakdownView from '../components/VisitBreakdownView'
import { computeVisitBreakdown, isMergedShadowRecord } from '../utils/visitBreakdown'
import { ChevronDown, ChevronUp, FileDown, Printer } from 'lucide-react'
import {
  buildMonthlySalesCsv,
  buildMonthlySalesDetailCsv,
  downloadCsv,
} from '../utils/taxCsv'

type Granularity = 'day' | 'month' | 'year'
type ViewMode = 'today' | 'trend' | 'calendar' | 'cast'

function flColor(rate: number) {
  if (rate <= 60) return 'text-emerald-400'
  if (rate <= 70) return 'text-amber-400'
  return 'text-red-400'
}

function flBg(rate: number) {
  if (rate <= 60) return 'bg-emerald-400'
  if (rate <= 70) return 'bg-amber-400'
  return 'bg-red-400'
}

export default function ProfitPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('today')
  const { flMetrics } = useStore()

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader
        accent="profit"
        title="利益管理"
        backTo="/top"
        right={
          <div className="hidden md:flex items-center gap-3 text-xs">
            <span className="text-gray-400">本日利益:</span>
            <span className="tabular-nums font-bold text-gold">¥{flMetrics.todayProfit.toLocaleString()}</span>
            <span className="text-gray-400">FL:</span>
            <span className={`tabular-nums font-bold ${flColor(flMetrics.flRate)}`}>{flMetrics.flRate.toFixed(1)}%</span>
          </div>
        }
      />
      <div className="p-4 space-y-4 flex-1">

      <div className="flex border-b border-white/10 overflow-x-auto">
        {(['today', 'trend', 'calendar', 'cast'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`flex-1 min-w-[80px] px-3 py-2.5 text-sm font-bold tracking-wide transition-colors relative ${
              viewMode === m ? 'text-white' : 'text-gray-500'
            }`}
          >
            {m === 'today' ? '本日' : m === 'trend' ? '店舗推移' : m === 'calendar' ? 'カレンダー' : 'キャスト推移'}
            {viewMode === m && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {viewMode === 'today' && <TodayView />}
      {viewMode === 'trend' && <StoreTrendView />}
      {viewMode === 'calendar' && <CalendarView />}
      {viewMode === 'cast' && <CastTrendView />}
      </div>
    </div>
  )
}

// ─── 本日ビュー ───

function TodayView() {
  const { flMetrics, billingRecords, menuCategories, setPrices } = useStore()
  // JST 営業日 (UTC 起点だと 0〜9 時で前日になるので +9h して slice)
  const todayBusinessDate = getJstTodayDateString()
  // 本日の組（取消除外）。businessDate を優先、無ければ date / completedAt から抽出。
  const todayVisits = useMemo(() => {
    return billingRecords.filter((r) => {
      if (r.voidedAt) return false
      if (isMergedShadowRecord(r)) return false // 合算 shadow は代表卓 record に含まれる
      const d = r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)
      return d === todayBusinessDate
    })
  }, [billingRecords, todayBusinessDate])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white/5 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-400">本日</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">売上</div>
              <div className="text-lg font-bold tabular-nums">¥{flMetrics.todaySales.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">利益</div>
              <div className={`text-lg font-bold tabular-nums ${flMetrics.todayProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ¥{flMetrics.todayProfit.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">原価 (F)</div>
              <div className="text-sm tabular-nums">¥{flMetrics.foodCost.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">人件費 (L)</div>
              <div className="text-sm tabular-nums">¥{flMetrics.laborCost.toLocaleString()}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500">カード手数料経費 (3.5%)</div>
              <div className="text-sm tabular-nums text-red-400/80">¥{flMetrics.cardProcessingCost.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <span className="text-xs text-gray-500">FL率</span>
            <span className={`text-sm font-bold tabular-nums ${flColor(flMetrics.flRate)}`}>
              {flMetrics.flRate.toFixed(1)}%
            </span>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${flBg(flMetrics.flRate)}`} style={{ width: `${Math.min(flMetrics.flRate, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">今月累計</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">累計利益</div>
              <div className={`text-lg font-bold tabular-nums ${flMetrics.monthlyProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ¥{flMetrics.monthlyProfit.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">FL率</div>
              <div className={`text-lg font-bold tabular-nums ${flColor(flMetrics.monthlyFlRate)}`}>
                {flMetrics.monthlyFlRate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF/Word 要件: 本日の売上の伝票それぞれの内訳を「下の方に詳細の内訳を表示」 */}
      <DailyVisitDetailPanel
        title={`本日 (${todayBusinessDate}) の組別内訳`}
        emptyText="本日の会計はまだありません"
        records={todayVisits}
        menuCategories={menuCategories}
        setPrices={setPrices}
      />
    </div>
  )
}

/**
 * 指定日（または任意期間）の組ごとの売上明細パネル。
 *
 * PDF/Word 要件:
 *   - 「店舗推移の日別、日別には特定日の伝票の件数、一件一件の内訳」
 *   - 「本日の売上。伝票それぞれの内訳の詳細」
 *   - 「利益管理 本日クリックで売上やFLが出てますが内訳がない。下の方に詳細の内訳」
 *   - ドリンク/ウイスキー/シャンパン等の商品カテゴリ別の内訳
 *   - キャスト別の売上・バック・給与に関わる明細をリアルタイム確認できる導線
 */
function DailyVisitDetailPanel({
  title,
  emptyText,
  records,
  menuCategories,
  setPrices,
}: {
  title: string
  emptyText: string
  records: import('../data/mock').BillingRecord[]
  menuCategories: import('../data/mock').MenuCategory[]
  setPrices: import('../data/mock').SetPrice[]
}) {
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 完了時刻の早い順に表示（営業時間中の流れを上から追える）。
  const sorted = useMemo(
    () => [...records].sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
    [records],
  )
  const subtotal = sorted
    .filter((r) => !r.voidedAt && !isMergedShadowRecord(r))
    .reduce((s, r) => s + r.total, 0)

  // カテゴリ別合計（メニュー側のみ、指名/チャージは除外）— 概況用。
  const categorySummary = useMemo(() => {
    const agg = new Map<string, { label: string; qty: number; sub: number }>()
    for (const r of sorted) {
      if (r.voidedAt) continue
      const b = computeVisitBreakdown(r, menuCategories, setPrices)
      for (const c of b.categoryTotals) {
        const e = agg.get(c.subcategory)
        if (e) {
          e.qty += c.quantity
          e.sub += c.subtotal
        } else {
          agg.set(c.subcategory, {
            label: c.categoryLabel,
            qty: c.quantity,
            sub: c.subtotal,
          })
        }
      }
    }
    return [...agg.values()].sort((a, b) => b.sub - a.sub)
  }, [sorted, menuCategories, setPrices])

  return (
    <div className="bg-white/5 rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-gray-400">{title}</h3>
        <div className="text-xs text-gray-500">
          {sorted.filter((r) => !r.voidedAt).length} 組 / 売上 ¥{subtotal.toLocaleString()}
        </div>
      </div>

      {/* 商品カテゴリ別概況（メニューのみ） */}
      {categorySummary.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">商品カテゴリ別 概況</div>
          <div className="flex flex-wrap gap-1.5">
            {categorySummary.map((c) => (
              <span
                key={c.label}
                className="text-[11px] bg-white/[0.04] border border-white/10 rounded px-2 py-0.5 tabular-nums"
              >
                {c.label}: {c.qty}件 / ¥{c.sub.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const isExpanded = expandedId === r.id
            const isVoided = !!r.voidedAt
            const time = new Date(r.completedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit', minute: '2-digit',
            })
            return (
              <div key={r.id} className={`bg-white/[0.03] rounded border border-white/5 ${isVoided ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.05]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold">{r.tableNumber}卓</span>
                    <span className="text-xs text-gray-500">{time}</span>
                    {r.receiptSnapshot && (
                      <span className="text-[10px] text-gray-500">
                        No.{r.receiptSnapshot.receiptNumber}
                      </span>
                    )}
                    {r.castNamesSnapshot && r.castNamesSnapshot.length > 0 && (
                      <span className="text-xs text-gray-400 truncate">
                        担当: {r.castNamesSnapshot.join(', ')}
                      </span>
                    )}
                    {isVoided && (
                      <span className="text-[10px] px-1.5 rounded bg-red-500/20 text-red-400">取消</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-bold tabular-nums ${isVoided ? 'line-through text-gray-500' : 'text-gold'}`}>
                      ¥{r.total.toLocaleString()}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-gray-500" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-500" />
                    )}
                  </div>
                </button>
                {isExpanded && r.receiptSnapshot && (
                  <div className="border-t border-white/5 p-3 space-y-3">
                    <VisitBreakdownView
                      b={computeVisitBreakdown(r, menuCategories, setPrices)}
                    />
                    {/* BillingPage の SplitIssueModal を `?splitId=...&returnTo=/profit`
                        で開き、閉じた時に /profit に戻る。 */}
                    <button
                      onClick={() => {
                        const ret = encodeURIComponent('/profit')
                        navigate(`/billing?splitId=${encodeURIComponent(r.id)}&returnTo=${ret}`)
                      }}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Printer size={12} /> 領収書発行
                    </button>
                  </div>
                )}
                {isExpanded && !r.receiptSnapshot && (
                  <div className="border-t border-white/5 p-3 text-xs text-gray-500">
                    ※ 旧レコードのため詳細内訳がありません
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 店舗推移ビュー (日/月/年別) ───

function StoreTrendView() {
  const { billingRecords, expenses, storeSettings, menuCategories, setPrices } = useStore()
  const [granularity, setGranularity] = useState<Granularity>('month')
  /** 追補03 R22: ドリルダウン用 — 年/月から day へ降りる際の絞り込みキー */
  const [drilldownScope, setDrilldownScope] = useState<string | null>(null)
  /** 追補03 R22: 期間内の特定日を選択した際の詳細表示 */
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)

  const buckets = useMemo(() => {
    const today = new Date()
    const keyOf = (date: string): string => {
      if (granularity === 'day') return date
      if (granularity === 'month') return date.slice(0, 7)
      return date.slice(0, 4)
    }
    // バケットラベルを時系列で生成
    const labels: string[] = []
    if (granularity === 'day') {
      // ドリルダウンスコープ (例: '2026-04') があればその月の日付、なければ過去 30 日
      if (drilldownScope && drilldownScope.length === 7) {
        const [y, m] = drilldownScope.split('-').map(Number)
        const daysInMonth = new Date(y, m, 0).getDate()
        for (let d = 1; d <= daysInMonth; d++) {
          labels.push(`${drilldownScope}-${String(d).padStart(2, '0')}`)
        }
      } else {
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today)
          d.setDate(d.getDate() - i)
          labels.push(d.toISOString().slice(0, 10))
        }
      }
    } else if (granularity === 'month') {
      // ドリルダウンスコープ (例: '2026') があればその年の 12 ヶ月、なければ過去 12 ヶ月
      if (drilldownScope && drilldownScope.length === 4) {
        for (let m = 1; m <= 12; m++) {
          labels.push(`${drilldownScope}-${String(m).padStart(2, '0')}`)
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
          labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        labels.push(String(today.getFullYear() - i))
      }
    }

    const map = new Map<string, { sales: number; cardSales: number; expense: number }>()
    labels.forEach((l) => map.set(l, { sales: 0, cardSales: 0, expense: 0 }))

    for (const r of billingRecords) {
      // 合算 shadow は代表卓 record に総額が含まれるため売上集計から除外（二重計上防止）。
      if (isMergedShadowRecord(r)) continue
      const d = r.businessDate ?? r.date ?? getJstTodayDateString()
      const k = keyOf(d)
      const b = map.get(k)
      if (!b) continue
      b.sales += r.total
      if (r.paymentMethod === 'card') b.cardSales += r.total
      else if (r.paymentMethod === 'mixed') b.cardSales += r.cardAmount ?? 0
    }
    for (const e of expenses) {
      const k = keyOf(e.date)
      const b = map.get(k)
      if (!b) continue
      b.expense += e.amount
    }

    return labels.map((l) => {
      const b = map.get(l)!
      const foodEstimate = Math.round(b.sales * 0.12)
      const laborEstimate = Math.round(b.sales * 0.30)
      const cardFee = Math.round(b.cardSales * storeSettings.cardProcessingFeeRate)
      const profit = b.sales - foodEstimate - laborEstimate - cardFee - b.expense
      return { label: l, sales: b.sales, expense: b.expense, cardFee, profit, foodEstimate, laborEstimate }
    })
  }, [billingRecords, expenses, granularity, drilldownScope, storeSettings.cardProcessingFeeRate])

  const totals = useMemo(() => {
    return buckets.reduce(
      (acc, b) => ({
        sales: acc.sales + b.sales,
        expense: acc.expense + b.expense,
        profit: acc.profit + b.profit,
      }),
      { sales: 0, expense: 0, profit: 0 },
    )
  }, [buckets])

  const maxSales = Math.max(...buckets.map((b) => b.sales), 1)

  const shortLabel = (l: string) => {
    if (granularity === 'day') return l.slice(5).replace('-', '/')
    if (granularity === 'month') return l.slice(5) + '月'
    return l + '年'
  }

  return (
    <div className="space-y-4">
      {/* 粒度切替 */}
      <div className="flex gap-2">
        {(['day', 'month', 'year'] as Granularity[]).map((g) => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              granularity === g ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'
            }`}
          >
            {g === 'day' ? '日別' : g === 'month' ? '月別' : '年別'}
          </button>
        ))}
      </div>

      {/* 集計サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">売上合計</div>
          <div className="text-base font-bold text-gold tabular-nums">¥{totals.sales.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">経費合計</div>
          <div className="text-base font-bold text-red-400 tabular-nums">¥{totals.expense.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">推定利益</div>
          <div className={`text-base font-bold tabular-nums ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ¥{totals.profit.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 月別ビュー時のみ: 税理士提出用の月次売上 CSV を 1組1行 + 内訳の 2 種類で出す。
          バー (月) クリックで selectedBucket=月、それを対象月にする。未選択時は今月。 */}
      {granularity === 'month' && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          {(() => {
            const now = new Date()
            const defaultPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const monthPrefix =
              selectedBucket && /^\d{4}-\d{2}$/.test(selectedBucket)
                ? selectedBucket
                : defaultPrefix
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">
                    税理士提出用 CSV（対象月: <span className="font-bold text-gold">{monthPrefix}</span>）
                    {selectedBucket !== monthPrefix && (
                      <span className="ml-2 text-[10px] text-gray-500">
                        ※棒グラフで月を選ぶと切替
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const csv = buildMonthlySalesCsv(billingRecords, monthPrefix)
                      downloadCsv(`sales-${monthPrefix}.csv`, csv)
                    }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded hover:bg-white/10"
                  >
                    <FileDown size={12} /> 月次売上 (1組1行)
                  </button>
                  <button
                    onClick={() => {
                      const csv = buildMonthlySalesDetailCsv(
                        billingRecords, monthPrefix, menuCategories, setPrices,
                      )
                      downloadCsv(`sales-detail-${monthPrefix}.csv`, csv)
                    }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded hover:bg-white/10"
                  >
                    <FileDown size={12} /> 月次売上 (伝票内訳)
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* 追補03 R22: 棒グラフ — クリックで日詳細にドリルダウン */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">
          売上推移
          <span className="text-[10px] text-gray-500 ml-2 font-normal">バーをタップして詳細表示</span>
        </h3>
        <div className="flex items-end gap-1 h-48 overflow-x-auto">
          {buckets.map((b) => {
            const h = b.sales > 0 ? (b.sales / maxSales) * 100 : 0
            const isSelected = selectedBucket === b.label
            return (
              <button
                key={b.label}
                onClick={() => {
                  if (granularity === 'year') {
                    // 年バーをクリック → その年の月別ビューへ
                    setDrilldownScope(b.label)
                    setGranularity('month')
                    setSelectedBucket(null)
                  } else if (granularity === 'month') {
                    // 月バーをクリック → その月の日別ビューへ
                    setDrilldownScope(b.label)
                    setGranularity('day')
                    setSelectedBucket(null)
                  } else {
                    // 日バーをクリック → その日の詳細を選択
                    setSelectedBucket(isSelected ? null : b.label)
                  }
                }}
                className={`flex-1 min-w-[24px] flex flex-col items-center justify-end h-full hover:opacity-80 transition-opacity ${isSelected ? 'ring-2 ring-gold' : ''}`}
              >
                <span className="text-[10px] text-gray-500 tabular-nums mb-1">
                  {b.sales > 0 ? `¥${(b.sales / 1000).toFixed(0)}k` : ''}
                </span>
                <div
                  className="w-full rounded-t bg-gold/80"
                  style={{ height: `${Math.max(h, 2)}%`, opacity: b.sales > 0 ? 1 : 0.2 }}
                />
                <span className="text-[10px] text-gray-500 mt-1">{shortLabel(b.label)}</span>
              </button>
            )
          })}
        </div>
        {drilldownScope && (
          <button
            onClick={() => {
              setDrilldownScope(null)
              setGranularity(granularity === 'day' ? 'month' : 'year')
              setSelectedBucket(null)
            }}
            className="mt-2 text-xs text-gold hover:text-gold-light"
          >
            ← 上位粒度に戻る ({drilldownScope})
          </button>
        )}
      </div>

      {/* 追補03 R22: 選択された日の詳細 + PDF/Word 要件: 一件一件の内訳 */}
      {selectedBucket && granularity === 'day' && (() => {
        const b = buckets.find((x) => x.label === selectedBucket)
        if (!b) return null
        const dayRecords = billingRecords.filter(
          (r) => (r.businessDate ?? r.date ?? r.completedAt.slice(0, 10)) === b.label
            && !isMergedShadowRecord(r),
        )
        return (
          <div className="space-y-3">
            <div className="bg-gold/10 border border-gold/40 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gold">{b.label} の詳細</h3>
                <button onClick={() => setSelectedBucket(null)} className="text-xs text-gray-400 hover:text-white">閉じる</button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">売上</div>
                  <div className="font-bold text-gold tabular-nums">¥{b.sales.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">経費</div>
                  <div className="font-bold text-red-400 tabular-nums">¥{b.expense.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">原価 (F)</div>
                  <div className="font-bold tabular-nums">¥{b.foodEstimate.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">人件費 (L)</div>
                  <div className="font-bold tabular-nums">¥{b.laborEstimate.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">カード手数料</div>
                  <div className="font-bold tabular-nums">¥{b.cardFee.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">推定利益</div>
                  <div className={`font-bold tabular-nums ${b.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ¥{b.profit.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            {/* 1組ごとの伝票内訳 (組ヘッダ + expand) */}
            <DailyVisitDetailPanel
              title={`${b.label} の組別内訳`}
              emptyText="この日の会計はありません"
              records={dayRecords}
              menuCategories={menuCategories}
              setPrices={setPrices}
            />
          </div>
        )
      })()}

      {/* 明細テーブル */}
      <div className="bg-white/5 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-400 mb-2">明細</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5">期間</th>
              <th className="text-right py-1.5">売上</th>
              <th className="text-right py-1.5">経費</th>
              <th className="text-right py-1.5">カード手数料</th>
              <th className="text-right py-1.5">推定利益</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.label} className="border-b border-white/5">
                <td className="py-1.5">{shortLabel(b.label)}</td>
                <td className="text-right tabular-nums">¥{b.sales.toLocaleString()}</td>
                <td className="text-right tabular-nums text-red-400/80">¥{b.expense.toLocaleString()}</td>
                <td className="text-right tabular-nums text-red-400/60">¥{b.cardFee.toLocaleString()}</td>
                <td className={`text-right tabular-nums ${b.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ¥{b.profit.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-600 mt-2">※原価F・人件費Lは概算(売上の12%・30%)。商品別原価が会計時に保存されれば正確値に自動切替。</p>
      </div>
    </div>
  )
}

// ─── キャスト推移ビュー ───

function CastTrendView() {
  const { casts, billingRecords, attendanceRecords } = useStore()
  const activeCasts = casts.filter((c) => c.active)
  const [castId, setCastId] = useState(activeCasts[0]?.id ?? 0)
  const [granularity, setGranularity] = useState<Granularity>('month')

  const cast = casts.find((c) => c.id === castId)

  const buckets = useMemo(() => {
    if (!cast) return []
    // A2: 本指名ボトルバック按分も含めて集計するため、全キャストの
    // 'ボトルバック'（%単位）を渡す。
    const bottleBackRateByCast: Record<string, number> = {}
    for (const c of casts) {
      bottleBackRateByCast[c.name] = c.backRates['ボトルバック'] ?? 0
    }
    const work = computeDailyWork(
      cast.id, cast.name, attendanceRecords, billingRecords,
      cast.backRates['本指名'] ?? 0, bottleBackRateByCast,
    )
    // dailyWork の date は 'M/D' 形式 → 今年扱い
    const today = new Date()
    const currentYear = today.getFullYear()

    const keyOf = (date: string): string => {
      // 'M/D' を 'YYYY-MM-DD' に補完
      let y = currentYear
      let m = 0
      let d = 0
      if (date.includes('-')) {
        const parts = date.split('-')
        y = parseInt(parts[0], 10)
        m = parseInt(parts[1], 10)
        d = parseInt(parts[2], 10)
      } else {
        const parts = date.split('/')
        m = parseInt(parts[0], 10)
        d = parseInt(parts[1], 10)
      }
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (granularity === 'day') return iso
      if (granularity === 'month') return iso.slice(0, 7)
      return iso.slice(0, 4)
    }

    const labels: string[] = []
    if (granularity === 'day') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        labels.push(d.toISOString().slice(0, 10))
      }
    } else if (granularity === 'month') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        labels.push(String(today.getFullYear() - i))
      }
    }

    const map = new Map<string, { sales: number; hours: number; back: number; gross: number }>()
    labels.forEach((l) => map.set(l, { sales: 0, hours: 0, back: 0, gross: 0 }))

    for (const w of work) {
      const k = keyOf(w.date)
      const b = map.get(k)
      if (!b) continue
      b.sales += w.sales
      b.hours += w.hours
      const backAmount = (Object.keys(w.backs) as BackType[]).reduce(
        (sum, bt) => sum + (w.backs[bt] ?? 0) * getBackRate(cast.backRates, bt),
        0,
      )
      b.back += backAmount
      // 追補03 R25: 15 分単位 + ルーズタイム 15 分
      const hourly = calcHourlyPay(cast.hourlyRate, w.hours)
      b.gross += hourly + backAmount
    }

    // 指示書§5.2: 本指名卓の小計を担当キャストの売上に重畳
    for (const r of billingRecords) {
      if (r.nominatedCastId !== cast.id) continue
      const d = r.businessDate ?? r.date ?? getJstTodayDateString()
      const k = keyOf(d)
      const b = map.get(k)
      if (!b) continue
      b.sales += r.subtotalBeforeTax ?? 0
    }

    return labels.map((l) => {
      const b = map.get(l)!
      // 指示書§4.1: (時給+バック) × 0.9
      const salary = Math.floor(b.gross * 0.9)
      return { label: l, sales: b.sales, hours: b.hours, back: b.back, salary }
    })
  }, [cast, granularity, billingRecords, attendanceRecords, casts])

  const totals = useMemo(() => {
    return buckets.reduce(
      (acc, b) => ({
        sales: acc.sales + b.sales,
        hours: acc.hours + b.hours,
        back: acc.back + b.back,
        salary: acc.salary + b.salary,
      }),
      { sales: 0, hours: 0, back: 0, salary: 0 },
    )
  }, [buckets])

  const maxSales = Math.max(...buckets.map((b) => b.sales), 1)
  const shortLabel = (l: string) => {
    if (granularity === 'day') return l.slice(5).replace('-', '/')
    if (granularity === 'month') return l.slice(5) + '月'
    return l + '年'
  }

  if (!cast) {
    return <div className="text-sm text-gray-500 p-4">キャストがいません</div>
  }

  return (
    <div className="space-y-4">
      {/* キャスト・粒度選択 */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={castId}
          onChange={(e) => setCastId(Number(e.target.value))}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          {activeCasts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        {(['day', 'month', 'year'] as Granularity[]).map((g) => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              granularity === g ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-gray-400'
            }`}
          >
            {g === 'day' ? '日別' : g === 'month' ? '月別' : '年別'}
          </button>
        ))}
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">売上合計</div>
          <div className="text-base font-bold text-gold tabular-nums">¥{totals.sales.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">勤務時間</div>
          <div className="text-base font-bold tabular-nums">{totals.hours}h</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">給与合計</div>
          <div className="text-base font-bold text-emerald-400 tabular-nums">¥{totals.salary.toLocaleString()}</div>
        </div>
      </div>

      {/* 勤怠記録が無いのに売上 or 給与が出ている期間の現場向け注記。
          技術用語（本指名帰属 / フリー卓 / デモデータ 等）は省き、現場が取る
          べき行動を「出勤登録漏れの確認」一点に絞った文言にする。 */}
      {totals.hours === 0 && (totals.salary > 0 || totals.sales > 0) && (
        <div className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 space-y-1">
          <div>この期間は<span className="font-bold">勤怠登録（出勤打刻）がありません</span>。</div>
          <div>そのため時給分は ¥0 で計算されています。</div>
          <div>
            ただし、指名・ドリンク・ボトル等のバック <span className="tabular-nums">¥{totals.back.toLocaleString()}</span> は発生しているため、バック分のみ給与に計上されています。
          </div>
          <div className="text-gray-400">出勤登録漏れがないか確認してください。</div>
        </div>
      )}

      {/* グラフ */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">{cast.name} 売上推移</h3>
        <div className="flex items-end gap-1 h-40 overflow-x-auto">
          {buckets.map((b) => {
            const h = b.sales > 0 ? (b.sales / maxSales) * 100 : 0
            return (
              <div key={b.label} className="flex-1 min-w-[24px] flex flex-col items-center justify-end h-full">
                <span className="text-[10px] text-gray-500 tabular-nums mb-1">
                  {b.sales > 0 ? `¥${(b.sales / 1000).toFixed(0)}k` : ''}
                </span>
                <div
                  className="w-full rounded-t bg-gold/80"
                  style={{ height: `${Math.max(h, 2)}%`, opacity: b.sales > 0 ? 1 : 0.2 }}
                />
                <span className="text-[10px] text-gray-500 mt-1">{shortLabel(b.label)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 明細テーブル */}
      <div className="bg-white/5 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-400 mb-2">明細</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5">期間</th>
              <th className="text-right py-1.5">売上</th>
              <th className="text-right py-1.5">勤務時間</th>
              <th className="text-right py-1.5">バック合計</th>
              <th className="text-right py-1.5">給与</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.label} className="border-b border-white/5">
                <td className="py-1.5">{shortLabel(b.label)}</td>
                <td className="text-right tabular-nums">¥{b.sales.toLocaleString()}</td>
                <td className="text-right tabular-nums">{b.hours}h</td>
                <td className="text-right tabular-nums">¥{b.back.toLocaleString()}</td>
                <td className="text-right tabular-nums text-emerald-400">¥{b.salary.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-600 mt-2">※給与 = (時給×時間+バック) × 0.9 (指示書§4.1)</p>
      </div>
    </div>
  )
}

// ─── カレンダービュー (らくな会計簿風) ───

function CalendarView() {
  const { billingRecords, casts, expenses, menuCategories, setPrices } = useStore()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)  // 1-12
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startWeekday = firstDay.getDay()

  // 追補03 R20/R23: 日別に売上/経費に加えて F (原価) / L (人件費) / FL率を表示
  const dayData = useMemo(() => {
    const map = new Map<string, { sales: number; expense: number; count: number; food: number; labor: number; fl: number }>()
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${monthPrefix}-${String(d).padStart(2, '0')}`
      map.set(ds, { sales: 0, expense: 0, count: 0, food: 0, labor: 0, fl: 0 })
    }
    for (const r of billingRecords) {
      // 合算 shadow は代表卓 record に総額が含まれるため、日別売上/件数から除外（二重計上防止）。
      if (isMergedShadowRecord(r)) continue
      const d = r.businessDate ?? r.date ?? getJstTodayDateString()
      if (!d.startsWith(monthPrefix)) continue
      const b = map.get(d)
      if (b) {
        b.sales += r.total
        b.count += 1
      }
    }
    for (const e of expenses) {
      if (!e.date.startsWith(monthPrefix)) continue
      const b = map.get(e.date)
      if (b) b.expense += e.amount
    }
    // F (原価) と L (人件費) の概算 — 売上の 12% / 30%
    // (商品別原価が会計時に保存されれば正確値に切替予定)
    for (const [, v] of map) {
      v.food = Math.round(v.sales * 0.12)
      v.labor = Math.round(v.sales * 0.30)
      v.fl = v.sales > 0 ? ((v.food + v.labor) / v.sales) * 100 : 0
    }
    return map
  }, [billingRecords, expenses, monthPrefix, daysInMonth])

  const monthTotal = useMemo(() => {
    let s = 0, e = 0
    for (const [, v] of dayData) { s += v.sales; e += v.expense }
    return { sales: s, expense: e }
  }, [dayData])

  const dayDetail = useMemo(() => {
    if (!selectedDay) return null
    // 1組1行表示 + 担当キャスト別集計から合算 shadow を除外（代表卓 record に含まれるため）。
    const records = billingRecords.filter((r) => (r.businessDate ?? r.date ?? '') === selectedDay && !isMergedShadowRecord(r))
    // 担当キャスト別にグループ化
    const grouped = new Map<string, typeof records>()
    for (const r of records) {
      // 本指名なら nominatedCastId、そうでなければ castNamesSnapshot[0] を担当として扱う
      const key = r.nominatedCastId
        ? (casts.find((c) => c.id === r.nominatedCastId)?.name ?? 'フリー')
        : (r.castNamesSnapshot && r.castNamesSnapshot.length > 0 ? r.castNamesSnapshot[0] : 'フリー')
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }
    return { records, grouped }
  }, [selectedDay, billingRecords, casts])

  const cells: (string | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthPrefix}-${String(d).padStart(2, '0')}`)

  const changeMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y -= 1 }
    if (m > 12) { m = 1; y += 1 }
    setMonth(m)
    setYear(y)
    setSelectedDay(null)
  }

  const weekdayColor = (i: number) => (i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400')

  return (
    <div className="space-y-4">
      {/* 月ナビ */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
        <button onClick={() => changeMonth(-1)} className="bg-white/5 border border-white/10 px-3 py-1 rounded text-sm">← 前月</button>
        <span className="text-lg font-bold">{year}年{month}月</span>
        <button onClick={() => changeMonth(+1)} className="bg-white/5 border border-white/10 px-3 py-1 rounded text-sm">翌月 →</button>
      </div>

      {/* 月サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">{month}月 売上</div>
          <div className="text-base font-bold text-gold tabular-nums">¥{monthTotal.sales.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">{month}月 経費</div>
          <div className="text-base font-bold text-red-400 tabular-nums">¥{monthTotal.expense.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">差引(概算)</div>
          <div className={`text-base font-bold tabular-nums ${monthTotal.sales - monthTotal.expense >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ¥{(monthTotal.sales - monthTotal.expense).toLocaleString()}
          </div>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white/5 rounded-lg p-3">
        <div className="grid grid-cols-7 gap-1 mb-2 text-xs text-center">
          {['日', '月', '火', '水', '木', '金', '土'].map((w, i) => (
            <div key={w} className={`py-1 font-bold ${weekdayColor(i)}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((ds, i) => {
            if (!ds) return <div key={`empty-${i}`} className="aspect-square" />
            const data = dayData.get(ds)
            const day = parseInt(ds.slice(-2), 10)
            // セルのキーは businessDate なので「本日」も朝 5:00 境界の営業日で照合
            const isToday = ds === getTodayBusinessDay()
            const isSelected = ds === selectedDay
            const hasData = data && data.sales > 0
            return (
              <button
                key={ds}
                onClick={() => setSelectedDay(ds === selectedDay ? null : ds)}
                className={`aspect-square rounded p-1 text-left transition-all ${
                  isSelected ? 'bg-gold/20 border border-gold/50' :
                  isToday ? 'bg-blue-500/10 border border-blue-500/30' :
                  hasData ? 'bg-white/5 hover:bg-white/10' : 'bg-white/[0.02]'
                }`}
              >
                <div className="text-xs font-bold">{day}</div>
                {data && data.sales > 0 && (
                  <>
                    <div className="text-[9px] text-gold tabular-nums leading-tight mt-0.5">
                      ¥{(data.sales / 1000).toFixed(0)}k
                    </div>
                    {/* 追補03 R23: FL率表示 (色分け: ≤60% 緑 / ≤70% 黄 / >70% 赤) */}
                    <div className={`text-[8px] tabular-nums leading-tight ${flColor(data.fl)}`}>
                      FL {data.fl.toFixed(0)}%
                    </div>
                    <div className="text-[8px] text-gray-500 tabular-nums leading-tight">
                      利益¥{((data.sales - data.food - data.labor - data.expense) / 1000).toFixed(0)}k
                    </div>
                  </>
                )}
                {data && data.expense > 0 && data.sales === 0 && (
                  <div className="text-[9px] text-red-400/80 tabular-nums leading-tight">
                    -¥{(data.expense / 1000).toFixed(0)}k
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 日の内訳: キャスト別の集計と、組ごとの伝票内訳 (両方) を出す。
          PDF/Word の「特定日の伝票の件数、一件一件の内訳」要件はこちらでカバー。 */}
      {selectedDay && dayDetail && (
        <>
          {dayDetail.records.length > 0 && (
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-base font-bold text-gold">
                  {selectedDay.replace(/-/g, '/')} の担当キャスト別 集計
                </h3>
                <button onClick={() => setSelectedDay(null)} className="text-gray-500 hover:text-white text-sm">閉じる</button>
              </div>
              <div className="space-y-3">
                {Array.from(dayDetail.grouped.entries()).map(([castName, records]) => {
                  const total = records.reduce((s, r) => s + r.total, 0)
                  return (
                    <div key={castName} className="bg-white/5 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-sm">{castName}</span>
                        <span className="text-gold font-bold tabular-nums">¥{total.toLocaleString()}</span>
                      </div>
                      <div className="space-y-1">
                        {records.map((r) => (
                          <div key={r.id} className="flex justify-between text-xs text-gray-400">
                            <span>{r.tableNumber}卓 ({new Date(r.completedAt).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'})}) {r.paymentMethod === 'cash' ? '現金' : r.paymentMethod === 'card' ? 'カード' : '現金+カード'}</span>
                            <span className="tabular-nums">¥{r.total.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {/* 組ごとの伝票内訳 (1Set目 / EX(n) / カテゴリ別 / キャスト別売上帰属) */}
          <DailyVisitDetailPanel
            title={`${selectedDay.replace(/-/g, '/')} の組別 伝票内訳`}
            emptyText="この日の会計記録はありません"
            records={dayDetail.records}
            menuCategories={menuCategories}
            setPrices={setPrices}
          />
        </>
      )}
    </div>
  )
}
