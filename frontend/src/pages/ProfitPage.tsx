import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { sampleDailyWork, type BackType } from '../data/mock'

type Granularity = 'day' | 'month' | 'year'
type ViewMode = 'today' | 'trend' | 'cast'

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

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-[#d4af37]" style={{ fontFamily: 'var(--font-display)' }}>利益管理</h2>

      <div className="flex border-b border-white/10">
        {(['today', 'trend', 'cast'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`flex-1 px-4 py-2.5 text-sm font-bold tracking-wide transition-colors relative ${
              viewMode === m ? 'text-white' : 'text-gray-500'
            }`}
          >
            {m === 'today' ? '本日' : m === 'trend' ? '店舗推移' : 'キャスト推移'}
            {viewMode === m && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {viewMode === 'today' && <TodayView />}
      {viewMode === 'trend' && <StoreTrendView />}
      {viewMode === 'cast' && <CastTrendView />}
    </div>
  )
}

// ─── 本日ビュー ───

function TodayView() {
  const { flMetrics } = useStore()
  return (
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
  )
}

// ─── 店舗推移ビュー (日/月/年別) ───

function StoreTrendView() {
  const { billingRecords, expenses, storeSettings } = useStore()
  const [granularity, setGranularity] = useState<Granularity>('month')

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

    const map = new Map<string, { sales: number; cardSales: number; expense: number }>()
    labels.forEach((l) => map.set(l, { sales: 0, cardSales: 0, expense: 0 }))

    for (const r of billingRecords) {
      const d = r.date ?? today.toISOString().slice(0, 10)
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
  }, [billingRecords, expenses, granularity, storeSettings.cardProcessingFeeRate])

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
            {g === 'day' ? '過去30日' : g === 'month' ? '過去12ヶ月' : '過去5年'}
          </button>
        ))}
      </div>

      {/* 集計サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">売上合計</div>
          <div className="text-base font-bold text-[#d4af37] tabular-nums">¥{totals.sales.toLocaleString()}</div>
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

      {/* 棒グラフ */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">売上推移</h3>
        <div className="flex items-end gap-1 h-48 overflow-x-auto">
          {buckets.map((b) => {
            const h = b.sales > 0 ? (b.sales / maxSales) * 100 : 0
            return (
              <div key={b.label} className="flex-1 min-w-[24px] flex flex-col items-center justify-end h-full">
                <span className="text-[10px] text-gray-500 tabular-nums mb-1">
                  {b.sales > 0 ? `¥${(b.sales / 1000).toFixed(0)}k` : ''}
                </span>
                <div
                  className="w-full rounded-t bg-[#d4af37]/80"
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
  const { casts } = useStore()
  const activeCasts = casts.filter((c) => c.active)
  const [castId, setCastId] = useState(activeCasts[0]?.id ?? 0)
  const [granularity, setGranularity] = useState<Granularity>('month')

  const cast = casts.find((c) => c.id === castId)

  const buckets = useMemo(() => {
    if (!cast) return []
    const work = sampleDailyWork[cast.id] ?? []
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
        (sum, bt) => sum + (w.backs[bt] ?? 0) * (cast.backRates?.[bt] ?? 0),
        0,
      )
      b.back += backAmount
      const hourly = Math.floor(cast.hourlyRate * w.hours)
      // A(時給+バック) vs B(売上×保証率) → 日単位ではなく期間単位で取るべきだが、ここは合計で最後に計算
      b.gross += hourly + backAmount
    }

    return labels.map((l) => {
      const b = map.get(l)!
      // 最終的な給与(期間内のMAX(A, B))
      const guaranteed = Math.floor(b.sales * cast.guaranteeRate)
      const salary = Math.max(b.gross, guaranteed)
      return { label: l, sales: b.sales, hours: b.hours, back: b.back, salary }
    })
  }, [cast, granularity])

  const totals = useMemo(() => {
    return buckets.reduce(
      (acc, b) => ({
        sales: acc.sales + b.sales,
        hours: acc.hours + b.hours,
        salary: acc.salary + b.salary,
      }),
      { sales: 0, hours: 0, salary: 0 },
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
            {g === 'day' ? '過去30日' : g === 'month' ? '過去12ヶ月' : '過去5年'}
          </button>
        ))}
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">売上合計</div>
          <div className="text-base font-bold text-[#d4af37] tabular-nums">¥{totals.sales.toLocaleString()}</div>
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
                  className="w-full rounded-t bg-purple-400/80"
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
        <p className="text-[10px] text-gray-600 mt-2">※給与 = MAX(時給×時間+バック, 売上×保証率{Math.round(cast.guaranteeRate * 100)}%)</p>
      </div>
    </div>
  )
}
