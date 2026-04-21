import type { ReactNode } from 'react'

interface Props {
  leftLabel?: string
  leftValue?: string
  center?: ReactNode
  right?: ReactNode
}

/** TRUST 準拠: 画面下部固定バー (左=金額、中央=メイン、右=補助) */
export default function BottomActionBar({ leftLabel, leftValue, center, right }: Props) {
  return (
    <div className="safe-bottom sticky bottom-0 z-30 border-t border-white/10 bg-primary/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-baseline gap-2 min-w-[110px]">
          {leftLabel && <span className="text-xs text-gray-400 tracking-wider">{leftLabel}</span>}
          {leftValue && (
            <span className="text-2xl font-bold text-gold tabular-nums tracking-tight">{leftValue}</span>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">{center}</div>
        <div className="flex items-center gap-2 min-w-[110px] justify-end">{right}</div>
      </div>
    </div>
  )
}
