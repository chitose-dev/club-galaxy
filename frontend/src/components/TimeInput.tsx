/**
 * BUG-014 対応: HH:MM 入力をデジタル形式 (時/分 select 2 つ) で行うコンポーネント。
 *
 * 経緯: `<input type="time">` を使うと Android Chromium 等で「アナログクロック型
 * ピッカー」が出てしまい、店員が操作しづらい。勤怠の 15 分丸め制約とも相性が悪い
 * (任意分秒指定が可能で、結局後段でまるめる二度手間)。
 *
 * 採用方式:
 *   - 時: `00..23` の 24 択 select
 *   - 分: `00, 15, 30, 45` の 4 択 select (15 分単位の業務制約に合わせる)
 *   - 既存の `<input type="time">` と互換: `value` は `"HH:MM"` 形式、
 *     `onChange` は新しい `"HH:MM"` を即座にコールバック
 *   - 空欄 (value=undefined / null / '') も許容。空欄から数字を選ぶと
 *     もう一方が `00` 既定で埋まる (Time picker と同じ挙動)。
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

  // 値が 15 分単位以外 (例: "20:07") のときは select の選択肢に存在しない値になる。
  // その場合は「直近の 15 分」に丸めて表示するが、emit はしない (親 onChange は
  // 「ユーザーが明示的に変えたとき」のみ走らせる方針)。
  const safeM = (() => {
    if (!m) return ''
    const n = parseInt(m, 10)
    if (minutes.includes(n)) return pad(n)
    // 表示用フォールバック: 直近 quarter に丸めて見せる
    if (quarterHourOnly) {
      const rounded = Math.round(n / 15) * 15 % 60
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
