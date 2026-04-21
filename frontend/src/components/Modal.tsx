import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 閉じるボタン・背景タップ・Esc で閉じる挙動を無効化 */
  dismissible?: boolean
  /** max-w 指定 (Tailwind class)。既定: max-w-lg */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const sizeMap: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
}

/**
 * 共通モーダル。全画面で同一の枠線・角丸・配色を強制する。
 * 既存の `fixed inset-0 bg-black/60 ... bg-[#1a1a2e]` 重複を置き換える。
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  size = 'lg',
}: ModalProps) {
  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className={`bg-primary border border-gold/30 rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full ${sizeMap[size]} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || dismissible) && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
            <h3 className="text-base font-bold text-white" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>
              {title}
            </h3>
            {dismissible && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gold transition-colors p-1 -mr-1"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-white/10 flex gap-2 justify-end">{footer}</div>
        )}
      </div>
    </div>
  )
}
