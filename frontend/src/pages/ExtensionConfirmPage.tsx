import { useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DarkButton, GhostButton, GoldButton } from '../components/Buttons'
import { Printer, Clock as ClockIcon } from 'lucide-react'
import {
  getSetPriceForTime,
  getSetPriceLabel,
  type Cast,
  type ExtensionEntry,
} from '../data/mock'
import type { ExtensionInheritanceConfig } from '../components/ExtensionInheritanceModal'
import {
  buildSetTimeRanges,
  addMinutesToHHmm,
  formatTimeRange,
} from '../utils/setCountLabel'
import { calcVisitBreakdown, buildVisitBreakdownInput } from '../utils/calcVisitBreakdown'
import { resolveBanaiCastNames } from '../utils/nomination'

/**
 * spec.md §5.3: 延長交渉画面（点票レイアウト）。
 *
 * UsageDetailPage の [延長] → ExtensionInheritanceModal で「次へ」を押すと
 * このページに遷移する。location.state に ExtensionInheritanceConfig を載せる。
 *
 * 表示は「現在までの金額（既存セット合計）」と「今回延長で追加される金額（今回EX分）」を
 * 明確に2ブロックへ分離する。現在までの金額は会計と同じ calcVisitBreakdown 由来、
 * 今回追加分は交渉中の延長単価（config.extensionPrice。店舗設定単価と異なり得る）で算出する。
 *
 * [確定して延長] でテーブルへ ExtensionEntry を追加し、
 * mainNominationCastNames / assignedCasts を継承選択どおりに更新して /table/:id に戻る。
 */

interface LocationState {
  config?: ExtensionInheritanceConfig
}

