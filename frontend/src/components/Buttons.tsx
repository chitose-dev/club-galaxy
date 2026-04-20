import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  /** ダブルクリック防止の最小間隔 (ms) */
  debounceMs?: number
}

/** 連続タップを自動で無視するラッパー。disabled と合わせて onClick を 1 回だけ通す。 */
function useDebounced(onClick: BaseProps['onClick'], debounceMs: number) {
  const lastClick = useRef(0)
  return (e: React.MouseEvent<HTMLButtonElement>) => {
    const now = Date.now()
    if (now - lastClick.current < debounceMs) return
    lastClick.current = now
    onClick?.(e)
  }
}

export function GoldButton({ children, debounceMs = 250, onClick, className = '', ...rest }: BaseProps) {
  const handler = useDebounced(onClick, debounceMs)
  return (
    <button {...rest} onClick={handler} className={`btn-gold ${className}`}>
      {children}
    </button>
  )
}

export function DangerButton({ children, debounceMs = 250, onClick, className = '', ...rest }: BaseProps) {
  const handler = useDebounced(onClick, debounceMs)
  return (
    <button {...rest} onClick={handler} className={`btn-danger ${className}`}>
      {children}
    </button>
  )
}

export function DarkButton({ children, debounceMs = 250, onClick, className = '', ...rest }: BaseProps) {
  const handler = useDebounced(onClick, debounceMs)
  return (
    <button {...rest} onClick={handler} className={`btn-dark ${className}`}>
      {children}
    </button>
  )
}

export function GhostButton({ children, debounceMs = 250, onClick, className = '', ...rest }: BaseProps) {
  const handler = useDebounced(onClick, debounceMs)
  return (
    <button {...rest} onClick={handler} className={`btn-ghost ${className}`}>
      {children}
    </button>
  )
}
