import type { ReactNode } from 'react'

export interface TabItem<K extends string = string> {
  key: K
  label: ReactNode
  /** 右端に数値バッジ (未読件数など) を表示 */
  badge?: number | string
  disabled?: boolean
}

interface TabsProps<K extends string = string> {
  value: K
  onChange: (key: K) => void
  items: TabItem<K>[]
  /** 横スクロール許容 (タブ数が多い場合) */
  scrollable?: boolean
  /** 見た目: underline (標準) / pills (丸ボタン) */
  variant?: 'underline' | 'pills'
  className?: string
}

/**
 * TRUST POS 風タブ。
 * - underline: 選択タブ下にゴールドの 2px ライン。全画面の標準タブ。
 * - pills: 選択タブがゴールドで塗られる。支払方法切替など狭い領域向け。
 */
export default function Tabs<K extends string = string>({
  value,
  onChange,
  items,
  scrollable = false,
  variant = 'underline',
  className = '',
}: TabsProps<K>) {
  if (variant === 'pills') {
    return (
      <div className={`inline-flex gap-1 p-1 rounded-[10px] bg-primary-dark/60 border border-white/10 ${className}`}>
        {items.map((it) => {
          const active = it.key === value
          return (
            <button
              key={it.key}
              type="button"
              disabled={it.disabled}
              onClick={() => onChange(it.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 ${
                active
                  ? 'bg-gold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                  : 'text-gray-300 hover:text-gold hover:bg-white/5'
              }`}
            >
              {it.label}
              {it.badge !== undefined && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold">
                  {it.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  // underline
  return (
    <div
      className={`flex gap-1 border-b border-white/10 ${scrollable ? 'overflow-x-auto' : ''} ${className}`}
      role="tablist"
    >
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={it.disabled}
            onClick={() => onChange(it.key)}
            className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
              active ? 'text-gold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {it.label}
              {it.badge !== undefined && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold">
                  {it.badge}
                </span>
              )}
            </span>
            {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-gold rounded-t" />}
          </button>
        )
      })}
    </div>
  )
}
