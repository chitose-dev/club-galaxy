import { useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { DarkButton, GhostButton, GoldButton } from '../components/Buttons'
import { Printer } from 'lucide-react'
import {
  getSetPriceForTime,
  getSetPriceLabel,
  SET_DURATION_MINUTES,
  type Cast,
  type Table,
  type ExtensionEntry,
} from '../data/mock'
import type { ExtensionInheritanceConfig } from '../components/ExtensionInheritanceModal'
import { Clock as ClockIcon } from 'lucide-react'

/**
 * spec.md §5.3: 延長交渉画面（点票レイアウト）。
 *
 * UsageDetailPage の [延長] → ExtensionInheritanceModal で「次へ」を押すと
 * このページに遷移する。location.state に ExtensionInheritanceConfig を載せる。
 *
 * 表示は点票準拠（時間帯 → セット情報 → メニュー → 小計 → TAX → 合計）。
 * [確定して延長] でテーブルへ ExtensionEntry を追加し、
 * mainNominationCastNames / assignedCasts を継承選択どおりに更新して /table/:id に戻る。
 */

interface LocationState {
  config?: ExtensionInheritanceConfig
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const h2 = Math.floor((total / 60) % 24)
  const m2 = total % 60
  return `${String((h2 + 24) % 24).padStart(2, '0')}:${String(m2).padStart(2, '0')}`
}

function calcCurrentSetEnd(table: Table): string {
  if (!table.startTime) return '-'
  const exMin = (table.extensionHistory ?? []).reduce((s, e) => s + e.minutes, 0)
  const total = table.setCount * SET_DURATION_MINUTES + exMin
  return addMinutes(table.startTime, total)
}

export default function ExtensionConfirmPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const config = state.config
  const { tables, casts, storeSettings, updateTable, moveCast } = useStore()
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

  // 延長後の本指名キャスト = 継承（kept） + 新規追加（added）
  const newShimei = [
    ...config.keptShimeiCastNames,
    ...config.addedShimeiCastNames.filter((n) => !config.keptShimeiCastNames.includes(n)),
  ]

  // EX 番号（延長確定後の表示用）
  const exIndex = (table.extensionHistory ?? []).length + 1
  const exLabel = `EX${exIndex}`
  const exStart = calcCurrentSetEnd(table)
  const exEnd = addMinutes(exStart, config.minutes)

  // EX セットの内訳
  const exSetFee = config.extensionPrice * table.guestCount
  const shimeiUnit = 1500 // 本指名 1 件の標準単価（仕様書 §3.2.3）
  const banaiUnit = 500 // 場内指名 1 件の標準単価
  const shimeiCharge = newShimei.length * shimeiUnit
  const banaiCharge = config.keptBanaiCastNames.length * banaiUnit

  // 通し計算: 1セット目 + 過去確定 EX + 今回確定 EX + 指名料系を全部合算する。
  // 旧実装は今回 EX 分だけで小計を出していたため、画面の合計が実料金より少なかった。
  const baseSetUnit = table.startTime ? getSetPriceForTime(table.startTime) : 0
  const baseSetFee = baseSetUnit * table.guestCount * Math.max(1, table.setCount || 1)
  // 過去 EX 各エントリは entry.minutes に応じた現行 storeSettings 単価で計算（過去
  // 単価は履歴未保存のため概算）。
  const pastExEntries = table.extensionHistory ?? []
  const pastExFee = pastExEntries.reduce((sum, e) => {
    const unit = e.minutes === 30
      ? (storeSettings.extensionPrice30Min ?? 0)
      : (storeSettings.extensionPrice60Min ?? 0)
    return sum + unit * table.guestCount
  }, 0)
  const subtotalEx = baseSetFee + pastExFee + exSetFee + shimeiCharge + banaiCharge
  const taxEx = Math.round(subtotalEx * storeSettings.taxRate)
  const totalEx = subtotalEx + taxEx

  // 「ご延長予算（目安）」用: 今回確定後にさらに 30/60 分延長したらどうなるかの参考値。
  const ext30Unit = storeSettings.extensionPrice30Min ?? 0
  const ext60Unit = storeSettings.extensionPrice60Min ?? 0
  const budgetIf30 = totalEx + Math.round(ext30Unit * table.guestCount * (1 + storeSettings.taxRate))
  const budgetIf60 = totalEx + Math.round(ext60Unit * table.guestCount * (1 + storeSettings.taxRate))

  // 印刷時刻（現在時刻）。サーマル印刷の「現在時刻」欄に使う。
  const nowHHmm = (() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })()

  // 売上帰属プレビュー（spec.md §5.5: 本指名で均等按分。フリーは帰属なし）
  const attributionPreview: { name: string; amount: number }[] = useMemo(() => {
    if (newShimei.length === 0) return []
    const each = Math.floor(subtotalEx / newShimei.length)
    return newShimei.map((n, i) => ({
      name: n,
      amount: i === newShimei.length - 1 ? subtotalEx - each * (newShimei.length - 1) : each,
    }))
  }, [newShimei, subtotalEx])

  const handleConfirm = () => {
    // 1. 場内指名から外したキャストを待機に戻す（assignedCasts から除外）
    const removedBanai = (table.isBanaiShimei ? table.assignedCasts : table.assignedCasts.filter((n) => !table.mainNominationCastNames.includes(n)))
      .filter((n) => !config.keptBanaiCastNames.includes(n))
    for (const name of removedBanai) {
      moveCast(name, null)
    }
    // 2. 本指名から外したキャストは mainNominationCastNames から除外
    //    （assignedCasts に残るかは個別: 本指名外しで席外しする運用は spec で未定なので残す）
    // 3. 新規追加した本指名キャストはこの卓へ移動 + assignedCasts/mainNominationCastNames に追加
    for (const name of config.addedShimeiCastNames) {
      const c: Cast | undefined = casts.find((cc) => cc.name === name)
      if (c) moveCast(name, table.id)
    }
    // 4. 新規 ExtensionEntry を追加
    const entry: ExtensionEntry = {
      id: Date.now(),
      minutes: config.minutes,
      timestamp: new Date().toISOString(),
    }
    // updateTable で extensionHistory + mainNominationCastNames + assignedCasts を一括更新
    const nextAssigned = Array.from(
      new Set([
        // 既存のうち、外した場内/本指名キャスト以外
        ...table.assignedCasts.filter((n) => !removedBanai.includes(n)),
        // 新規本指名は moveCast で既に追加されるが念のためここでも入れる
        ...config.addedShimeiCastNames,
      ]),
    )
    updateTable(table.id, {
      extensionHistory: [...(table.extensionHistory ?? []), entry],
      mainNominationCastNames: newShimei,
      assignedCasts: nextAssigned,
      // 場内指名フラグは継承された場内が居れば true、いなければ false
      isBanaiShimei: config.keptBanaiCastNames.length > 0,
    })
    navigate(`/table/${table.id}`)
  }

  return (
    <div className="flex flex-col min-h-full">
      <ContextualHeader accent="floor" title={`卓 ${table.number} 延長確認 (${exLabel})`} />

      <div className="flex-1 overflow-y-auto p-4">
        {/* 画面表示用カード。サーマル印刷時はグローバル @media print rule で
            兄弟の thermal-receipt のみ表示し、こちらは hide される。 */}
        <div className="max-w-3xl mx-auto panel p-4 space-y-4">
          {/* 表頭：卓 / 時間帯 */}
          <div className="flex justify-between items-baseline border-b border-white/10 pb-2">
            <span className="text-base font-bold">卓 {table.number}</span>
            <span className="text-sm tabular-nums tracking-wider text-gray-300 flex items-center gap-1">
              <ClockIcon size={14} /> {exStart} 〜 {exEnd}
            </span>
          </div>

          {/* セット情報 */}
          <section className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">セット数</span>
              <span className="text-white">{exLabel}（{config.minutes}分）</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">人数</span>
              <span>{table.guestCount} 名 / 入店 {table.startTime ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">セット料金（{exLabel}）</span>
              <span className="tabular-nums">¥{config.extensionPrice.toLocaleString()} × {table.guestCount}名 = ¥{exSetFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">担当（係）</span>
              <span className={newShimei.length > 0 ? 'text-gold' : ''}>
                {newShimei.length > 0 ? newShimei.join(', ') : 'フリー'}
              </span>
            </div>
          </section>

          {/* ⑤ メニュー（全明細）: 1セット目 / EX1 / EX2 / ... / 今回の延長 を
              区切り見出しで時系列に表示する。過去 EX のキャスト情報は
              ExtensionEntry.nominatedCastNames から復元、未保存（旧データ）
              の場合は空表示で許容。料金は当該 EX の minutes と現行 extensionPrice
              から概算（過去料金は履歴に保存していないため厳密値ではない）。 */}
          <section>
            <h3 className="text-xs text-gray-400 tracking-wider mb-2">メニュー（全明細）</h3>
            <div className="space-y-3 text-sm">
              {/* 1セット目（入店から60分）。料金は時間帯セット単価ベース。 */}
              {table.startTime && (() => {
                const baseUnit = getSetPriceForTime(table.startTime)
                const baseFee = baseUnit * table.guestCount
                const baseEnd = addMinutes(table.startTime, SET_DURATION_MINUTES)
                return (
                  <div className="border-l-2 border-gold/30 pl-3">
                    <div className="text-xs text-gold tracking-wider mb-1">
                      1セット目（{table.startTime} 〜 {baseEnd}, {SET_DURATION_MINUTES}分）
                    </div>
                    <div className="flex justify-between">
                      <span>セット料金（{getSetPriceLabel(table.startTime)}）</span>
                      <span className="tabular-nums">¥{baseUnit.toLocaleString()} × {table.guestCount}名 = ¥{baseFee.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}

              {/* 過去の EX エントリ（直近の延長 = 今回ではない、確定済のもの）。
                  料金はエントリの minutes に対応する現行 storeSettings 単価 × 人数。 */}
              {pastExEntries.map((ent, i) => {
                const prevEnd = (() => {
                  if (!table.startTime) return '-'
                  let acc = SET_DURATION_MINUTES
                  for (let j = 0; j < i; j++) {
                    acc += pastExEntries[j].minutes
                  }
                  return addMinutes(table.startTime, acc)
                })()
                const exEndPast = table.startTime
                  ? addMinutes(prevEnd, ent.minutes)
                  : '-'
                const pastUnit = ent.minutes === 30 ? ext30Unit : ext60Unit
                const pastFee = pastUnit * table.guestCount
                const pastNames = ent.nominatedCastNames ?? (ent.nominatedCastName ? [ent.nominatedCastName] : [])
                return (
                  <div key={`past-ex-${ent.id}`} className="border-l-2 border-white/20 pl-3">
                    <div className="text-xs text-gray-400 tracking-wider mb-1">
                      EX{i + 1}（{prevEnd} 〜 {exEndPast}, {ent.minutes}分）
                    </div>
                    <div className="flex justify-between">
                      <span>延長料金（EX{i + 1}）</span>
                      <span className="tabular-nums text-gray-300">¥{pastUnit.toLocaleString()} × {table.guestCount}名 = ¥{pastFee.toLocaleString()}</span>
                    </div>
                    {pastNames.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        指名: {pastNames.join(', ')}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 今回の延長（確定対象 = EX{exIndex}）。 */}
              <div className="border-l-2 border-accent/60 pl-3">
                <div className="text-xs text-accent tracking-wider mb-1">
                  {exLabel}（{exStart} 〜 {exEnd}, {config.minutes}分）★今回の延長
                </div>
                <div className="flex justify-between">
                  <span>セット料金（{exLabel}）</span>
                  <span className="tabular-nums">¥{config.extensionPrice.toLocaleString()} × {table.guestCount}名 = ¥{exSetFee.toLocaleString()}</span>
                </div>
                {newShimei.map((name) => (
                  <div key={`shimei-${name}`} className="flex justify-between">
                    <span>本指名 {name}</span>
                    <span className="tabular-nums">¥{shimeiUnit.toLocaleString()}</span>
                  </div>
                ))}
                {config.keptBanaiCastNames.map((name) => (
                  <div key={`banai-${name}`} className="flex justify-between">
                    <span>場内指名 {name}</span>
                    <span className="tabular-nums">¥{banaiUnit.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 小計 / TAX / 合計 */}
          <section className="border-t border-white/10 pt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">小計</span>
              <span className="tabular-nums">¥{subtotalEx.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TAX ({Math.round(storeSettings.taxRate * 100)}%)</span>
              <span className="tabular-nums">¥{taxEx.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 items-baseline">
              <span className="text-base text-gold font-bold">合計（税込）</span>
              <span className="text-2xl tabular-nums font-bold text-gold">¥{totalEx.toLocaleString()}</span>
            </div>
          </section>

          {/* 帰属先（バック） */}
          {attributionPreview.length > 0 && (
            <section className="border-t border-white/10 pt-2">
              <h3 className="text-xs text-gray-400 tracking-wider mb-2">帰属先（売上）</h3>
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

          {/* 参考情報: getSetPriceForTime / getSetPriceLabel — タイポ防止チェック用には呼ぶだけ */}
          {table.startTime && (
            <div className="text-[10px] text-gray-600">
              通常セット料金: ¥{getSetPriceForTime(table.startTime).toLocaleString()}（{getSetPriceLabel(table.startTime)}）
            </div>
          )}
        </div>

        {/* 交渉票印刷ブロック。BillingPage 領収書と同じ
            「.print-only > .print-receipt 白背景 div」パターンに統一。
            グローバル @media print rule に乗るので追加 CSS は不要。 */}
        <div className="print-only" aria-hidden>
          <div
            className="bg-white text-black p-4 print-receipt"
            style={{ fontFamily: 'sans-serif' }}
          >
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
              【ご延長確認】
            </div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
              【ただいまの料金】
            </div>
            <div style={{ textAlign: 'center', fontSize: '11px', letterSpacing: '0.05em', marginBottom: '4px' }}>
              INTERIM CHECK SHEET
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>卓番: {table.number}</span>
              <span>現在時刻: {nowHHmm}</span>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
              【只今の料金】
            </div>
            <div style={{ fontSize: '11px', marginBottom: '4px' }}>（内訳）</div>
            {table.startTime && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>セット（{SET_DURATION_MINUTES}分）</span>
                <span>¥{baseSetFee.toLocaleString()}</span>
              </div>
            )}
            {pastExEntries.map((ent, i) => {
              const unit = ent.minutes === 30 ? ext30Unit : ext60Unit
              return (
                <div
                  key={`t-past-${ent.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
                >
                  <span>EX{i + 1}（{ent.minutes}分）</span>
                  <span>¥{(unit * table.guestCount).toLocaleString()}</span>
                </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>{exLabel}（{config.minutes}分・今回）</span>
              <span>¥{exSetFee.toLocaleString()}</span>
            </div>
            {shimeiCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>本指名料（{newShimei.length}名）</span>
                <span>¥{shimeiCharge.toLocaleString()}</span>
              </div>
            )}
            {banaiCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>場内指名料（{config.keptBanaiCastNames.length}名）</span>
                <span>¥{banaiCharge.toLocaleString()}</span>
              </div>
            )}
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px' }}>
              <span>合計 (Total)</span>
              <span>¥{totalEx.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: '11px' }}>（税サ別）</div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
              【ご延長予算（目安）】
            </div>
            <div style={{ fontSize: '12px', marginBottom: '4px' }}>
              ご延長の確認をさせていただきます。
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>30分の場合</span>
              <span>¥{budgetIf30.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>60分の場合</span>
              <span>¥{budgetIf60.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>※ドリンク、指名料は別途</div>
            <div style={{ fontSize: '11px' }}>※税サ別</div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
          </div>
        </div>
      </div>

      <BottomActionBar
        center={
          <>
            <GhostButton onClick={() => navigate(`/table/${table.id}`)} className="flex-1 max-w-[180px]">戻る</GhostButton>
            {/* ⑤ 交渉票印刷: 確定前後どちらでも押せる。window.print() でブラウザ印刷ダイアログ起動。 */}
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
  )
}
