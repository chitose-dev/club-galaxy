import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs min-h-[32px]',
  md: 'px-3 py-2 text-sm min-h-[40px]',
  lg: 'px-4 py-2.5 text-base min-h-[44px]',
}

const base =
  'w-full bg-primary-dark/60 border border-gold/20 rounded-[10px] text-white placeholder:text-gray-500 transition-colors focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: Size
  leftSlot?: ReactNode
  rightSlot?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'md', className = '', leftSlot, rightSlot, ...rest }, ref) => {
    if (leftSlot || rightSlot) {
      return (
        <div className="relative">
          {leftSlot && (
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
              {leftSlot}
            </span>
          )}
          <input
            ref={ref}
            {...rest}
            className={`${base} ${sizeClass[size]} ${leftSlot ? 'pl-9' : ''} ${rightSlot ? 'pr-9' : ''} ${className}`}
          />
          {rightSlot && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
              {rightSlot}
            </span>
          )}
        </div>
      )
    }
    return <input ref={ref} {...rest} className={`${base} ${sizeClass[size]} ${className}`} />
  }
)
Input.displayName = 'Input'

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: Size }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'md', className = '', ...rest }, ref) => (
    <select ref={ref} {...rest} className={`${base} ${sizeClass[size]} ${className}`} />
  )
)
Select.displayName = 'Select'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...rest }, ref) => (
    <textarea ref={ref} {...rest} className={`${base} px-3 py-2 text-sm ${className}`} />
  )
)
Textarea.displayName = 'Textarea'

/** ラベル + 入力のペア */
export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-300 mb-1">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-[10px] text-gray-500 mt-1">{hint}</span>}
      {error && <span className="block text-[10px] text-accent mt-1">{error}</span>}
    </label>
  )
}
