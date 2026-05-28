/**
 * HH:MM 入力をデジタル形式 (時/分 select 2 つ) で行う共通コンポーネント。
 *
 * - 時: `00..23` の 24 択 select
 * - 分: `00, 15, 30, 45` の 4 択 select（15 分単位の業務制約に合わせるため、
 *   1 分単位を許容したい場合のみ `quarterHourOnly={false}` を渡す）
 * - `value` は `"HH:MM"` 文字列、`onChange` は新しい `"HH:MM"` を即時返す
 *   標準 input と同じインターフェース
 * - 空欄 (value=undefined / null / '') も許容。空欄から数字を選ぶと
 *   もう一方が `00` 既定で埋まる
 */
export interface TimeInputProps {
  value: string | null | undefined  // "HH:MM" / null / undefined / ''
  onChange: (next: string) => void
  className?: string
  disabled?: boolean
  /** 分の選択肢を 1 分単位にしたい場合は false (default: true = 15 分単位) */
  quarterHourOnly?: boolean
  title?: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const QUARTER_MINUTES = [0, 15, 30, 45]
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => i)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function parseHHMM(s: string | null | undefined): { h: string; m: string } {
  if (!s || !/^\d{1,2}:\d{1,2}$/.test(s)) return { h: '', m: '' }
  const [h, m] = s.split(':')
  return { h: pad(parseInt(h, 10)), m: pad(parseInt(m, 10)) }
}

export default function TimeInput({
  value,
  onChange,
  className = '',
  disabled = false,
  quarterHourOnly = true,
  title,
}: TimeInputProps) {
  const { h, m } = parseHHMM(value)
  const minutes = quarterHourOnly ? QUARTER_MINUTES : ALL_MINUTES

  // 15 分単位以外 (例: "20:07") は select に該当値がないため、直近 quarter に
  // 丸めて表示だけする (emit はユーザーが明示的に変えたときのみ)。
  // 60 にラップして「:00」に化け時とずれるのを避けるため、最大値は 45 に丸める。
  const safeM = (() => {
    if (!m) return ''
    const n = parseInt(m, 10)
    if (minutes.includes(n)) return pad(n)
    if (quarterHourOnly) {
      const rounded = Math.min(45, Math.max(0, Math.round(n / 15) * 15))
      return pad(rounded)
    }
    return pad(n)
  })()

  const handleHourChange = (nextH: string) => {
    const nm = safeM || '00'
    onChange(`${nextH}:${nm}`)
  }

  const handleMinuteChange = (nextM: string) => {
    const nh = h || '00'
    onChange(`${nh}:${nextM}`)
  }

  const baseCls =
    'bg-white/5 border border-white/10 rounded px-2 py-1 tabular-nums text-sm focus:border-gold focus:outline-none transition-colors disabled:opacity-40'

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={title}>
      <select
        value={h}
        onChange={(e) => handleHourChange(e.target.value)}
        disabled={disabled}
        className={baseCls}
        aria-label="時"
      >
        <option value="">--</option>
        {HOURS.map((n) => (
          <option key={n} value={pad(n)}>{pad(n)}</option>
        ))}
      </select>
      <span className="text-gray-500 text-xs">:</span>
      <select
        value={safeM}
        onChange={(e) => handleMinuteChange(e.target.value)}
        disabled={disabled}
        className={baseCls}
        aria-label="分"
      >
        <option value="">--</option>
        {minutes.map((n) => (
          <option key={n} value={pad(n)}>{pad(n)}</option>
        ))}
      </select>
    </span>
  )
}
