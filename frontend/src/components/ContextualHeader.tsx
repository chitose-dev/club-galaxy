import type { ReactNode } from 'react'
import BackButton from './BackButton'

interface Props {
  title: string
  backTo?: string
  showBack?: boolean
  right?: ReactNode
}

/** 下層ページ用のサブヘッダー (← 戻る / タイトル / 右側スロット) */
export default function ContextualHeader({ title, backTo, showBack = true, right }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-primary">
      <div className="flex items-center gap-3">
        {showBack && <BackButton to={backTo} />}
        <h2 className="text-lg font-semibold text-white tracking-wide">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}
