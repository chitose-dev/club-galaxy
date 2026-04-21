import { Printer, FileText, X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onPrintDetailed: () => void
  onPrintSummary: () => void
}

/**
 * TRUST の印刷選択モーダル相当。
 * 「明細ありで印刷 / 明細なしで印刷 / キャンセル」の 3 択。
 */
export default function PrintMethodModal({ open, onClose, onPrintDetailed, onPrintSummary }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-primary border border-white/10 rounded-lg w-full max-w-sm p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white text-center mb-2">領収書の印刷方法</h3>

        <button
          onClick={onPrintDetailed}
          className="w-full btn-gold py-4 text-base font-bold flex items-center justify-center gap-2"
        >
          <FileText size={20} /> 明細ありで印刷
        </button>

        <button
          onClick={onPrintSummary}
          className="w-full btn-dark py-4 text-base font-bold flex items-center justify-center gap-2"
        >
          <Printer size={20} /> 明細なしで印刷
        </button>

        <button
          onClick={onClose}
          className="w-full bg-white/5 border border-white/10 py-3 text-sm text-gray-400 rounded-lg flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
        >
          <X size={16} /> キャンセル
        </button>
      </div>
    </div>
  )
}
