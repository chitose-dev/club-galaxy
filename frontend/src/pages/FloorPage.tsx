import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  nominationLabels,
  EXTENSION_OPTIONS,
} from '../data/mock'

const statusColor: Record<TableStatus, string> = {
  empty: 'bg-emerald-600',
  occupied: 'bg-blue-600',
  ending: 'bg-red-600',
  alert: 'bg-yellow-600',
}

const statusLabel: Record<TableStatus, string> = {
  empty: '空き',
  occupied: '使用中',
  ending: '終了間近',
  alert: '50分経過',
}

const defaultStartTime = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export default function FloorPage() {
  const { tables, casts, updateTable } = useStore()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Table | null>(null)

  const [showCheckIn, setShowCheckIn] = useState(false)
  const [ciTime, setCiTime] = useState(defaultStartTime)
  const [ciGuests, setCiGuests] = useState(1)
  const [ciCastNames, setCiCastNames] = useState<string[]>([])
  const [ciNomination, setCiNomination] = useState<Table['nomination']>('free')

  const [showExtend, setShowExtend] = useState(false)

  const activeCasts = casts.filter((c) => c.active)

  const openCheckIn = (table: Table) => {
    setSelected(table)
    setCiTime(defaultStartTime())
    setCiGuests(1)
    setCiCastNames([])
    setCiNomination('free')
    setShowCheckIn(true)
  }

  const toggleCast = (name: string) => {
    setCiCastNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const confirmCheckIn = () => {
    if (!selected) return
    updateTable(selected.id, {
      status: 'occupied',
      guestCount: ciGuests,
      startTime: ciTime,
      castNames: ciCastNames.length > 0 ? ciCastNames : [activeCasts[0]?.name ?? ''],
      nomination: ciNomination,
      setCount: 1,
    })
    setShowCheckIn(false)
    setSelected(null)
  }

  const confirmExtend = (minutes: number) => {
    if (!selected) return
    updateTable(selected.id, {
      setCount: selected.setCount + (minutes === 60 ? 1 : 0.5),
      status: 'occupied',
    })
    setShowExtend(false)
    setSelected(null)
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-4 mb-4 text-xs flex-wrap">
        {(Object.entries(statusColor) as [TableStatus, string][]).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full ${color} inline-block`} />
            {statusLabel[key]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => {
              if (table.status === 'empty') {
                openCheckIn(table)
              } else {
                setSelected(table)
              }
            }}
            className={`${statusColor[table.status]} rounded-xl p-4 text-left transition-transform active:scale-95`}
          >
            <div className="flex justify-between items-start">
              <span className="text-2xl font-bold">{table.number}</span>
              <span className="text-[10px] bg-black/20 rounded px-1.5 py-0.5">
                {statusLabel[table.status]}
              </span>
            </div>
            {table.status !== 'empty' && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="font-medium">{table.castNames.join(', ')}</div>
                <div className="text-white/70 text-xs">
                  {table.guestCount}名 / {table.startTime}〜
                </div>
                {table.nomination && (
                  <div className="text-white/70 text-xs">{nominationLabels[table.nomination]}</div>
                )}
                {table.startTime && (
                  <div className="text-white/70 text-xs">
                    ¥{getSetPriceForTime(table.startTime).toLocaleString()}/set
                  </div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* 使用中卓 詳細モーダル */}
      {selected && !showCheckIn && !showExtend && selected.status !== 'empty' && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-[#16213e] rounded-t-2xl w-full max-w-lg p-6 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">卓 {selected.number}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">担当</div>
                <div className="font-bold">{selected.castNames.join(', ')}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">指名タイプ</div>
                <div className="font-bold">{selected.nomination ? nominationLabels[selected.nomination] : '-'}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">入店時刻</div>
                <div className="font-bold">{selected.startTime}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">人数</div>
                <div className="font-bold">{selected.guestCount}名</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">セット料金</div>
                <div className="font-bold">
                  {selected.startTime ? `¥${getSetPriceForTime(selected.startTime).toLocaleString()}` : '-'}
                </div>
                <div className="text-gray-500 text-xs">{selected.startTime ? getSetPriceLabel(selected.startTime) : ''}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">セット数</div>
                <div className="font-bold">{selected.setCount}</div>
              </div>
            </div>
            {selected.orders.length > 0 && (
              <div className="mt-4 bg-white/5 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-2">注文 ({selected.orders.length}品)</div>
                {selected.orders.slice(0, 5).map((o) => (
                  <div key={o.menuItem.id} className="flex justify-between text-sm">
                    <span>{o.menuItem.name} x{o.quantity}</span>
                    <span>¥{(o.menuItem.price * o.quantity).toLocaleString()}</span>
                  </div>
                ))}
                {selected.orders.length > 5 && (
                  <div className="text-xs text-gray-500 mt-1">...他{selected.orders.length - 5}品</div>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowExtend(true)} className="flex-1 bg-blue-600 py-3 rounded-lg font-bold">延長</button>
              <button onClick={() => { setSelected(null); navigate(`/order?table=${selected.id}`) }} className="flex-1 bg-purple-600 py-3 rounded-lg font-bold">注文</button>
              <button onClick={() => { setSelected(null); navigate(`/billing?table=${selected.id}`) }} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold">会計</button>
            </div>
          </div>
        </div>
      )}

      {/* 入店モーダル */}
      {showCheckIn && selected && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={() => { setShowCheckIn(false); setSelected(null) }}>
          <div className="bg-[#16213e] rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">卓 {selected.number} 入店</h2>
              <button onClick={() => { setShowCheckIn(false); setSelected(null) }} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4">
              {/* セット開始時刻 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">セット開始時刻</label>
                <div className="flex gap-2">
                  <input type="time" value={ciTime} onChange={(e) => setCiTime(e.target.value)} className="flex-1 bg-white/10 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={() => setCiTime(defaultStartTime())} className="bg-[#e94560] px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap">今すぐ</button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  セット料金: ¥{getSetPriceForTime(ciTime).toLocaleString()} ({getSetPriceLabel(ciTime)})
                </div>
              </div>
              {/* 来店人数 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">来店人数</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button key={n} onClick={() => setCiGuests(n)} className={`flex-1 py-2 rounded-lg text-sm font-bold ${ciGuests === n ? 'bg-[#d4af37] text-black' : 'bg-white/10 text-gray-300'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {/* キャスト選択（複数可） */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">キャスト（複数選択可）</label>
                <div className="flex flex-wrap gap-2">
                  {activeCasts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleCast(c.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold ${
                        ciCastNames.includes(c.name)
                          ? 'bg-[#d4af37] text-black'
                          : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {ciCastNames.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">選択中: {ciCastNames.join(', ')}</div>
                )}
              </div>
              {/* 指名タイプ */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">指名タイプ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['free', 'shimei', 'banai', 'douhan'] as const).map((type) => (
                    <button key={type} onClick={() => setCiNomination(type)} className={`py-2 rounded-lg text-sm font-bold ${ciNomination === type ? 'bg-[#d4af37] text-black' : 'bg-white/10 text-gray-300'}`}>
                      {nominationLabels[type]}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={confirmCheckIn} className="w-full bg-[#e94560] py-3 rounded-lg font-bold text-lg mt-2">入店開始</button>
            </div>
          </div>
        </div>
      )}

      {/* 延長モーダル */}
      {showExtend && selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowExtend(false); setSelected(null) }}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">卓 {selected.number} 延長</h2>
            <p className="text-sm text-gray-400 mb-4">現在: {selected.setCount}セット</p>
            <div className="space-y-3">
              {EXTENSION_OPTIONS.map((min) => (
                <button key={min} onClick={() => confirmExtend(min)} className="w-full bg-blue-600 py-3 rounded-lg font-bold">+{min}分延長</button>
              ))}
            </div>
            <button onClick={() => { setShowExtend(false); setSelected(null) }} className="w-full mt-3 bg-white/10 py-3 rounded-lg font-bold text-gray-400">キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}
