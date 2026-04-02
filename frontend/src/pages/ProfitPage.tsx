import { useStore } from '../store'

const dummyWeek = [
  { label: '3/27', sales: 145000, cost: 22000, labor: 58000 },
  { label: '3/28', sales: 162000, cost: 25000, labor: 64000 },
  { label: '3/29', sales: 0, cost: 0, labor: 0 },
  { label: '3/30', sales: 178000, cost: 28000, labor: 70000 },
  { label: '3/31', sales: 155000, cost: 24000, labor: 62000 },
  { label: '4/1', sales: 190000, cost: 30000, labor: 75000 },
  { label: '4/2', sales: 0, cost: 0, labor: 0 },
]

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
  const { flMetrics } = useStore()

  const weekProfits = dummyWeek.map((d) => d.sales - d.cost - d.labor)
  const maxProfit = Math.max(...weekProfits.map(Math.abs), 1)

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-[#d4af37]" style={{ fontFamily: 'var(--font-display)' }}>利益管理</h2>

      {/* Today card */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-400">本日</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-gray-500">売上</div>
            <div className="text-lg font-bold tabular-nums">¥{flMetrics.todaySales.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">利益</div>
            <div className={`text-lg font-bold tabular-nums ${flMetrics.todayProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ¥{flMetrics.todayProfit.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">原価 (F)</div>
            <div className="text-sm tabular-nums">¥{flMetrics.foodCost.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">人件費 (L)</div>
            <div className="text-sm tabular-nums">¥{flMetrics.laborCost.toLocaleString()}</div>
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

      {/* Weekly bar graph */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">直近7日間の利益</h3>
        <div className="flex items-end gap-2 h-40">
          {dummyWeek.map((d, i) => {
            const profit = weekProfits[i]
            const h = maxProfit > 0 ? Math.abs(profit) / maxProfit * 100 : 0
            const fl = d.sales > 0 ? (d.cost + d.labor) / d.sales * 100 : 0
            return (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                {d.sales > 0 && (
                  <span className="text-[9px] text-gray-500 tabular-nums mb-1">
                    ¥{(profit / 1000).toFixed(0)}k
                  </span>
                )}
                <div
                  className={`w-full rounded-t ${profit >= 0 ? flBg(fl) : 'bg-red-500'} min-h-[2px]`}
                  style={{ height: d.sales > 0 ? `${Math.max(h, 5)}%` : '2px', opacity: d.sales > 0 ? 0.8 : 0.2 }}
                />
                <span className="text-[10px] text-gray-500 mt-1.5">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly card */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-2">今月累計</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-gray-500">累計利益</div>
            <div className={`text-lg font-bold tabular-nums ${flMetrics.monthlyProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ¥{flMetrics.monthlyProfit.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">FL率</div>
            <div className={`text-lg font-bold tabular-nums ${flColor(flMetrics.monthlyFlRate)}`}>
              {flMetrics.monthlyFlRate.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
