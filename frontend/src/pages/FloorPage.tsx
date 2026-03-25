import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import {
  type Table,
  type TableStatus,
  getSetPriceForTime,
  getSetPriceLabel,
  nominationLabels,
  EXTENSION_OPTIONS,
  SET_DURATION_MINUTES,
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

function calcRemainingMinutes(startTime: string, setCount: number): number {
  const [h, m] = startTime.split(':').map(Number)
  const now = new Date()
  const startDate = new Date()
  startDate.setHours(h, m, 0, 0)
  if (startDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    startDate.setDate(startDate.getDate() - 1)
  }
  const totalSetMinutes = setCount * SET_DURATION_MINUTES
  const endTime = new Date(startDate.getTime() + totalSetMinutes * 60 * 1000)
  return Math.ceil((endTime.getTime() - now.getTime()) / (60 * 1000))
}

function calcElapsedMinutes(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number)
  const now = new Date()
  const startDate = new Date()
  startDate.setHours(h, m, 0, 0)
  if (startDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    startDate.setDate(startDate.getDate() - 1)
  }
  return Math.floor((now.getTime() - startDate.getTime()) / (60 * 1000))
}

export default function FloorPage() {
  const { tables, casts, updateTable, bottleKeeps } = useStore()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Table | null>(null)

  const [showCheckIn, setShowCheckIn] = useState(false)
  const [ciTime, setCiTime] = useState(defaultStartTime)
  const [ciGuests, setCiGuests] = useState(1)
  const [ciCastNames, setCiCastNames] = useState<string[]>([])
  const [ciNomination, setCiNomination] = useState<Table['nomination']>('free')

  const [showExtend, setShowExtend] = useState(false)
  const [showRotation, setShowRotation] = useState(false)
  const [, setTick] = useState(0)

  const activeCasts = casts.filter((c) => c.active)

  const checkStatuses = useCallback(() => {
    for (const table of tables) {
      if (table.status === 'empty' || !table.startTime) continue
      const remaining = calcRemainingMinutes(table.startTime, table.setCount)
      const elapsed = calcElapsedMinutes(table.startTime)

      if (remaining <= 5 && table.status !== 'ending') {
        updateTable(table.id, { status: 'ending' })
      } else if (elapsed >= 50 && remaining > 5 && table.status !== 'alert') {
        updateTable(table.id, { status: 'alert' })
      }
    }
  }, [tables, updateTable])

  useEffect(() => {
    checkStatuses()
    const id = setInterval(() => {
      setTick((t) => t + 1)
      checkStatuses()
    }, 60_000)
    return () => clearInterval(id)
  }, [checkStatuses])

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

  const handlePrintCheckTicket = (table: Table) => {
    const setPrice = table.startTime ? getSetPriceForTime(table.startTime) : 0
    const drinkTotal = table.orders.reduce((sum, o) => sum + o.menuItem.price * o.quantity, 0)

    const printContent = `
      <html><head><title>チェック票</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #000; max-width: 300px; margin: 0 auto; }
        .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
        .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
        .total { font-size: 16px; font-weight: bold; }
      </style></head><body>
        <div class="header">CLUB GALAXY チェック票</div>
        <div class="divider"></div>
        <div class="row"><span>卓:</span><span>${table.number}</span></div>
        <div class="row"><span>担当:</span><span>${table.castNames.join(', ')}</span></div>
        <div class="row"><span>入店:</span><span>${table.startTime}</span></div>
        <div class="row"><span>人数:</span><span>${table.guestCount}名</span></div>
        <div class="divider"></div>
        <div class="row"><span>セット料金:</span><span>&yen;${(setPrice * table.guestCount * table.setCount).toLocaleString()}</span></div>
        ${table.orders.map(o => `<div class="row"><span>${o.menuItem.name} x${o.quantity}</span><span>${o.menuItem.price === 0 ? 'セット内' : '&yen;' + (o.menuItem.price * o.quantity).toLocaleString()}</span></div>`).join('')}
        <div class="divider"></div>
        <div class="row total"><span>ドリンク小計:</span><span>&yen;${drinkTotal.toLocaleString()}</span></div>
        <div style="text-align:center;font-size:11px;color:#999;margin-top:12px;">※中間確認用 - 正式な領収書ではありません</div>
      </body></html>
    `
    const w = window.open('', '_blank', 'width=350,height=500')
    if (w) {
      w.document.write(printContent)
      w.document.close()
      w.print()
    }
  }

  // Cast rotation: find casts not currently assigned to occupied tables
  const busyCastNames = new Set(tables.filter((t) => t.status !== 'empty').flatMap((t) => t.castNames))
  const freeCasts = activeCasts.filter((c) => !busyCastNames.has(c.name))

  const handleAssignCast = (castName: string) => {
    if (!selected) return
    updateTable(selected.id, {
      castNames: [...selected.castNames, castName],
    })
    setShowRotation(false)
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
        {tables.map((table) => {
          const remaining = table.startTime ? calcRemainingMinutes(table.startTime, table.setCount) : null
          const elapsed = table.startTime ? calcElapsedMinutes(table.startTime) : 0
          return (
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
                  {remaining !== null && (
                    <div className={`text-xs font-bold ${remaining <= 5 ? 'text-red-200 animate-pulse' : remaining <= 10 ? 'text-yellow-200' : 'text-white/90'}`}>
                      残り {remaining > 0 ? `${remaining}分` : '終了'}
                    </div>
                  )}
                  {elapsed >= 50 && (
                    <div className="text-[10px] text-yellow-200 font-bold">50分経過</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 使用中卓 詳細モーダル */}
      {selected && !showCheckIn && !showExtend && !showRotation && selected.status !== 'empty' && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-[#16213e] rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">卓 {selected.number}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>

            {selected.startTime && (() => {
              const rem = calcRemainingMinutes(selected.startTime, selected.setCount)
              return (
                <div className={`text-center py-3 rounded-lg mb-4 font-bold text-lg ${rem <= 5 ? 'bg-red-600/30 text-red-300' : rem <= 10 ? 'bg-yellow-600/30 text-yellow-300' : 'bg-blue-600/30 text-blue-300'}`}>
                  残り {rem > 0 ? `${rem}分` : '終了'}
                </div>
              )
            })()}

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

            {/* ボトルキープ表示 */}
            {(() => {
              const keeps = bottleKeeps.filter((b) => b.tableNumber === selected.number)
              if (keeps.length === 0) return null
              return (
                <div className="mt-4 bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
                  <div className="text-xs text-amber-300 font-bold mb-2">キープボトル</div>
                  {keeps.map((k) => (
                    <div key={k.id} className="flex justify-between text-sm mb-1">
                      <span>{k.bottleName} ({k.customerName})</span>
                      <span className={k.remaining <= 20 ? 'text-red-400 font-bold' : ''}>{k.remaining}%</span>
                    </div>
                  ))}
                </div>
              )
            })()}

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
              {EXTENSION_OPTIONS.map((min) => (
                <button key={min} onClick={() => confirmExtend(min)} className="flex-1 bg-blue-600 py-3 rounded-lg font-bold">+{min}分延長</button>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={() => { setSelected(null); navigate(`/order?table=${selected.id}`) }} className="flex-1 bg-purple-600 py-3 rounded-lg font-bold">注文</button>
              <button onClick={() => { setSelected(null); navigate(`/billing?table=${selected.id}`) }} className="flex-1 bg-[#d4af37] text-black py-3 rounded-lg font-bold">会計</button>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handlePrintCheckTicket(selected)}
                className={`flex-1 py-3 rounded-lg font-bold text-sm ${
                  selected.startTime && calcElapsedMinutes(selected.startTime) >= 50
                    ? 'bg-red-600 text-white'
                    : 'bg-white/10 text-gray-300'
                }`}
              >
                チェック票印刷
              </button>
              <button onClick={() => setShowRotation(true)} className="flex-1 bg-orange-600 py-3 rounded-lg font-bold text-sm">付け回し</button>
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

      {/* 付け回しモーダル */}
      {showRotation && selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowRotation(false); setSelected(null) }}>
          <div className="bg-[#16213e] rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">付け回し - 卓 {selected.number}</h2>
            <p className="text-sm text-gray-400 mb-4">空いているキャストを選択してください</p>
            {freeCasts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">現在空いているキャストはいません</p>
            ) : (
              <div className="space-y-2">
                {freeCasts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAssignCast(c.name)}
                    className="w-full bg-white/5 border border-gray-600 rounded-lg p-3 text-left hover:bg-white/10 transition-colors"
                  >
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-gray-400">→ 卓{selected.number} に付け回し</div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { setShowRotation(false); setSelected(null) }} className="w-full mt-4 bg-white/10 py-3 rounded-lg font-bold text-gray-400">キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}
