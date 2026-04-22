import type { ReactNode, CSSProperties } from 'react'
import BackButton from './BackButton'

export type PageAccent =
  | 'floor'
  | 'order'
  | 'billing'
  | 'register'
  | 'salary'
  | 'profit'
  | 'admin'
  | 'waiting'
  | 'neutral'

const accentMap: Record<PageAccent, string> = {
  floor: 'var(--color-theme-floor)',
  order: 'var(--color-theme-order)',
  billing: 'var(--color-theme-billing)',
  register: 'var(--color-theme-register)',
  salary: 'var(--color-theme-salary)',
  profit: 'var(--color-theme-profit)',
  admin: 'var(--color-theme-admin)',
  waiting: 'var(--color-theme-waiting)',
  neutral: 'transparent',
}

interface Props {
  title: string
  backTo?: string
  showBack?: boolean
  right?: ReactNode
  /** 画面識別用アクセントカラー。左端のストライプと帯のグラデに反映。 */
  accent?: PageAccent
}

/** 下層ページ用のサブヘッダー (← 戻る / タイトル / 右側スロット) */
export default function ContextualHeader({ title, backTo, showBack = true, right, accent = 'neutral' }: Props) {
  const accentColor = accentMap[accent]
  const style: CSSProperties =
    accent === 'neutral'
      ? {}
      : {
          background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}55 35%, var(--color-primary) 75%)`,
          borderLeft: `4px solid ${accentColor}`,
        }
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gold/30 bg-primary"
      style={style}
    >
      <div className="flex items-center gap-3">
        {showBack && <BackButton to={backTo} />}
        <h2 className="text-lg font-semibold text-white tracking-wide">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}
