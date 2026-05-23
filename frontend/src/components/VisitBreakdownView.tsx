import type { VisitBreakdown } from '../utils/visitBreakdown'

/**
 * 1組（1 BillingRecord）の伝票内訳を表示するビュー。
 *
 * PDF/Word 要件:
 *   - 1組の中に複数伝票（1Set目 / EX(1) / EX(2)半 ...）の内訳を紐づけて閲覧
 *   - 「特定の1件(複数枚)を提示」できる
 *   - ドリンク/ウイスキー/シャンパン等の商品カテゴリ別の内訳
 *   - キャスト別の売上帰属
 *
 * BillingHistoryView / ProfitPage の両方から呼ぶ想定の純表示コンポーネント。
 * 状態は持たず、breakdown 1 件を受け取って描画するだけ。
 */
export default function VisitBreakdownView({ b }: { b: VisitBreakdown }) {
  const yen = (n: number) => `¥${n.toLocaleString()}`
  return (
    <div className="space-y-3">
      {/* セッション全体のメタ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Meta label="卓" value={`${b.tableNumber}卓`} />
        <Meta
          label="時間帯"
          value={
            b.startTime && b.sessionEndHHMM
              ? `${b.startTime} 〜 ${b.sessionEndHHMM}`
              : (b.startTime ?? '-')
          }
        />
        <Meta label="人数" value={b.guestCount != null ? `${b.guestCount}名` : '-'} />
        <Meta
          label="担当"
          value={
            b.assignedCastNames.length > 0
              ? b.assignedCastNames.join(', ')
              : 'フリー'
          }
        />
      </div>

      {/* 伝票区分 (1Set目 / EX) — 区分ごとに金額の概算を併記する。
          ※ 指名・チャージは 1Set目 に集約。商品（メニュー注文）は組全体合計
          のみ（注文単位の ticket 紐付けが残っていないため）。 */}
      <section>
        <h4 className="text-xs text-gray-400 tracking-wider mb-1">
          伝票区分（金額は概算 / 商品分は組全体合計に含む）
        </h4>
        <div className="bg-white/[0.03] rounded border border-white/5">
          {b.tickets.map((t, i) => (
            <div
              key={`${t.kind}-${i}`}
              className="px-3 py-2 border-b border-white/5 last:border-b-0 text-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-bold w-16 inline-block shrink-0">{t.label}</span>
                  <span className="text-gray-400 tabular-nums">
                    {t.rangeLabel || '-'}
                  </span>
                  <span className="text-[10px] text-gray-500 tabular-nums">
                    {t.minutes}分
                  </span>
                </div>
                <span className="text-gold font-bold tabular-nums">
                  {yen(t.totalEstimate)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400 pl-16">
                <span className="tabular-nums">セット料金 {yen(t.setFeeAllocated)}</span>
                {t.chargeAllocated > 0 && (
                  <span className="tabular-nums">指名・チャージ {yen(t.chargeAllocated)}</span>
                )}
                {t.taxEstimate > 0 && (
                  <span className="tabular-nums">TAX {yen(t.taxEstimate)}</span>
                )}
                {t.consumptionTaxEstimate > 0 && (
                  <span className="tabular-nums">消費税 {yen(t.consumptionTaxEstimate)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 指名・チャージ */}
      {b.chargeLines.length > 0 && (
        <section>
          <h4 className="text-xs text-gray-400 tracking-wider mb-1">指名・チャージ</h4>
          <div className="bg-white/[0.03] rounded border border-white/5">
            {b.chargeLines.map((l, i) => (
              <div
                key={`charge-${i}`}
                className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 last:border-b-0 text-sm"
              >
                <span>
                  {l.name}
                  {l.castName && (
                    <span className="ml-2 text-xs text-gold/80">({l.castName})</span>
                  )}
                  {l.quantity > 1 && (
                    <span className="ml-2 text-xs text-gray-500">× {l.quantity}</span>
                  )}
                </span>
                <span className="tabular-nums">{yen(l.subtotal)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 商品カテゴリ別 */}
      {b.menuLines.length > 0 && (
        <section>
          <h4 className="text-xs text-gray-400 tracking-wider mb-1">
            注文 / 商品明細（カテゴリ別）
          </h4>
          <div className="space-y-2">
            {b.categoryTotals.map((cat) => (
              <div key={cat.subcategory} className="bg-white/[0.03] rounded border border-white/5">
                <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/5">
                  <span className="text-xs font-bold text-gold/90">
                    {cat.categoryLabel}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {cat.quantity}件 / {yen(cat.subtotal)}
                  </span>
                </div>
                {b.menuLines
                  .filter((l) => l.subcategory === cat.subcategory)
                  .map((l, i) => (
                    <div
                      key={`${cat.subcategory}-${i}`}
                      className="flex items-center justify-between px-3 py-1 border-b border-white/5 last:border-b-0 text-xs text-gray-300"
                    >
                      <span>
                        {l.name}
                        {l.castName && (
                          <span className="ml-2 text-gold/70">({l.castName})</span>
                        )}
                        {l.quantity > 1 && (
                          <span className="ml-2 text-gray-500">× {l.quantity}</span>
                        )}
                      </span>
                      <span className="tabular-nums">{yen(l.subtotal)}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* キャスト別売上帰属 */}
      {Object.keys(b.salesAttributionByCast).length > 0 && (
        <section>
          <h4 className="text-xs text-gray-400 tracking-wider mb-1">
            キャスト別 売上帰属（本指名按分）
          </h4>
          <div className="bg-white/[0.03] rounded border border-white/5">
            {Object.entries(b.salesAttributionByCast).map(([name, amount], i) => (
              <div
                key={`attr-${i}`}
                className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 last:border-b-0 text-sm"
              >
                <span>{name}</span>
                <span className="tabular-nums text-gold">{yen(amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 合計類 */}
      <section className="border-t border-white/10 pt-2 text-sm space-y-1">
        <Row label="セット料金" value={yen(b.totals.setFee)} />
        {b.totals.chargeSubtotal > 0 && (
          <Row label="指名・チャージ" value={yen(b.totals.chargeSubtotal)} />
        )}
        {b.totals.menuSubtotal > 0 && (
          <Row label="商品計" value={yen(b.totals.menuSubtotal)} />
        )}
        <Row label="小計 (税抜)" value={yen(b.totals.subtotal)} />
        {b.totals.tax > 0 && <Row label="TAX (サービス料)" value={yen(b.totals.tax)} />}
        {b.totals.consumptionTax > 0 && (
          <Row label="消費税 (内税)" value={yen(b.totals.consumptionTax)} />
        )}
        {b.totals.discount > 0 && (
          <Row
            label="値引"
            value={`-${yen(b.totals.discount)}`}
            valueClassName="text-amber-300"
          />
        )}
        <Row
          label="合計"
          value={yen(b.totals.total)}
          labelClassName="font-bold"
          valueClassName="font-bold text-gold tabular-nums text-base"
        />
      </section>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded px-2 py-1.5 border border-white/5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  )
}

function Row({
  label,
  value,
  labelClassName = 'text-gray-400',
  valueClassName = 'tabular-nums',
}: {
  label: string
  value: string
  labelClassName?: string
  valueClassName?: string
}) {
  return (
    <div className="flex justify-between">
      <span className={`text-sm ${labelClassName}`}>{label}</span>
      <span className={`text-sm ${valueClassName}`}>{value}</span>
    </div>
  )
}
