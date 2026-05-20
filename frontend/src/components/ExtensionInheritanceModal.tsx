import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { GhostButton, GoldButton } from './Buttons'
import { useStore } from '../store'
import type { Table } from '../data/mock'

/**
 * spec.md §5.2: キャスト継承選択モーダル。
 *
 * 利用明細画面の [延長] ボタン押下後、延長交渉画面に進む前に挟む 1 ステップ。
 * 現在ついている場内指名・本指名キャストを個別に ON/OFF し、
 * 出勤中キャストから新規本指名を追加できる。延長時間（30 分 / 60 分）も選択。
 *
 * 確定すると ExtensionInheritanceConfig を呼び出し元に返す（次画面で使う）。
 */

export interface ExtensionInheritanceConfig {
  /** 継承する場内指名キャスト名（ON のもののみ） */
  keptBanaiCastNames: string[]
  /** 継承する本指名キャスト名（ON のもののみ） */
  keptShimeiCastNames: string[]
  /** 新規追加する本指名キャスト名 */
  addedShimeiCastNames: string[]
  /** 延長時間（分） */
  minutes: 30 | 60
  /** 延長料金（StoreSettings から引いた値） */
  extensionPrice: number
}

interface Props {
  open: boolean
  table: Table | null
  onClose: () => void
  onConfirm: (config: ExtensionInheritanceConfig) => void
}

export default function ExtensionInheritanceModal({ open, table, onClose, onConfirm }: Props) {
  const { casts, storeSettings } = useStore()

  // 現在の本指名 / 場内指名キャスト
  const currentShimei = table?.mainNominationCastNames ?? []
  // 場内指名は assignedCasts のうち mainNominationCastNames に含まれない人とする運用。
  // isBanaiShimei フラグ卓では assignedCasts 全員、それ以外は本指名以外を場内候補扱い。
  const currentBanai = useMemo(() => {
    if (!table) return []
    if (table.isBanaiShimei) return [...table.assignedCasts]
    return table.assignedCasts.filter((n) => !currentShimei.includes(n))
  }, [table, currentShimei])

  // チェック状態（初期値: 全 ON）
  const [keptShimei, setKeptShimei] = useState<Set<string>>(new Set(currentShimei))
  // 場内指名の継承は明示オプトイン（必要なものだけユーザーがチェック ON）。
  const [keptBanai, setKeptBanai] = useState<Set<string>>(new Set())
  const [addedShimei, setAddedShimei] = useState<Set<string>>(new Set())
  const [minutes, setMinutes] = useState<30 | 60>(60)

  // モーダルが開いた時の同期（table が切り替わったら state を初期化）。
  // setState は副作用なので useEffect を使う（useMemo 内 setState は React ルール違反）。
  // table.id のみを依存に置き、チェック中の操作で state を上書きしないようにする。
  useEffect(() => {
    if (!table) return
    setKeptShimei(new Set(table.mainNominationCastNames))
    // 場内指名の継承は明示オプトイン（モーダルを開き直すたびに全 OFF にリセット）。
    setKeptBanai(new Set())
    setAddedShimei(new Set())
    setMinutes(60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.id])

  const toggle = (set: Set<string>, name: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setter(next)
  }

  // 出勤中・休憩でない・既に table の assignedCasts に居ないキャストを「追加候補」とする
  const candidateCasts = casts.filter(
    (c) =>
      c.active &&
      !c.onBreak &&
      !(table?.assignedCasts ?? []).includes(c.name),
  )

  // backend /api/settings レスポンスに extensionPrice30Min / 60Min が無い場合
  // undefined になり .toLocaleString() でクラッシュ → 利用明細ページが
  // ErrorBoundary に落ちる。0 フォールバックで render を通す。
  const extensionPrice =
    (minutes === 30 ? storeSettings.extensionPrice30Min : storeSettings.extensionPrice60Min) ?? 0

  const handleConfirm = () => {
    onConfirm({
      keptBanaiCastNames: [...keptBanai],
      keptShimeiCastNames: [...keptShimei],
      addedShimeiCastNames: [...addedShimei],
      minutes,
      extensionPrice,
    })
  }

  return (
    <Modal
      open={open && !!table}
      onClose={onClose}
      size="md"
      title={table ? `${table.number}卓 延長 — キャスト継承選択` : '延長'}
      footer={
        <>
          <GhostButton onClick={onClose} className="flex-1">キャンセル</GhostButton>
          <GoldButton onClick={handleConfirm} className="flex-1">次へ</GoldButton>
        </>
      }
    >
      {table && (
        <div className="space-y-4 text-sm">
          {/* 場内指名キャストの継承 */}
          <section className="panel p-3">
            <h4 className="text-xs text-gray-400 mb-2 tracking-wider">場内指名キャストの継承</h4>
            {currentBanai.length === 0 ? (
              <div className="text-xs text-gray-500">場内指名キャストはいません</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {currentBanai.map((name) => {
                  const on = keptBanai.has(name)
                  return (
                    <button
                      key={name}
                      onClick={() => toggle(keptBanai, name, setKeptBanai)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        on ? 'bg-blue-500/20 border-blue-400/50 text-blue-200' : 'bg-white/5 border-white/10 text-gray-500 line-through'
                      }`}
                    >
                      {on ? '☑ ' : '☐ '}{name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 本指名キャストの継承 */}
          <section className="panel p-3">
            <h4 className="text-xs text-gray-400 mb-2 tracking-wider">本指名キャストの継承</h4>
            {currentShimei.length === 0 ? (
              <div className="text-xs text-gray-500">本指名キャストはいません</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {currentShimei.map((name) => {
                  const on = keptShimei.has(name)
                  return (
                    <button
                      key={name}
                      onClick={() => toggle(keptShimei, name, setKeptShimei)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        on ? 'bg-gold/20 border-gold/50 text-gold' : 'bg-white/5 border-white/10 text-gray-500 line-through'
                      }`}
                    >
                      {on ? '☑ ' : '☐ '}★{name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 本指名の追加（出勤中キャスト一覧） */}
          <section className="panel p-3">
            <h4 className="text-xs text-gray-400 mb-2 tracking-wider">＋ 本指名を追加（出勤中の待機キャスト）</h4>
            {candidateCasts.length === 0 ? (
              <div className="text-xs text-gray-500">追加可能なキャストはいません</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidateCasts.map((c) => {
                  const on = addedShimei.has(c.name)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(addedShimei, c.name, setAddedShimei)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        on ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200' : 'bg-white/5 border-white/10 text-gray-300'
                      }`}
                    >
                      {on ? '☑ ' : '＋ '}{c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 延長時間 */}
          <section className="panel p-3">
            <h4 className="text-xs text-gray-400 mb-2 tracking-wider">延長時間</h4>
            <div className="grid grid-cols-2 gap-2">
              {[30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m as 30 | 60)}
                  className={`py-2 rounded-lg text-sm font-bold border transition-colors ${
                    minutes === m
                      ? 'bg-gold/20 border-gold text-gold'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {m}分
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-2 tabular-nums">
              延長料金: ¥{(extensionPrice ?? 0).toLocaleString()}
              <span className="text-gray-600 ml-2">（管理画面 &gt; 設定 で変更可）</span>
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
