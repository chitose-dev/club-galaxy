import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useStore } from '../store'
import ContextualHeader from '../components/ContextualHeader'
import { GoldButton, GhostButton } from '../components/Buttons'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { Input, Field } from '../components/Input'
import NumberInput from '../components/NumberInput'
import { Edit2, Trash2, MapPin, ArrowRightCircle, Pause, Play, GripVertical, FileText, Wallet } from 'lucide-react'
import type { Cast, Table } from '../data/mock'
import { formatRealtimeWorkRange } from '../utils/quarterHour'
import PayslipPopup from '../components/PayslipPopup'

/**
 * ISSUE-007: 待機キャスト画面 — 2 カラム DnD レイアウト。
 *  - 左 = 在籍全員 (active=false: 退勤 / 休み)
 *  - 右 = 出勤中  (active=true: 出勤 + 休憩中)
 *  - 長押しドラッグで列間移動 → 出勤 / 退勤
 *  - 出勤後 15 分の「ルーズタイム」中は待機時間表示を出さない
 *  - ルーズタイム (LOOSE_TIME_MINUTES = 15 分未満) の出退勤往復は
 *    lastClockInAt をクリアして給与計算対象外として扱う (= 給与 ¥0)
 */

const LOOSE_TIME_MINUTES = 15
const LOOSE_TIME_MS = LOOSE_TIME_MINUTES * 60 * 1000

const isInLooseTime = (c: Cast): boolean => {
  if (!c.lastClockInAt) return false
  return Date.now() - new Date(c.lastClockInAt).getTime() < LOOSE_TIME_MS
}

