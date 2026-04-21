import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 汎用の確認ダイアログ。削除などのミスクリック防止用。
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '削除',
  cancelLabel = 'キャンセル',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {destructive && <AlertTriangle size={16} className="text-accent" />}
          {title}
        </span>
      }
      footer={
        <>
          <button
            onClick={onCancel}
            className="btn-ghost px-4 py-2 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={destructive ? 'btn-danger text-sm px-4 py-2 min-h-0' : 'btn-gold text-sm px-4 py-2 min-h-0'}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-300 whitespace-pre-line">{message}</p>
    </Modal>
  )
}
