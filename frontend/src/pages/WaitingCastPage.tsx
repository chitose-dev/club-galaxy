import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import { GoldButton, DarkButton, GhostButton } from '../components/Buttons'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { Input, Field } from '../components/Input'
import NumberInput from '../components/NumberInput'
import { ArrowUpDown, Edit2, Trash2, MapPin, ArrowRightCircle } from 'lucide-react'
import type { Cast, Table } from '../data/mock'

/**
 * 待機キャスト画面 (TRUST 準拠)
 * - 縦リスト: 円形アバター / 出勤トグル / 編集・削除 / 源氏名 / 待機時間
 * - 上部: 並び替え
 *
 * キャスト新規追加は AdminPage > ユーザー管理に一本化（userAccount との同時作成のため）。
 * 本画面は出勤管理・編集・削除のみ。
 */
export default function WaitingCastPage() {
  const { casts, setCasts, tables, moveCast } = useStore()
  const navigate = useNavigate()
  const [sortMode, setSortMode] = useState<'custom' | 'waiting'>('custom')
  const [editing, setEditing] = useState<Cast | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Cast | null>(null)
  /** 接客中の行タップ時のポップオーバー表示対象 */
  const [locateCast, setLocateCast] = useState<{ cast: Cast; tableId: number | null } | null>(null)
  /** 待機中の行タップ時の卓割当モーダル対象 */
  const [assignCast, setAssignCast] = useState<Cast | null>(null)

  const castTableMap = useMemo(() => {
    const m = new Map<string, Table>()
    for (const t of tables) {
      for (const name of t.assignedCasts) m.set(name, t)
    }
    return m
  }, [tables])

  const assignedNames = useMemo(() => new Set(tables.flatMap((t) => t.assignedCasts)), [tables])

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

  type AttendanceStatus = 'working' | 'break' | 'off'

  const getStatus = (c: Cast): AttendanceStatus => {
    if (!c.active) return 'off'
    if (c.onBreak) return 'break'
    return 'working'
  }

  const setStatus = (id: number, status: AttendanceStatus) => {
    setCasts((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              active: status !== 'off',
              onBreak: status === 'break',
            }
          : c,
      ),
    )
  }

  const deleteCast = () => {
    if (!pendingDelete) return
    setCasts((prev) => prev.filter((c) => c.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const waitingLabel = (c: Cast): string => {
    // 休み > 接客中 > 休憩 > 待機
    if (!c.active) return '本日休み'
    if (assignedNames.has(c.name)) return '接客中'
    if (c.onBreak) return '休憩中'
    if (!c.lastAssignedAt) return '待機中'
    const ms = Date.now() - new Date(c.lastAssignedAt).getTime()
    const min = Math.max(0, Math.floor(ms / 60000))
    return `待機 ${min}分`
  }

  return (
    <div className="flex flex-col h-full">
      <ContextualHeader
        accent="waiting"
        title="待機キャスト"
        right={
          <DarkButton
            onClick={() => setSortMode((s) => (s === 'custom' ? 'waiting' : 'custom'))}
            className="flex items-center gap-1 text-sm"
          >
            <ArrowUpDown size={16} /> {sortMode === 'custom' ? 'カスタム順' : '待機時間順'}
          </DarkButton>
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

                {/* 出勤・休憩・休み 3択 */}
                <div className="shrink-0 flex rounded-full bg-white/5 border border-white/10 overflow-hidden text-xs font-semibold tracking-wider">
                  {(['working', 'break', 'off'] as const).map((s) => {
                    const labelMap = { working: '出勤', break: '休憩', off: '休み' } as const
                    const active = getStatus(c) === s
                    const activeCls =
                      s === 'working'
                        ? 'bg-gold text-primary'
                        : s === 'break'
                        ? 'bg-amber-400/90 text-primary'
                        : 'bg-white/10 text-gray-200'
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(c.id, s)}
                        className={`px-3 py-1.5 transition-colors ${active ? activeCls : 'text-gray-400 hover:text-white'}`}
                      >
                        {labelMap[s]}
                      </button>
                    )
                  })}
                </div>

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

                {/* 名前とステータス (追補02 R10-7/R10-8: 接客中/待機中でタップ時の挙動を変える) */}
                <button
                  onClick={() => {
                    if (!c.active) return // 休みは操作不可
                    const currentTable = castTableMap.get(c.name)
                    if (currentTable) {
                      // 接客中 → ポップオーバーで卓番号表示 + ジャンプボタン
                      setLocateCast({ cast: c, tableId: currentTable.id })
                    } else {
                      // 待機中 (休憩含む) → 卓割当モーダル
                      setAssignCast(c)
                    }
                  }}
                  className="flex-1 text-right hover:bg-white/5 rounded-md px-2 py-1 transition-colors"
                >
                  <div className="text-lg text-white font-semibold">{c.name}</div>
                  <div className="text-xs text-gray-400 tracking-wide flex items-center justify-end gap-1">
                    {castTableMap.has(c.name) && <MapPin size={10} className="text-gold" />}
                    {waitingLabel(c)}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* 追補02 R10-7: 接客中キャスト タップ → 該当卓の情報を表示、ジャンプボタン */}
      <Modal
        open={!!locateCast}
        onClose={() => setLocateCast(null)}
        size="sm"
        title={`${locateCast?.cast.name ?? ''} の所在`}
        footer={
          locateCast ? (
            <>
              <GhostButton onClick={() => setLocateCast(null)} className="flex-1">閉じる</GhostButton>
              {locateCast.tableId && (
                <GoldButton
                  onClick={() => {
                    navigate('/floor')
                    setLocateCast(null)
                  }}
                  className="flex-1 flex items-center justify-center gap-1"
                >
                  <ArrowRightCircle size={16} /> 卓へ
                </GoldButton>
              )}
            </>
          ) : null
        }
      >
        {locateCast && locateCast.tableId !== null && (() => {
          const t = tables.find((tt) => tt.id === locateCast.tableId)
          if (!t) return null
          return (
            <div className="space-y-3">
              <div className="panel p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">卓番</span>
                  <span className="font-bold text-lg">{t.number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">対応中</span>
                  <span>{t.assignedCasts.join(', ')}</span>
                </div>
                {t.mainNominationCastNames.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">本指名担当</span>
                    <span className="text-gold">{t.mainNominationCastNames.join(', ')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">入店</span>
                  <span>{t.startTime}〜</span>
                </div>
              </div>
              <button
                onClick={() => {
                  // 待機に戻す (追補02 R10-3)
                  moveCast(locateCast.cast.name, null)
                  setLocateCast(null)
                }}
                className="w-full panel py-2 rounded-md text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                この卓から外す (待機に戻す)
              </button>
            </div>
          )
        })()}
      </Modal>

      {/* 追補02 R10-8: 待機中キャスト タップ → 卓割当モーダル */}
      <Modal
        open={!!assignCast}
        onClose={() => setAssignCast(null)}
        size="md"
        title={`${assignCast?.name ?? ''} を卓に割当`}
        footer={
          <GhostButton onClick={() => setAssignCast(null)} className="flex-1">キャンセル</GhostButton>
        }
      >
        {assignCast && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-2">使用中の卓から選択してください</div>
            {tables.filter((t) => t.status !== 'empty').length === 0 && (
              <div className="text-center text-gray-500 py-6">使用中の卓がありません</div>
            )}
            {tables.filter((t) => t.status !== 'empty').map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  moveCast(assignCast.name, t.id)
                  setAssignCast(null)
                }}
                className="w-full panel p-3 flex items-center justify-between hover:bg-white/10 transition-colors text-left"
              >
                <div>
                  <div className="font-bold">卓 {t.number}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    対応中: {t.assignedCasts.length > 0 ? t.assignedCasts.join(', ') : '担当なし'}
                    {t.mainNominationCastNames.length > 0 && <span className="text-gold ml-2">(本指名: {t.mainNominationCastNames.join(', ')})</span>}
                  </div>
                </div>
                <ArrowRightCircle size={18} className="text-gold" />
              </button>
            ))}
          </div>
        )}
      </Modal>

      {editing && (
        <CastEditModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            setCasts((prev) => prev.map((x) => (x.id === c.id ? c : x)))
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
  initial: Cast
  onClose: () => void
  onSave: (c: Cast) => void
}

function CastEditModal({ initial, onClose, onSave }: ModalProps) {
  const [name, setName] = useState(initial.name)
  const [hourlyRate, setHourlyRate] = useState(initial.hourlyRate)
  const [guaranteeRate, setGuaranteeRate] = useState(initial.guaranteeRate)
  const [realName, setRealName] = useState(initial.realName ?? '')
  const [address, setAddress] = useState(initial.address ?? '')

  const canSave = name.trim().length > 0

  const save = () => {
    const cast: Cast = {
      ...initial,
      name: name.trim(),
      realName: realName.trim() || undefined,
      address: address.trim() || undefined,
      hourlyRate,
      guaranteeRate,
    }
    onSave(cast)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="キャスト編集"
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
          <NumberInput
            value={hourlyRate}
            onChange={setHourlyRate}
            step={100}
            min={0}
          />
        </Field>
        <Field label="売上保証率 (0.0〜1.0)">
          <NumberInput
            value={guaranteeRate}
            onChange={setGuaranteeRate}
            step={0.05}
            min={0}
            max={1}
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