export default function WaitingCastPage() {
  const { casts, setCasts, tables, moveCast, attendanceRecords, addDailyPayRequest, updateAttendance } = useStore()
  const navigate = useNavigate()

  const [editing, setEditing] = useState<Cast | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Cast | null>(null)
  const [locateCast, setLocateCast] = useState<{ cast: Cast; tableId: number | null } | null>(null)
  const [assignCast, setAssignCast] = useState<Cast | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  // PDF E: 給与明細ポップアップ / 日払い入力 / 出勤時刻修正 用
  const [payslipCast, setPayslipCast] = useState<Cast | null>(null)
  const [dailyPayCast, setDailyPayCast] = useState<Cast | null>(null)
  const [dailyPayAmount, setDailyPayAmount] = useState('')
  const [editClockInCast, setEditClockInCast] = useState<Cast | null>(null)
  const [editClockInValue, setEditClockInValue] = useState('')

  // 当日の出勤レコード（PDF E: 過去履歴一覧は作らない、当日のみ）
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayAttendanceByCastId = useMemo(() => {
    const m = new Map<number, typeof attendanceRecords[number]>()
    for (const r of attendanceRecords) {
      if (r.date !== todayStr) continue
      if (r.staffType !== 'cast') continue
      m.set(r.staffId, r)
    }
    return m
  }, [attendanceRecords, todayStr])

  // リアルタイム表示の 15 分枠が分の境界で更新されるよう、1 分ごとに再描画。
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const handleDailyPaySubmit = () => {
    if (!dailyPayCast) return
    const amount = Number(dailyPayAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    addDailyPayRequest({
      id: Date.now(),
      castId: dailyPayCast.id,
      castName: dailyPayCast.name,
      amount,
      date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
    })
    setDailyPayCast(null)
    setDailyPayAmount('')
  }

  const handleClockInEditSave = () => {
    if (!editClockInCast) return
    const rec = todayAttendanceByCastId.get(editClockInCast.id)
    if (!rec) return
    const newClockIn = editClockInValue
    if (!newClockIn || !/^\d{2}:\d{2}$/.test(newClockIn)) return
    // clockOut があれば workHours を再計算
    let patch: Parameters<typeof updateAttendance>[1] = { clockIn: newClockIn }
    if (rec.clockOut) {
      const [inH, inM] = newClockIn.split(':').map(Number)
      const [outH, outM] = rec.clockOut.split(':').map(Number)
      let totalMin = (outH * 60 + outM) - (inH * 60 + inM)
      if (totalMin < 0) totalMin += 24 * 60
      const workHours = Math.round((totalMin - (rec.breakMinutes ?? 0)) / 60 * 10) / 10
      patch = { ...patch, workHours: Math.max(0, workHours) }
    }
    updateAttendance(rec.id, patch)
    setEditClockInCast(null)
    setEditClockInValue('')
  }

  // 長押し (delay 200ms) で誤発火防止。タップでは drag が始まらず編集等が可能。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const castTableMap = useMemo(() => {
    const m = new Map<string, Table>()
    for (const t of tables) {
      for (const name of t.assignedCasts) m.set(name, t)
    }
    return m
  }, [tables])

  const assignedNames = useMemo(() => new Set(tables.flatMap((t) => t.assignedCasts)), [tables])

  const offCasts = useMemo(() => casts.filter((c) => !c.active), [casts])
  const onCasts = useMemo(() => casts.filter((c) => c.active), [casts])

  const handleClockIn = (id: number) => {
    setCasts((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, active: true, onBreak: false, lastClockInAt: new Date().toISOString() }
          : c,
      ),
    )
  }

  const handleClockOut = (id: number) => {
    setCasts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        // ルーズタイム中の退勤は出勤打刻を打消し → 給与計算対象外。
        // 判定は isInLooseTime に一本化（閾値変更時の二重管理を防ぐ）。
        return {
          ...c,
          active: false,
          onBreak: false,
          lastClockInAt: isInLooseTime(c) ? null : c.lastClockInAt,
        }
      }),
    )
  }

  const handleToggleBreak = (id: number) => {
    setCasts((prev) => prev.map((c) => (c.id === id ? { ...c, onBreak: !c.onBreak } : c)))
  }

  const deleteCast = () => {
    if (!pendingDelete) return
    setCasts((prev) => prev.filter((c) => c.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const onDragStart = (e: DragStartEvent) => {
    setDraggingId(Number(e.active.id))
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null)
    if (!e.over) return
    const castId = Number(e.active.id)
    if (e.over.id === 'on-zone') {
      const c = casts.find((x) => x.id === castId)
      if (c && !c.active) handleClockIn(castId)
    } else if (e.over.id === 'off-zone') {
      const c = casts.find((x) => x.id === castId)
      if (c && c.active) handleClockOut(castId)
    }
  }

  const draggingCast = draggingId !== null ? casts.find((c) => c.id === draggingId) ?? null : null

  return (
    <div className="flex flex-col h-full">
      <ContextualHeader accent="waiting" title="待機キャスト" />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-[11px] text-gray-500 mb-2 px-1">
            長押しでドラッグ → 列間移動で出勤 / 退勤。タップで編集・削除・所在確認。
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl mx-auto">
            <DroppableColumn
              id="off-zone"
              title="在籍全員 (退勤 / 休み)"
              accent="off"
              count={offCasts.length}
            >
              {offCasts.map((c) => (
                <DraggableCastCard
                  key={c.id}
                  cast={c}
                  variant="off"
                  busy={false}
                  onEdit={() => setEditing(c)}
                  onDelete={() => setPendingDelete(c)}
                  onTap={() => {/* 在籍全員側は出勤するまで卓割当不可 */}}
                  isDragging={draggingId === c.id}
                />
              ))}
              {offCasts.length === 0 && (
                <div className="text-center text-gray-600 text-xs py-8">全員出勤中</div>
              )}
            </DroppableColumn>

            <DroppableColumn
              id="on-zone"
              title="出勤中"
              accent="on"
              count={onCasts.length}
            >
              {onCasts.map((c) => {
                const busy = assignedNames.has(c.name)
                const todayRec = todayAttendanceByCastId.get(c.id)
                // PDF E: 当日出勤レコードの clockIn を元に「20:00〜20:15」形式の
                // リアルタイム勤務枠を出す。未打刻なら表示なし。
                const realtimeRange = todayRec?.clockIn
                  ? formatRealtimeWorkRange(todayRec.clockIn)
                  : ''
                return (
                  <DraggableCastCard
                    key={c.id}
                    cast={c}
                    variant="on"
                    busy={busy}
                    location={busy ? castTableMap.get(c.name) ?? null : null}
                    workRange={realtimeRange}
                    canEditClockIn={!!todayRec}
                    onEditClockIn={todayRec ? () => {
                      setEditClockInCast(c)
                      setEditClockInValue(todayRec.clockIn ?? '')
                    } : undefined}
                    onPayslip={() => setPayslipCast(c)}
                    onDailyPay={() => { setDailyPayCast(c); setDailyPayAmount('') }}
                    onEdit={() => setEditing(c)}
                    onDelete={() => setPendingDelete(c)}
                    onToggleBreak={() => handleToggleBreak(c.id)}
                    onTap={() => {
                      if (busy) {
                        const t = castTableMap.get(c.name) ?? null
                        setLocateCast({ cast: c, tableId: t?.id ?? null })
                      } else {
                        setAssignCast(c)
                      }
                    }}
                    isDragging={draggingId === c.id}
                  />
                )
              })}
              {onCasts.length === 0 && (
                <div className="text-center text-gray-600 text-xs py-8">出勤中のキャストがいません</div>
              )}
            </DroppableColumn>
          </div>
        </div>

        <DragOverlay>
          {draggingCast ? (
            <div className="panel p-3 flex items-center gap-3 shadow-2xl border-2 border-gold/60 bg-primary-dark/95 rounded-lg max-w-[280px]">
              <Avatar name={draggingCast.name} />
              <div className="flex-1">
                <div className="text-base font-bold text-white">{draggingCast.name}</div>
                <div className="text-[10px] text-gold">移動中…</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 接客中 → 所在表示 */}
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
                  onClick={() => { navigate('/floor'); setLocateCast(null) }}
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
                    <span className="text-gray-400">本指名</span>
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

      {/* 待機 → 卓割当 */}
      <Modal
        open={!!assignCast}
        onClose={() => setAssignCast(null)}
        size="md"
        title={`${assignCast?.name ?? ''} を卓に割当`}
        footer={<GhostButton onClick={() => setAssignCast(null)} className="flex-1">キャンセル</GhostButton>}
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
                onClick={() => { moveCast(assignCast.name, t.id); setAssignCast(null) }}
                className="w-full panel p-3 flex items-center justify-between hover:bg-white/10 transition-colors text-left"
              >
                <div>
                  <div className="font-bold">卓 {t.number}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    対応中: {t.assignedCasts.length > 0 ? t.assignedCasts.join(', ') : '担当なし'}
                    {t.mainNominationCastNames.length > 0 && (
                      <span className="text-gold ml-2">(本指名: {t.mainNominationCastNames.join(', ')})</span>
                    )}
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
          onUpdate={(c) => {
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

      {/* PDF E: 給与明細ポップアップ */}
      <PayslipPopup
        open={!!payslipCast}
        cast={payslipCast}
        onClose={() => setPayslipCast(null)}
      />

      {/* PDF E: 日払い入力ポップアップ */}
      <Modal
        open={!!dailyPayCast}
        onClose={() => { setDailyPayCast(null); setDailyPayAmount('') }}
        title={dailyPayCast ? `${dailyPayCast.name} - 日払い` : ''}
        size="sm"
        footer={
          <>
            <GhostButton onClick={() => { setDailyPayCast(null); setDailyPayAmount('') }} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleDailyPaySubmit} className="flex-1" disabled={!dailyPayAmount || Number(dailyPayAmount) <= 0}>
              記録する
            </GoldButton>
          </>
        }
      >
        <div className="space-y-2">
          <Field label="日払い金額 (円)">
            <Input
              type="number"
              value={dailyPayAmount}
              onChange={(e) => setDailyPayAmount(e.target.value)}
              placeholder="例: 5000"
              className="tabular-nums"
            />
          </Field>
          <p className="text-[10px] text-gray-500">※ 給与計算時の日払い済合計に反映されます。一律10%控除して手渡しが運用想定。</p>
        </div>
      </Modal>

      {/* PDF E: 出勤時刻 修正ポップアップ — 当日レコードのみ対象、数字選択 input */}
      <Modal
        open={!!editClockInCast}
        onClose={() => { setEditClockInCast(null); setEditClockInValue('') }}
        title={editClockInCast ? `${editClockInCast.name} - 出勤時刻 修正` : ''}
        size="sm"
        footer={
          <>
            <GhostButton onClick={() => { setEditClockInCast(null); setEditClockInValue('') }} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleClockInEditSave} className="flex-1" disabled={!/^\d{2}:\d{2}$/.test(editClockInValue)}>
              保存
            </GoldButton>
          </>
        }
      >
        <div className="space-y-2">
          <Field label="出勤時刻 (HH:MM)">
            <input
              type="time"
              value={editClockInValue}
              onChange={(e) => setEditClockInValue(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-base tabular-nums"
            />
          </Field>
          <p className="text-[10px] text-gray-500">※ 修正すると当日の勤務時間 (clockOut 既存時) が自動再計算されます。</p>
        </div>
      </Modal>
    </div>
  )
}

// ─── サブコンポーネント ───────────────────────────────────

function Avatar({ name: _name }: { name: string }) {
  // PDF E: 頭文字表示（"あ"/"れ"/"ゆ"等）を削除。アイコン部のレイアウトは
  // 残すが文字は出さず、隣の cast.name フル表示を主表記とする。
  return (
    <div
      className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-gold/40 to-gold-dark/40 border border-gold/30"
      aria-hidden
    />
  )
}

function DroppableColumn({
  id, title, count, accent, children,
}: {
  id: string
  title: string
  count: number
  accent: 'on' | 'off'
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const accentCls =
    accent === 'on'
      ? `border-gold/40 ${isOver ? 'bg-gold/10 border-gold' : 'bg-gold/5'}`
      : `border-white/10 ${isOver ? 'bg-white/10 border-white/30' : 'bg-white/[0.02]'}`
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed ${accentCls} p-2 min-h-[400px] transition-colors`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <span className={`text-sm font-bold tracking-wider ${accent === 'on' ? 'text-gold' : 'text-gray-300'}`}>{title}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{count} 名</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

interface CardProps {
  cast: Cast
  variant: 'on' | 'off'
  busy: boolean
  location?: Table | null
  /** PDF E: リアルタイム 15 分単位の勤務枠表示（例: "20:00〜20:15"）。空文字なら非表示。 */
  workRange?: string
  /** PDF E: 当日出勤レコードがあるときのみ出勤時刻修正ボタンを出す。 */
  canEditClockIn?: boolean
  onEditClockIn?: () => void
  /** PDF E: 給与明細ポップアップを開く。 */
  onPayslip?: () => void
  /** PDF E: 日払い入力ポップアップを開く。 */
  onDailyPay?: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleBreak?: () => void
  onTap: () => void
  isDragging: boolean
}

function DraggableCastCard(props: CardProps) {
  const { cast, variant, busy, workRange, canEditClockIn, onEditClockIn, onPayslip, onDailyPay, onEdit, onDelete, onToggleBreak, onTap, isDragging } = props
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: String(cast.id) })

  const inLoose = isInLooseTime(cast)
  // ルーズタイム中は「料金発生中」(= 待機時間表示) を出さない
  const statusLabel = (() => {
    if (variant === 'off') return '本日休み / 退勤'
    if (busy) return '接客中'
    if (cast.onBreak) return '休憩中'
    if (inLoose) return 'ルーズタイム'
    if (!cast.lastAssignedAt) return '待機中'
    const ms = Date.now() - new Date(cast.lastAssignedAt).getTime()
    const min = Math.max(0, Math.floor(ms / 60000))
    return `待機 ${min}分`
  })()

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.3 : 1 }
    : { opacity: isDragging ? 0.3 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`panel p-2.5 flex items-center gap-2 select-none ${
        busy ? 'bg-gold/[0.08] border-gold/30' : ''
      } ${inLoose && variant === 'on' ? 'border-amber-400/40' : ''}`}
    >
      {/* ドラッグハンドル — 長押しでカード全体が動く。誤発火防止のため左端のグリップ部のみで反応 */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 p-1.5 -ml-1 text-gray-500 hover:text-gold cursor-grab active:cursor-grabbing touch-none"
        aria-label="ドラッグ"
        type="button"
      >
        <GripVertical size={16} />
      </button>

      <Avatar name={cast.name} />

      <button
        type="button"
        onClick={onTap}
        className="flex-1 min-w-0 text-left hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {/* PDF E: 頭文字ではなく cast.name をそのままフル表示 */}
          <span className="text-base font-semibold text-white truncate">{cast.name}</span>
          {inLoose && variant === 'on' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold tracking-tight whitespace-nowrap">
              ルーズ
            </span>
          )}
          {busy && <MapPin size={10} className="text-gold shrink-0" />}
        </div>
        <div className="text-[10px] text-gray-400 tracking-wide">
          {statusLabel}
          {/* PDF E: 15 分単位リアルタイム勤務枠（出勤レコードがある時のみ） */}
          {workRange && variant === 'on' && (
            <span className="ml-2 text-gold tabular-nums">{workRange}</span>
          )}
        </div>
      </button>

      <div className="shrink-0 flex items-center gap-1">
        {/* PDF E: 出勤中キャストには「明細 / 日払い / 出勤時刻修正」導線 */}
        {variant === 'on' && onPayslip && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPayslip() }}
            className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-200"
            title="給与明細"
            aria-label="給与明細"
          >
            <FileText size={12} />
          </button>
        )}
        {variant === 'on' && onDailyPay && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDailyPay() }}
            className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-200"
            title="日払い"
            aria-label="日払い"
          >
            <Wallet size={12} />
          </button>
        )}
        {variant === 'on' && canEditClockIn && onEditClockIn && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditClockIn() }}
            className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-200"
            title="出勤時刻を修正"
            aria-label="出勤時刻を修正"
          >
            ⏱
          </button>
        )}
        {variant === 'on' && onToggleBreak && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleBreak() }}
            className={`p-1.5 rounded-md text-xs ${
              cast.onBreak ? 'bg-amber-400/20 text-amber-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
            title={cast.onBreak ? '休憩解除' : '休憩へ'}
          >
            {cast.onBreak ? <Play size={12} /> : <Pause size={12} />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-gold"
          aria-label="編集"
        >
          <Edit2 size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded-md bg-white/5 hover:bg-red-500/20 text-red-400"
          aria-label="削除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

interface ModalProps {
  initial: Cast
  onClose: () => void
  onUpdate: (c: Cast) => void
}

function CastEditModal({ initial, onClose, onUpdate }: ModalProps) {
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
    onUpdate(cast)
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
          <NumberInput value={hourlyRate} onChange={setHourlyRate} step={100} min={0} />
        </Field>
        <Field label="売上保証率 (0.0〜1.0)">
          <NumberInput value={guaranteeRate} onChange={setGuaranteeRate} step={0.05} min={0} max={1} />
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
