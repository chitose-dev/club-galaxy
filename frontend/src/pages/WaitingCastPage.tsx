import { useMemo, useState } from 'react'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import { GoldButton, DarkButton, GhostButton } from '../components/Buttons'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { Input, Field } from '../components/Input'
import { Plus, ArrowUpDown, Edit2, Trash2 } from 'lucide-react'
import type { Cast } from '../data/mock'

/**
 * 待機キャスト画面 (TRUST 準拠)
 * - 縦リスト: 円形アバター / 出勤トグル / 編集・削除 / 源氏名 / 待機時間
 * - 上部: キャスト追加 / 並び替え
 */
export default function WaitingCastPage() {
  const { casts, setCasts, tables } = useStore()
  const [sortMode, setSortMode] = useState<'custom' | 'waiting'>('custom')
  const [editing, setEditing] = useState<Cast | null>(null)
  const [adding, setAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Cast | null>(null)

  const assignedNames = useMemo(() => new Set(tables.flatMap((t) => t.castNames)), [tables])

  const sorted = useMemo(() => {
    if (sortMode === 'custom') return casts
    // 待機時間降順 (未アサインを優先、次に lastAssignedAt が古い順)
    return [...casts].sort((a, b) => {
      const aAssigned = assignedNames.has(a.name)
      const bAssigned = assignedNames.has(b.name)
      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1
      return (a.lastAssignedAt ?? '').localeCompare(b.lastAssignedAt ?? '')
    })
  }, [casts, assignedNames, sortMode])

  const toggleActive = (id: number) => {
    setCasts((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)))
  }

  const deleteCast = () => {
    if (!pendingDelete) return
    setCasts((prev) => prev.filter((c) => c.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const waitingLabel = (c: Cast): string => {
    // 「本日休み (active=false)」が最優先 — 卓アサインより先に判定
    if (!c.active) return '本日休み'
    if (assignedNames.has(c.name)) return '接客中'
    if (!c.lastAssignedAt) return '待機中'
    const ms = Date.now() - new Date(c.lastAssignedAt).getTime()
    const min = Math.max(0, Math.floor(ms / 60000))
    return `待機 ${min}分`
  }

  return (
    <div className="flex flex-col h-full">
      <ContextualHeader
        title="待機キャスト"
        right={
          <>
            <GoldButton onClick={() => setAdding(true)} className="flex items-center gap-1 text-sm">
              <Plus size={16} /> キャストの追加
            </GoldButton>
            <DarkButton
              onClick={() => setSortMode((s) => (s === 'custom' ? 'waiting' : 'custom'))}
              className="flex items-center gap-1 text-sm"
            >
              <ArrowUpDown size={16} /> {sortMode === 'custom' ? 'カスタム順' : '待機時間順'}
            </DarkButton>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {sorted.length === 0 && <div className="text-center text-gray-500 py-12">キャスト未登録</div>}

          {sorted.map((c) => {
            const busy = assignedNames.has(c.name)
            return (
              <div
                key={c.id}
                className="panel p-3 flex items-center gap-3"
                style={{ background: busy ? 'rgba(212, 175, 55, 0.08)' : undefined }}
              >
                {/* アバター (イニシャル) */}
                <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center text-primary font-bold text-lg">
                  {c.name.slice(0, 1)}
                </div>

                {/* 出勤トグル */}
                <button
                  onClick={() => toggleActive(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-colors ${
                    c.active
                      ? 'bg-gold text-primary'
                      : 'bg-white/5 border border-white/20 text-gray-400'
                  }`}
                >
                  {c.active ? '本日出勤' : '本日休み'}
                </button>

                {/* 編集・削除 */}
                <button
                  onClick={() => setEditing(c)}
                  className="shrink-0 p-2 rounded-md bg-white/5 hover:bg-white/10 text-gold"
                  aria-label="編集"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => setPendingDelete(c)}
                  className="shrink-0 p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-red-400"
                  aria-label="削除"
                >
                  <Trash2 size={14} />
                </button>

                {/* 名前とステータス */}
                <div className="flex-1 text-right">
                  <div className="text-lg text-white font-semibold">{c.name}</div>
                  <div className="text-xs text-gray-400 tracking-wide">{waitingLabel(c)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {(adding || editing) && (
        <CastEditModal
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSave={(c) => {
            if (editing) {
              setCasts((prev) => prev.map((x) => (x.id === c.id ? c : x)))
            } else {
              setCasts((prev) => [...prev, c])
            }
            setAdding(false)
            setEditing(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="キャスト削除"
        message={`${pendingDelete?.name ?? ''} を削除しますか? この操作は取り消せません。`}
        confirmLabel="削除"
        onConfirm={deleteCast}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

interface ModalProps {
  initial?: Cast
  onClose: () => void
  onSave: (c: Cast) => void
}

function CastEditModal({ initial, onClose, onSave }: ModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [hourlyRate, setHourlyRate] = useState(initial?.hourlyRate ?? 2000)
  const [guaranteeRate, setGuaranteeRate] = useState(initial?.guaranteeRate ?? 0)
  const [realName, setRealName] = useState(initial?.realName ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')

  const canSave = name.trim().length > 0

  const save = () => {
    const cast: Cast = {
      id: initial?.id ?? Date.now(),
      name: name.trim(),
      realName: realName.trim() || undefined,
      address: address.trim() || undefined,
      hourlyRate,
      guaranteeRate,
      active: initial?.active ?? true,
      backRates:
        initial?.backRates ?? {
          FD: 200, '本D': 500, 'Fカク': 300, '本カク': 400, '本カクW': 800,
          '同伴': 4000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000, 'ヘルプ': 4000,
        },
      lastAssignedAt: initial?.lastAssignedAt ?? null,
    }
    onSave(cast)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'キャスト編集' : 'キャスト追加'}
      size="md"
      footer={
        <>
          <GhostButton onClick={onClose} className="flex-1">キャンセル</GhostButton>
          <GoldButton onClick={save} disabled={!canSave} className="flex-1">保存</GoldButton>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="源氏名 (必須)">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="時給 (円)">
          <Input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(parseInt(e.target.value || '0', 10))}
            className="tabular-nums"
          />
        </Field>
        <Field label="売上保証率 (0.0〜1.0)">
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={guaranteeRate}
            onChange={(e) => setGuaranteeRate(parseFloat(e.target.value || '0'))}
            className="tabular-nums"
          />
        </Field>
        <Field label="本名 (税理士提出用・任意)">
          <Input value={realName} onChange={(e) => setRealName(e.target.value)} />
        </Field>
        <Field label="住所 (税理士提出用・任意)">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
