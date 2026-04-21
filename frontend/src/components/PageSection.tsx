import type { ReactNode } from 'react'

interface PageSectionProps {
  title?: ReactNode
  /** タイトル右端の補助アクション (ボタン等) */
  action?: ReactNode
  /** パネル種別: 標準 / ゴールド強調 / 高密度 (小 padding) */
  variant?: 'default' | 'gold' | 'dense'
  /** 外側の余白をカスタマイズする場合に上書き */
  className?: string
  /** 内側 padding を 0 にしたい場合 (テーブル用) */
  flush?: boolean
  children: ReactNode
}

const variantClass: Record<NonNullable<PageSectionProps['variant']>, string> = {
  default: 'panel',
  gold: 'panel-gold',
  dense: 'panel-dense',
}

/**
 * 画面内のセクション枠。`bg-white/5 rounded-lg p-4` の場当たり記述を置き換える。
 * タイトルを指定するとゴールドのヘッダ帯が付く。
 */
export default function PageSection({
  title,
  action,
  variant = 'default',
  className = '',
  flush = false,
  children,
}: PageSectionProps) {
  const padding = flush ? '' : variant === 'dense' ? 'p-3' : 'p-4'
  return (
    <section className={`${variantClass[variant]} ${padding} ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between ${flush ? 'px-4 pt-3' : ''} mb-3`}>
          {title && (
            <h3 className="text-xs font-bold tracking-wider text-gold uppercase">{title}</h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
