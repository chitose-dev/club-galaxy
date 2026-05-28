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
export interface DailyPayBreakdown {
  /** 当日勤務時間 (h)。0 の場合は勤怠未登録扱い。 */
  workHours: number
  /** 当日時給分 (時給 × 勤務時間)。 */
  hourlyPay: number
  /** 当日バック合計 (指名 / ドリンク / ボトル / 延長指名 等)。 */
  backTotal: number
  /** 控除後の本日支給目安 (≒ calculatedAmount と一致するはず)。
   *  当日キャストが受け取れる正味金額。 */
  net: number
  /** 同営業日に既に支払済の日払い合計。未支給差額の算出に使う。
   *  undefined / 0 のときは「未払い」扱い (= 全額が未支給)。 */
  paidToday?: number
}

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
  /** 当日の稼働実績内訳 (任意)。渡すと「本日の稼働実績」セクションと
   *  「本日全額」ボタンが有効になる。SalaryPage のような純手入力経路では
   *  未指定でよい (= 旧来挙動)。 */
  breakdown?: DailyPayBreakdown
  onSubmit: (req: DailyPayRequest) => void
  onClose: () => void
}

export default function DailyPayDialog({
  open, cast, calculatedAmount, targetDate, operator, staffType = 'cast',
  breakdown, onSubmit, onClose,
}: DailyPayDialogProps) {
  const [amountInput, setAmountInput] = useState<string>(String(calculatedAmount))
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState<string>('')

  // open するたびに自動計算額で初期化（前回の入力が残らないように）。
  // ダイアログのオープン遷移時に state を再初期化する用途のため、
  // 「Effects は外部システム同期」ガイドからは外れるが意図的に許可する。
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setAmountInput(String(calculatedAmount))
      setReason('')
      setNote('')
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, calculatedAmount])

  if (!open || !cast) return null
  const amt = Number(amountInput)
  // 「本日全額」ボタン用: 当日既支払い分を差し引いた未支給差額。
  // calculatedAmount=0 (= 自動計算ベースなし) では押せない。
  const paidToday = breakdown?.paidToday ?? 0
  const unpaidRemainder = Math.max(0, calculatedAmount - paidToday)
  const canFillFullAmount = calculatedAmount > 0 && unpaidRemainder > 0
  // 調整理由必須の判定基準額。breakdown ありで既支払があるケースでは
  // 「未支給差額をワンタップ入力」が想定操作のため、それを基準値にする
  // (= 未支給差額をそのまま入れる限り「調整なし」扱い)。
  // breakdown 無し or 既支払なしの従来経路では calculatedAmount を基準にする。
  const expectedAmount = paidToday > 0 ? unpaidRemainder : calculatedAmount
  // calculatedAmount=0 は「自動計算ベースなし、純手入力」運用。差分なし扱いにする。
  const isAdjusted = expectedAmount > 0 && Number.isFinite(amt) && amt !== expectedAmount
  // 0 円の日払いレコードを誤って作らないよう、必ず 1 円以上を要求する。
  // calculatedAmount=0 で開く SalaryPage の手入力経路でも、初期値 0 のまま
  // 「支払う」できないようにする。
  const canSubmit =
    Number.isFinite(amt) && amt > 0 && (!isAdjusted || reason.trim().length > 0)

  const handleSubmit = () => {
    if (!canSubmit) return
    // 保存値の calculatedAmount は「この 1 レコードでの理論値」を入れる。
    // 差額支払 (paidToday > 0) のときは「今回の未支給差額 = expectedAmount」が
    // 理論値であり、これと amount を比較するのが PayslipPopup 側の自然な解釈になる。
    // ここで本日支給目安 (calculatedAmount) 全額を入れてしまうと、`amount=7000`
    // `calculatedAmount=10000` で 1 件目支払い分 ¥3,000 がそのまま「理由なし
    // 調整」として誤表示されるため、expectedAmount に揃える。
    const savedCalculatedAmount =
      expectedAmount > 0 ? expectedAmount : (calculatedAmount > 0 ? calculatedAmount : undefined)
    onSubmit({
      id: Date.now(),
      castId: cast.id,
      castName: cast.name,
      amount: amt,
      calculatedAmount: savedCalculatedAmount,
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

        {breakdown && (
          <div className="bg-white/[0.03] border border-white/5 rounded p-3 space-y-1.5 text-xs">
            <div className="text-gray-400 tracking-wider mb-1">本日の稼働実績</div>
            <Row label="勤務時間" value={`${breakdown.workHours.toFixed(2)} h`} />
            <Row label="時給分" value={`¥${breakdown.hourlyPay.toLocaleString()}`} />
            <Row label="バック合計" value={`¥${breakdown.backTotal.toLocaleString()}`} />
            <Row
              label="本日支給目安 (控除後)"
              value={`¥${breakdown.net.toLocaleString()}`}
              valueClass="text-emerald-300 font-bold tabular-nums"
            />
            {paidToday > 0 && (
              <>
                <Row
                  label="本日 既支払済"
                  value={`-¥${paidToday.toLocaleString()}`}
                  valueClass="text-red-300 tabular-nums"
                />
                <Row
                  label="未支給差額"
                  value={`¥${unpaidRemainder.toLocaleString()}`}
                  valueClass="text-gold font-bold tabular-nums"
                />
              </>
            )}
          </div>
        )}

        <div>
          <div className="flex items-end justify-between mb-1">
            <label className="text-xs text-gray-500">実支給額（円）</label>
            {breakdown && (
              <button
                type="button"
                onClick={() => setAmountInput(String(unpaidRemainder))}
                disabled={!canFillFullAmount}
                title={
                  canFillFullAmount
                    ? `未支給差額 ¥${unpaidRemainder.toLocaleString()} を入力`
                    : paidToday >= calculatedAmount
                      ? '本日分は既に全額支払い済'
                      : '自動計算額が未確定 (¥0)'
                }
                className="text-[11px] px-2 py-0.5 rounded border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {paidToday > 0 ? '未支給差額を入力' : '本日全額を入力'}
              </button>
            )}
          </div>
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

function Row({
  label, value, valueClass = 'tabular-nums',
}: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}
