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
  /** タイトル直後（左寄せエリア）に置く追加ノード。卓選択プルダウン等を戻るボタン側に並べたい場合に使う。 */
  leftExtra?: ReactNode
  right?: ReactNode
  /** 画面識別用アクセントカラー。左端のストライプと帯のグラデに反映。 */
  accent?: PageAccent
}

/** 下層ページ用のサブヘッダー (← 戻る / タイトル / leftExtra / 右側スロット) */
export default function ContextualHeader({ title, backTo, showBack = true, leftExtra, right, accent = 'neutral' }: Props) {
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
      <div className="flex items-center gap-3 min-w-0">
        {showBack && <BackButton to={backTo} />}
        <h2 className="text-lg font-semibold text-white tracking-wide shrink-0">{title}</h2>
        {leftExtra && <div className="flex items-center gap-2 min-w-0">{leftExtra}</div>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}
