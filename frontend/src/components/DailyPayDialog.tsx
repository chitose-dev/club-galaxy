import { useEffect, useState } from 'react'
import type { DailyPayRequest } from '../data/mock'

/**
 * 日払い実行用の共通ダイアログ。
 *
 * 自動計算額を表示し、実支給額を上書き可能。上書き時は調整理由を必須にする。
 * メモ任意、操作者を auto 記録。完成した DailyPayRequest を `onSubmit` で
 * 渡し、呼び出し側で `addDailyPayRequest` する責務分担。
 *
 * `targetDate` は **必ず YYYY-MM-DD 形式** で渡すこと（locale 表記混入で
 * 履歴ソートの localeCompare が破綻するため）。
 */
export interface DailyPayDialogProps {
  open: boolean
  cast: { id: number; name: string } | null
  /** 自動計算額（時給×時間 - 10% 控除 等の理論値）。0 の場合は手動入力中心の運用。 */
  calculatedAmount: number
  /** 対象営業日（YYYY-MM-DD） */
  targetDate: string
  /** 操作者表示名（user.displayName ?? username）。null/空文字なら未設定として保存 */
  operator?: string | null
  /** staffType 既定 'cast'。boy 用に呼ぶ場合のみ 'boy' を渡す。 */
  staffType?: 'cast' | 'boy'
  onSubmit: (req: DailyPayRequest) => void
  onClose: () => void
}

export default function DailyPayDialog({
  open, cast, calculatedAmount, targetDate, operator, staffType = 'cast',
  onSubmit, onClose,
}: DailyPayDialogProps) {
  const [amountInput, setAmountInput] = useState<string>(String(calculatedAmount))
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState<string>('')

  // open するたびに自動計算額で初期化（前回の入力が残らないように）
  useEffect(() => {
    if (open) {
      setAmountInput(String(calculatedAmount))
      setReason('')
      setNote('')
    }
  }, [open, calculatedAmount])

  if (!open || !cast) return null
  const amt = Number(amountInput)
  // calculatedAmount=0 は「自動計算ベースなし、純手入力」運用。差分なし扱いにする。
  const isAdjusted = calculatedAmount > 0 && Number.isFinite(amt) && amt !== calculatedAmount
  // 0 円の日払いレコードを誤って作らないよう、必ず 1 円以上を要求する。
  // calculatedAmount=0 で開く SalaryPage の手入力経路でも、初期値 0 のまま
  // 「支払う」できないようにする。
  const canSubmit =
    Number.isFinite(amt) && amt > 0 && (!isAdjusted || reason.trim().length > 0)

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      id: Date.now(),
      castId: cast.id,
      castName: cast.name,
      amount: amt,
      // 自動計算ベースが無い場合 (calculatedAmount=0) は undefined のままにして、
      // 給与明細側で「手入力日払い」として扱えるようにする。
      calculatedAmount: calculatedAmount > 0 ? calculatedAmount : undefined,
      adjustReason: isAdjusted ? reason.trim() : undefined,
      note: note.trim() || undefined,
      paidAt: new Date().toISOString(),
      operator: operator || undefined,
      date: targetDate,
      staffType,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-4 max-w-md w-full space-y-3">
        <h3 className="text-sm font-bold text-white">日払い: {cast.name}</h3>
        <div className="text-xs text-gray-400 tabular-nums">
          対象日 {targetDate}
          {calculatedAmount > 0 && (
            <> / 自動計算額: ¥{calculatedAmount.toLocaleString()}</>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">実支給額（円）</label>
          <input
            type="number"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm tabular-nums"
            autoFocus
          />
        </div>
        {isAdjusted && (
          <div>
            <label className="text-xs text-amber-300/80 block mb-1">調整理由（必須）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
              placeholder="例: ボーナス上乗せ / 研修費差引"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500 block mb-1">メモ（任意）</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
            placeholder="補足"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-white/5 border border-white/10 py-2 rounded-lg text-sm text-gray-400"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            支払う
          </button>
        </div>
      </div>
    </div>
  )
}
