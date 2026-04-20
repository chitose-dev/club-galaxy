import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

interface Props {
  to?: string
  label?: string
}

export default function BackButton({ to, label = '戻る' }: Props) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className="btn-gold flex items-center gap-1 px-3 py-2 text-sm"
    >
      <ChevronLeft size={18} strokeWidth={2.5} />
      {label}
    </button>
  )
}
