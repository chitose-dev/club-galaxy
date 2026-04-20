import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string
  selected?: boolean
  hint?: string
}

/** ダークブラウン地に源氏名を表示するチップ。選択時はゴールド枠で強調。 */
export default function CastChip({ name, selected = false, hint, className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`cast-chip ${selected ? 'is-selected' : ''} ${className}`}
      aria-pressed={selected}
    >
      <span className="flex flex-col items-center leading-tight">
        <span>{name}</span>
        {hint && <span className="text-[10px] text-gray-400 mt-0.5">{hint}</span>}
      </span>
    </button>
  )
}