export default function ExtensionConfirmPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const config = state.config
  const { tables, casts, storeSettings, updateTable, moveCast, setPrices, chargeItems } = useStore()
  const table = useMemo(() => tables.find((t) => String(t.id) === params.id), [tables, params.id])

  if (!table || !config) {
    return (
      <div className="p-8 text-center text-gray-400">
        延長対象の卓または継承設定が見つかりません。
        <div className="mt-4">
          <GhostButton onClick={() => navigate(`/table/${params.id ?? ''}`)}>利用明細へ戻る</GhostButton>
        </div>
      </div>
    )
  }

  const guestCount = table.guestCount
  const taxRate = storeSettings.taxRate
  const taxPct = Math.round(taxRate * 100)

  // 延長後の本指名キャスト = 継承（kept）+ 新規追加（added）。
  const newShimei = [
    ...config.keptShimeiCastNames,
    ...config.addedShimeiCastNames.filter((n) => !config.keptShimeiCastNames.includes(n)),
  ]

  const honShimeiUnit = chargeItems.find((c) => c.id === 'shimei')?.price ?? 0
  const banaiUnit = chargeItems.find((c) => c.id === 'banai')?.price ?? 0

  // 現在までの金額（今回EXは含めない）。会計 / 利用明細と同じ正準計算。
  const rates = {
    baseSetUnit: table.startTime ? getSetPriceForTime(table.startTime, setPrices) : 0,
    extPrice30: storeSettings.extensionPrice30Min ?? 0,
    extPrice60: storeSettings.extensionPrice60Min ?? 0,
    honShimeiUnit,
    banaiUnit,
    douhanUnit: chargeItems.find((c) => c.id === 'douhan')?.price ?? 0,
    taxRate,
  }
  const currentBreakdown = calcVisitBreakdown(buildVisitBreakdownInput(table, rates))
  const currentSubtotal = currentBreakdown.subtotalBeforeTax
  const currentTax = currentBreakdown.tax
  const currentTotal = currentBreakdown.total

  // 各既存セット（1Set目 / 過去EX）の時刻レンジ。currentBreakdown.sets と 1:1。
  const timeRanges = buildSetTimeRanges(table)
  // 今回EXの時刻 = 直前セット終了から config.minutes 分。
  const exStart = timeRanges[timeRanges.length - 1]?.end ?? (table.startTime ?? '-')
  const exEnd = table.startTime ? addMinutesToHHmm(exStart, config.minutes) : '-'
  const exIndex = (table.extensionHistory ?? []).length + 1
  const exLabel = config.minutes === 30 ? `EX(${exIndex})半` : `EX(${exIndex})`

  // 今回延長で追加される金額。延長単価は交渉中の config.extensionPrice を採用
  // （店舗設定単価と異なり得るため、過去EXの概算とは別建て）。
  const exSetFee = config.extensionPrice * guestCount
  const exHonFee = newShimei.length * honShimeiUnit
  const exBanaiFee = config.keptBanaiCastNames.length * banaiUnit
  const addedSubtotal = exSetFee + exHonFee + exBanaiFee
  // 限界 TAX = 延長後小計の TAX − 現在の TAX（二重 floor のズレを避ける）。
  const afterSubtotal = currentSubtotal + addedSubtotal
  const afterTax = Math.floor(afterSubtotal * taxRate)
  const afterTotal = afterSubtotal + afterTax
  const addedTax = afterTax - currentTax
  const addedTotal = addedSubtotal + addedTax

  // 「ご延長予算（目安）」: 現在の税前小計 + 30/60 分追加料金に TAX を後付け。
  const ext30Unit = storeSettings.extensionPrice30Min ?? 0
  const ext60Unit = storeSettings.extensionPrice60Min ?? 0
  const budgetIf30 = Math.round((currentSubtotal + ext30Unit * guestCount) * (1 + taxRate))
  const budgetIf60 = Math.round((currentSubtotal + ext60Unit * guestCount) * (1 + taxRate))

  // 印刷時刻（現在時刻）。サーマル印刷の「現在時刻」欄に使う。
  const nowHHmm = (() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })()

  // サーマル「ただいまの料金」用の現在内訳（全セット合算）。
  const currentOrderLines = currentBreakdown.sets.flatMap((s) => s.orderLines)
  const currentHonFee = currentBreakdown.sets.reduce((acc, s) => acc + s.honShimeiFee, 0)
  const currentBanaiFee = currentBreakdown.sets.reduce((acc, s) => acc + s.banaiFee, 0)
  const currentDouhanFee = currentBreakdown.sets.reduce((acc, s) => acc + s.douhanFee, 0)

  // 売上帰属プレビュー（spec.md §5.5: 延長後の本指名で均等按分。フリーは帰属なし）。
  const attributionPreview = newShimei.length === 0 ? [] : (() => {
    const each = Math.floor(afterSubtotal / newShimei.length)
    return newShimei.map((n, i) => ({
      name: n,
      amount: i === newShimei.length - 1 ? afterSubtotal - each * (newShimei.length - 1) : each,
    }))
  })()

  const handleConfirm = () => {
    // 1. 場内指名から外したキャストを待機に戻す（assignedCasts から除外）
    const removedBanai = resolveBanaiCastNames(table)
      .filter((n) => !config.keptBanaiCastNames.includes(n))
    for (const name of removedBanai) {
      moveCast(name, null)
    }
    // 2. 新規追加した本指名キャストはこの卓へ移動
    for (const name of config.addedShimeiCastNames) {
      const c: Cast | undefined = casts.find((cc) => cc.name === name)
      if (c) moveCast(name, table.id)
    }
    // 3. 新規 ExtensionEntry を追加。このEXセットの指名状態（本指名=承継+追加、場内=承継分）を
    //    スナップショットとして焼き付ける（セット別内訳で EX ごとの指名を復元するため）。
    const now = new Date()
    const entry: ExtensionEntry = {
      id: now.getTime(),
      minutes: config.minutes,
      timestamp: now.toISOString(),
      nominatedCastName: newShimei[0],        // 後方互換（単一指名）
      nominatedCastNames: newShimei,          // 本指名スナップショット
      banaiCastNames: [...config.keptBanaiCastNames], // 場内指名スナップショット
    }
    const nextAssigned = Array.from(
      new Set([
        ...table.assignedCasts.filter((n) => !removedBanai.includes(n)),
        ...config.addedShimeiCastNames,
      ]),
    )
    updateTable(table.id, {
      extensionHistory: [...(table.extensionHistory ?? []), entry],
      mainNominationCastNames: newShimei,
      assignedCasts: nextAssigned,
      // 場内指名はキャスト単位で継承。延長で継続選択した子だけを場内指名にする。
      banaiCastNames: [...config.keptBanaiCastNames],
      isBanaiShimei: config.keptBanaiCastNames.length > 0,
    })
    navigate(`/table/${table.id}`)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="no-print">
        <ContextualHeader accent="floor" title={`${table.number}卓 延長確認 (${exLabel})`} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4 no-print">
          {/* 表頭：卓 / 今回延長の時間帯 */}
          <div className="panel p-4 flex justify-between items-baseline">
            <span className="text-base font-bold">{table.number}卓</span>
            <span className="text-sm tabular-nums tracking-wider text-gray-300 flex items-center gap-1">
              <ClockIcon size={14} /> 今回延長 {exStart} 〜 {exEnd}
            </span>
          </div>

          {/* ── 現在までの金額（既存セット合計、今回EXは含めない）── */}
          <section className="panel p-4">
            <h3 className="text-sm font-bold text-gray-200 mb-3">現在までの金額</h3>
            <div className="space-y-3 text-sm">
              {currentBreakdown.sets.map((set, i) => {
                const range = timeRanges[i]
                const isBase = set.kind === 'base'
                return (
                  <div key={`${set.kind}-${i}`} className={`border-l-2 pl-3 ${isBase ? 'border-gold/30' : 'border-white/20'}`}>
                    <div className={`text-xs tracking-wider mb-1 ${isBase ? 'text-gold' : 'text-gray-400'}`}>
                      {set.label}{range ? `（${formatTimeRange(range.start, range.end)}, ${set.minutes}分）` : `（${set.minutes}分）`}
                    </div>
                    <div className="flex justify-between">
                      <span>セット料金</span>
                      <span className="tabular-nums">¥{set.setFee.toLocaleString()}</span>
                    </div>
                    {set.honShimeiCount > 0 && (
                      <div className="flex justify-between">
                        <span>本指名料（{set.honShimeiCount}名）</span>
                        <span className="tabular-nums">¥{set.honShimeiFee.toLocaleString()}</span>
                      </div>
                    )}
                    {set.banaiCount > 0 && (
                      <div className="flex justify-between">
                        <span>場内指名料（{set.banaiCount}名）</span>
                        <span className="tabular-nums">¥{set.banaiFee.toLocaleString()}</span>
                      </div>
                    )}
                    {set.douhanCount > 0 && (
                      <div className="flex justify-between">
                        <span>同伴（{set.douhanCount}名）</span>
                        <span className="tabular-nums">¥{set.douhanFee.toLocaleString()}</span>
                      </div>
                    )}
                    {set.orderLines.map((o, j) => (
                      <div key={`order-${o.menuItemId ?? j}-${o.castName ?? ''}-${j}`} className="flex justify-between text-gray-300">
                        <span className="truncate">{o.name}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</span>
                        <span className="tabular-nums">¥{(o.price * o.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="border-t border-white/10 mt-3 pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>小計</span>
                <span className="tabular-nums">¥{currentSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>TAX ({taxPct}%)</span>
                <span className="tabular-nums">¥{currentTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-bold">現在までの合計（税込）</span>
                <span className="text-xl tabular-nums font-bold">¥{currentTotal.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* ── 今回延長で追加される金額（今回EX分のみ）── */}
          <section className="panel p-4 border border-accent/40">
            <h3 className="text-sm font-bold text-accent mb-1">今回延長で追加される金額</h3>
            <div className="text-xs text-gray-400 mb-3 tabular-nums">
              {exLabel}（{exStart} 〜 {exEnd}, {config.minutes}分） / {guestCount}名
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>セット料金（{exLabel}）</span>
                <span className="tabular-nums">¥{config.extensionPrice.toLocaleString()} × {guestCount}名 = ¥{exSetFee.toLocaleString()}</span>
              </div>
              {newShimei.map((name) => (
                <div key={`add-shimei-${name}`} className="flex justify-between">
                  <span>本指名 {name}</span>
                  <span className="tabular-nums">¥{honShimeiUnit.toLocaleString()}</span>
                </div>
              ))}
              {config.keptBanaiCastNames.map((name) => (
                <div key={`add-banai-${name}`} className="flex justify-between">
                  <span>場内指名 {name}</span>
                  <span className="tabular-nums">¥{banaiUnit.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 mt-3 pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>追加 小計</span>
                <span className="tabular-nums">¥{addedSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>追加 TAX ({taxPct}%)</span>
                <span className="tabular-nums">¥{addedTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-accent">今回追加の合計（税込）</span>
                <span className="text-xl tabular-nums font-bold text-accent">＋¥{addedTotal.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* ── 延長後の合計 ── */}
          <section className="panel p-4 flex justify-between items-baseline">
            <span className="text-base text-gold font-bold">延長後の合計（税込）</span>
            <span className="text-3xl tabular-nums font-bold text-gold">¥{afterTotal.toLocaleString()}</span>
          </section>
          <div className="text-xs text-gray-400">※ドリンクは別途、税サ込み。確定後の会計で最新の指名・注文に基づき再計算されます。</div>

          {/* 帰属先（バック）プレビュー */}
          {attributionPreview.length > 0 && (
            <section className="panel p-4">
              <h3 className="text-xs text-gray-400 tracking-wider mb-2">帰属先（売上・延長後）</h3>
              <div className="space-y-0.5 text-xs">
                {attributionPreview.map((a) => (
                  <div key={a.name} className="flex justify-between">
                    <span>{a.name}</span>
                    <span className="tabular-nums">¥{a.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                ※ spec.md §5.5: 会計時に最新の本指名キャスト集合で再按分。後追い本指名追加分も再計算対象。
              </div>
            </section>
          )}

          {table.startTime && (
            <div className="text-[10px] text-gray-600">
              通常セット料金: ¥{getSetPriceForTime(table.startTime, setPrices).toLocaleString()}（{getSetPriceLabel(table.startTime, setPrices)}）
            </div>
          )}
        </div>

        {/* サーマル印刷専用ブロック（80mm 中間チェック票）。「ただいまの料金」= 現在までの確定料金。 */}
        <div className="print-only print-receipt thermal-receipt" aria-hidden>
          <div className="t-title">【ご延長確認】</div>
          <div className="t-title">【ただいまの料金】</div>
          <div className="t-eng">INTERIM CHECK SHEET</div>
          <div className="t-dashed" />
          <div className="t-row">
            <span>{table.number}卓</span>
            <span>現在時刻: {nowHHmm}</span>
          </div>
          <div className="t-dashed" />
          <div className="t-section">【只今の料金】</div>
          <div className="t-sub">(内訳)</div>
          {currentBreakdown.sets.map((set, i) => (
            <div key={`t-set-${set.kind}-${i}`} className="t-line">
              <span>{set.label} ({set.minutes}分)</span>
              <span>¥ {set.setFee.toLocaleString()}</span>
            </div>
          ))}
          {currentOrderLines.map((o, i) => (
            <div key={`t-order-${o.menuItemId ?? i}-${o.castName ?? ''}-${i}`} className="t-line">
              <span>{o.name}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</span>
              <span>¥ {(o.price * o.quantity).toLocaleString()}</span>
            </div>
          ))}
          {currentHonFee > 0 && (
            <div className="t-line">
              <span>本指名料</span>
              <span>¥ {currentHonFee.toLocaleString()}</span>
            </div>
          )}
          {currentBanaiFee > 0 && (
            <div className="t-line">
              <span>場内指名料</span>
              <span>¥ {currentBanaiFee.toLocaleString()}</span>
            </div>
          )}
          {currentDouhanFee > 0 && (
            <div className="t-line">
              <span>同伴</span>
              <span>¥ {currentDouhanFee.toLocaleString()}</span>
            </div>
          )}
          <div className="t-line">
            <span>TAX ({taxPct}%)</span>
            <span>¥ {currentTax.toLocaleString()}</span>
          </div>
          <div className="t-dashed" />
          <div className="t-total">
            <span>合計 (Total)</span>
            <span>¥ {currentTotal.toLocaleString()}</span>
          </div>
          <div className="t-sub">(税込)</div>
          <div className="t-dashed" />
          <div className="t-section">【ご延長予算（目安）】</div>
          <div className="t-note">ご延長の確認をさせていただきます。</div>
          <div className="t-line">
            <span>30分の場合</span>
            <span>¥ {budgetIf30.toLocaleString()}</span>
          </div>
          <div className="t-line">
            <span>60分の場合</span>
            <span>¥ {budgetIf60.toLocaleString()}</span>
          </div>
          <div className="t-footnote">※ドリンクは別途、税サ込み</div>
        </div>
      </div>

      <div className="no-print">
        <BottomActionBar
          center={
            <>
              <GhostButton onClick={() => navigate(`/table/${table.id}`)} className="flex-1 max-w-[180px]">戻る</GhostButton>
              <DarkButton
                onClick={() => window.print()}
                className="flex-1 max-w-[180px] flex items-center justify-center gap-1.5"
                title="交渉票を印刷"
              >
                <Printer size={15} /> 交渉票を印刷
              </DarkButton>
              <GoldButton onClick={handleConfirm} className="flex-1 max-w-[220px]">確定して延長</GoldButton>
            </>
          }
        />
      </div>
    </div>
  )
}
