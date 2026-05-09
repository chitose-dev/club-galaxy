import { useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import BottomActionBar from '../components/BottomActionBar'
import { GhostButton, GoldButton } from '../components/Buttons'
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
 * 表示は点票準拠（時間帯 → セット情報 → メニュー → 証券 → タックス → 合計）。
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
  const subtotalEx = exSetFee + shimeiCharge + banaiCharge
  const taxEx = Math.round(subtotalEx * storeSettings.taxRate)
  const totalEx = subtotalEx + taxEx

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

          {/* メニュー */}
          <section>
            <h3 className="text-xs text-gray-400 tracking-wider mb-2">メニュー</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>セット料金（{exLabel}）</span>
                <span className="tabular-nums">¥{exSetFee.toLocaleString()}</span>
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
          </section>

          {/* 証券 / タックス / 合計 */}
          <section className="border-t border-white/10 pt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">証券（税抜小計）</span>
              <span className="tabular-nums">¥{subtotalEx.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">タックス ({Math.round(storeSettings.taxRate * 100)}%)</span>
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
      </div>

      <BottomActionBar
        center={
          <>
            <GhostButton onClick={() => navigate(`/table/${table.id}`)} className="flex-1 max-w-[180px]">戻る</GhostButton>
            <GoldButton onClick={handleConfirm} className="flex-1 max-w-[220px]">確定して延長</GoldButton>
          </>
        }
      />
    </div>
  )
}
