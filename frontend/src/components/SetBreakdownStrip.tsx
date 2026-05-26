import type { Table, SetPrice } from '../data/mock'
import { getSetPriceForTime, SET_DURATION_MINUTES } from '../data/mock'
import { getExLabel, addMinutesToHHmm, formatTimeRange } from '../utils/setCountLabel'

/**
 * 「1セット目 / EX1 / EX2 / ...」を横並びカードで表示するストリップ。
 *
 * 要件 (PDF/Word QA 第3弾):
 *   - 利用明細画面と会計画面で、セットごと (1Set目 + 確定済 EX) の金額を
 *     それぞれ見せる
 *   - EX2 が無い卓もあれば EX3 以降がある卓もあるため動的レイアウト
 *   - EX3 以降は横スクロールで OK
 *
 * 現セットの金額は table の現値 (startTime + setPrices + setDiscountPerSet +
 * guestCount + extensionHistory) から導出する。会計確定後の履歴 (BillingRecord)
 * は VisitBreakdown 経由の別ビューを使うのでここでは扱わない。
 */
export default function SetBreakdownStrip({
  table,
  setPrices,
}: {
  table: Table
  setPrices: SetPrice[]
}) {
  if (!table.startTime) return null

  const guestCount = table.guestCount || 0
  const baseSetUnit = getSetPriceForTime(table.startTime, setPrices)
  const discount = table.setDiscountPerSet ?? 0
  const adjustedSetUnit = Math.max(0, baseSetUnit - discount)
  const firstSetFee = adjustedSetUnit * guestCount
  const firstEnd = addMinutesToHHmm(table.startTime, SET_DURATION_MINUTES)

  const cards: {
    label: string
    rangeLabel: string
    minutes: number
    amount: number
    note?: string
  }[] = []
  cards.push({
    label: '1Set目',
    rangeLabel: formatTimeRange(table.startTime, firstEnd),
    minutes: SET_DURATION_MINUTES,
    amount: firstSetFee,
    note: `¥${adjustedSetUnit.toLocaleString()} × ${guestCount}名`,
  })

  let cursor = firstEnd
  const extensions = table.extensionHistory ?? []
  extensions.forEach((ext, idx) => {
    const start = cursor
    const end = addMinutesToHHmm(start, ext.minutes)
    const fullSetCharge = adjustedSetUnit * guestCount
    const amount = ext.minutes === 60 ? fullSetCharge : Math.round(fullSetCharge / 2)
    cards.push({
      label: getExLabel(idx + 1, ext.minutes),
      rangeLabel: formatTimeRange(start, end),
      minutes: ext.minutes,
      amount,
      note:
        ext.nominatedCastNames && ext.nominatedCastNames.length > 0
          ? `指名: ${ext.nominatedCastNames.join(', ')}`
          : 'フリー',
    })
    cursor = end
  })

  const total = cards.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-gray-400 tracking-wider">セット料金内訳</h3>
        <span className="text-xs text-gray-500 tabular-nums">
          セット料金合計 ¥{total.toLocaleString()}
        </span>
      </div>
      {/* PR-A スコープではセット料金 (= setPrice × 人数 もしくは EX 料金) のみを
          セット別に示す。指名料・注文・税は visit 全体合計に加算される (会計画面の
          総合計と一致させるのは PR-B の visitBreakdown 拡張で扱う)。 */}
      <p className="text-[10px] text-gray-500">
        ※ セット料金のみ。指名料・注文・税は会計合計に別途加算されます。
      </p>
      {/* EX3 以降の存在を想定し横スクロール。1Set目 + EX1 + EX2 までは画面幅で
          並べ、それ以上は overflow-x-auto でスクロール (画面幅は崩さない)。 */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {cards.map((c, i) => (
          <div
            key={`${c.label}-${i}`}
            className="min-w-[150px] flex-1 panel p-3 rounded-lg border border-white/10 shrink-0"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-gold">{c.label}</span>
              <span className="text-[10px] text-gray-500 tabular-nums">{c.minutes}分</span>
            </div>
            <div className="text-[10px] text-gray-500 tabular-nums mt-0.5">{c.rangeLabel}</div>
            <div className="text-base font-bold tabular-nums mt-1">
              ¥{c.amount.toLocaleString()}
            </div>
            {c.note && (
              <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={c.note}>
                {c.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
