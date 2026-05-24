import { forwardRef, useEffect, useRef, useState } from 'react'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  /** 表示用の単位 (例: 「円 / セット」)。右端に添える */
  unit?: string
  /** プレースホルダ (空欄時表示)。既定: '0' */
  placeholder?: string
  /** 最小値 (既定 0) */
  min?: number
  /** 最大値 */
  max?: number
  /** 刻み (既定 1、料率用に 0.01 等指定可) */
  step?: number
  /** 空欄から戻る際の値。既定 0 */
  emptyValue?: number
  /** 入力禁止 */
  disabled?: boolean
  /** autoFocus */
  autoFocus?: boolean
  /** className 追加 (root div 全体) */
  className?: string
  /** input 自体の className (Tailwind で見た目を差し替えたい場合) */
  inputClassName?: string
  /** input の aria-label */
  'aria-label'?: string
  /** blur ハンドラ (親がタイミング取りたい場合) */
  onBlur?: () => void
}

/**
 * 追補02 R12 準拠の数値入力フィールド。
 *
 * 特徴:
 *   - 初期値 0 で表示してよい (R12-1)
 *   - 削除 (Backspace/Delete) で `0` まで完全に消える (R12-2)
 *     → 内部で string ステートを保持し、空文字列を許容
 *   - フォーカス中の数字入力で先頭 `0` を自動置換 (R12-3)
 *     → input[type="number"] のデフォルト挙動 + 手動で 0 始まり抑止
 *   - blur 時、値が空なら `emptyValue` (既定 0) に戻す (R12-4)
 *
 * 全数値入力フィールドで統一使用する (R12-5)。
 */
const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    onChange,
    unit,
    placeholder = '0',
    min = 0,
    max,
    step = 1,
    emptyValue = 0,
    disabled = false,
    autoFocus = false,
    className = '',
    inputClassName = '',
    onBlur,
    'aria-label': ariaLabel,
  },
  ref,
) {
  // 内部 string ステート — 空文字列を許容し、キャレット操作に干渉しない
  const [text, setText] = useState<string>(() => String(value))
  const isFocusedRef = useRef(false)

  // 外部から value が変わったら text を同期 (フォーカス中は干渉しない)。
  // BUG-009: 旧データで max を超える値 (例: ボトルバック 1000%) が保存されていた
  // ケースに備え、表示時点で min/max にクランプし、超過分は親 state にも書き戻す。
  useEffect(() => {
    if (isFocusedRef.current) return
    let clamped = value
    if (min !== undefined && clamped < min) clamped = min
    if (max !== undefined && clamped > max) clamped = max
    setText(String(clamped))
    if (clamped !== value) {
      onChange(clamped)
    }
  }, [value, min, max, onChange])

  const emit = (raw: string) => {
    // 空文字列はそのまま保持 (blur 時に emptyValue に戻す)
    if (raw === '' || raw === '-') {
      setText(raw)
      return
    }
    // 先頭の 0 を自動除去 (R12-3)。ただし 0. や 0.05 は保持。
    const normalized = /^0\d/.test(raw) ? raw.replace(/^0+/, '') : raw
    const n = Number(normalized)
    if (!Number.isNaN(n)) {
      let clamped = n
      if (min !== undefined && clamped < min) clamped = min
      if (max !== undefined && clamped > max) clamped = max
      // BUG-009: 表示も clamp 後の値で揃える (旧版は raw を表示し続けていたため
      // 「1000」と打って「100」が保存されるが見た目は 1000 のまま残るバグがあった)。
      setText(String(clamped))
      onChange(clamped)
    } else {
      setText(normalized)
    }
  }

  const handleFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
    isFocusedRef.current = true
    // 値が emptyValue (= 0 等) と一致していれば全選択し、次の数字入力で置換される挙動に (R12-3)
    if (Number(text) === emptyValue) {
      e.currentTarget.select()
    }
  }

  const handleBlur = () => {
    isFocusedRef.current = false
    if (text === '' || text === '-') {
      // 空欄なら emptyValue に戻す (R12-4)
      setText(String(emptyValue))
      onChange(emptyValue)
    } else {
      // 数値として正規化
      const n = Number(text)
      if (Number.isNaN(n)) {
        setText(String(emptyValue))
        onChange(emptyValue)
      } else {
        setText(String(n))
        onChange(n)
      }
    }
    onBlur?.()
  }

  const baseInputCls =
    'w-full bg-primary-dark/60 border border-gold/20 rounded-md px-3 py-2 text-base tabular-nums focus:border-gold focus:outline-none transition-colors'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => emit(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`${baseInputCls} ${inputClassName}`}
      />
      {unit && <span className="text-sm text-gray-400 whitespace-nowrap">{unit}</span>}
    </div>
  )
})

export default NumberInput
