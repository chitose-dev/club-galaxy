import { useState, useEffect } from 'react'
import { Delete } from 'lucide-react'

interface Props {
  value: number
  onChange: (v: number) => void
  label?: string
  max?: number
}

/** 会計・値引き用テンキー。手入力の誤操作防止。 */
export default function NumberPad({ value, onChange, label, max = 9_999_999 }: Props) {
  const [display, setDisplay] = useState(String(value))

  useEffect(() => {
    setDisplay(String(value))
  }, [value])

  const commit = (next: string) => {
    const n = Math.min(parseInt(next.replace(/\D/g, '') || '0', 10), max)
    setDisplay(String(n))
    onChange(n)
  }

  const press = (digit: string) => {
    if (display === '0') return commit(digit)
    if (display.length >= 9) return
    commit(display + digit)
  }

  const backspace = () => {
    commit(display.slice(0, -1) || '0')
  }

  const clear = () => commit('0')

  return (
    <div className="panel p-3 space-y-3">
      {label && <div className="text-xs text-gray-400 tracking-wider">{label}</div>}
      <div className="bg-black/40 border border-[#d4af37]/30 rounded-lg px-3 py-2 text-right">
        <span className="text-2xl font-bold text-[#d4af37] tabular-nums">¥{Number(display).toLocaleString()}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="btn-dark py-3 text-xl">
            {d}
          </button>
        ))}
        <button onClick={clear} className="btn-dark py-3 text-sm tracking-wider">
          C
        </button>
        <button onClick={() => press('0')} className="btn-dark py-3 text-xl">
          0
        </button>
        <button onClick={() => press('00')} className="btn-dark py-3 text-xl">
          00
        </button>
        <button onClick={backspace} className="btn-dark py-3 col-span-3 flex items-center justify-center gap-2">
          <Delete size={18} /> <span className="text-sm">1 桁削除</span>
        </button>
      </div>
    </div>
  )
}
