import { forwardRef, useEffect, useRef, useState } from 'react'

import { parseNumberInput, stripLeadingZeros } from './numberInputUtils'

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
 *   - 入力中(emit)と確定(blur)で同じ clamp を通し、min/max を確定時にも必ず適用。
 *     表示値と onChange 値がズレない。step が整数のフィールドは整数化する。
 *
 * 全数値入力フィールドで統一使用する (R12-5)。
 * 確定ロジックの純関数は ./numberInputUtils に分離 (テスト容易化)。
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

  // step が整数なら整数前提フィールド (時給/休憩分/バック単価/値引き)。
  // 0.05 等の小数刻みは料率フィールド (保証率) として小数を許容する。
  const integerOnly = Number.isInteger(step)
  const clampOpts = { min, max, integerOnly }

  // 外部から value が変わったら text を同期 (フォーカス中は干渉しない)
  useEffect(() => {
    if (!isFocusedRef.current) {
      setText(String(value))
    }
  }, [value])

  const emit = (raw: string) => {
    // 空文字 / 符号のみは中間入力として保持 (blur 時に emptyValue へ戻す)
    if (raw === '' || raw === '-') {
      setText(raw)
      return
    }
    // 先頭ゼロを畳む (R12-3)。"00"→"0" / "00.5"→"0.5" / "0.5"→"0.5"。
    const next = stripLeadingZeros(raw)
    setText(next)
    // 表示はユーザ入力のまま保持しつつ、親へは emit/blur 共通の clamp を通した
    // 値だけ渡す。これにより保証率 (max=1) に 5 を入れても親が 5 を受け取らない。
    const clamped = parseNumberInput(next, clampOpts)
    if (clamped !== null) {
      onChange(clamped)
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
    // emit と同じ clamp を通して確定。表示文字列と onChange 値を同じ結果へ揃える
    // ので両者がズレない。数値化できない中間入力のみ emptyValue へ戻す
    // (有効な数値は 0 へ落とさない)。
    const resolved = parseNumberInput(text, clampOpts)
    const final = resolved === null ? emptyValue : resolved
    setText(String(final))
    onChange(final)
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
