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
import { formatRealtimeWorkRange, roundClockInHHMM, roundClockOutHHMM, calcWorkHours } from '../utils/quarterHour'
import { isBusinessDateClosed } from '../utils/closing'
import { getTodayBusinessDay } from '../utils/businessDay'
import PayslipPopup from '../components/PayslipPopup'
import DailyPayDialog from '../components/DailyPayDialog'
import TimeInput from '../components/TimeInput'
import { computeDailyPayBreakdown, buildBottleBackRateByCast, type DailyPayBreakdownResult } from '../utils/dailyPayBreakdown'
import { useAuth } from '../auth'

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
  const { casts, setCasts, tables, moveCast, attendanceRecords, addAttendance, addDailyPayRequest, updateAttendance, addAttendanceEditLog, dailyReports, billingRecords, dailyPayRequests } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [editing, setEditing] = useState<Cast | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Cast | null>(null)
  const [locateCast, setLocateCast] = useState<{ cast: Cast; tableId: number | null } | null>(null)
  const [assignCast, setAssignCast] = useState<Cast | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  // PDF E: 給与明細ポップアップ / 日払い入力 / 出勤時刻修正 用
  const [payslipCast, setPayslipCast] = useState<Cast | null>(null)
  // 共通 DailyPayDialog で記録する。calculatedAmount は時給×当日勤務時間-10% +
  // バック合計を含めた純額。breakdown には稼働実績 / 既支払額も持たせる。
  const [dailyPayTarget, setDailyPayTarget] = useState<
    | { cast: Cast; calculatedAmount: number; breakdown: DailyPayBreakdownResult }
    | null
  >(null)
  // 勤務時間の編集（開始/終了/休憩をまとめて確定）。clockIn だけでなく
  // clockOut・休憩も直せるようにし、保存時に workHours を即再計算する。
  const [editClockInCast, setEditClockInCast] = useState<Cast | null>(null)
  const [editClockInValue, setEditClockInValue] = useState('')
  const [editClockOutValue, setEditClockOutValue] = useState('')
  const [editBreakValue, setEditBreakValue] = useState(0)

  // 当日の出勤レコード（PDF E: 過去履歴一覧は作らない、当日のみ）。
  // 「当日」は UTC 暦日ではなく朝 5:00 境界の営業日。深夜 0〜5 時の待機/勤怠/
  // 日払いが翌日扱いに割れず、attendance の businessDate とも揃う。
  const todayStr = getTodayBusinessDay()
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

  // DailyPayDialog から呼ぶ。date は YYYY-MM-DD (locale 表記混在で sort 破綻防止)。
  const submitDailyPayFromDialog = (req: import('../data/mock').DailyPayRequest) => {
    if (isBusinessDateClosed(todayStr, dailyReports)) return
    addDailyPayRequest(req)
    setDailyPayTarget(null)
  }

  const openAttendanceEdit = (cast: Cast) => {
    const rec = todayAttendanceByCastId.get(cast.id)
    setEditClockInCast(cast)
    setEditClockInValue(rec?.clockIn ?? '')
    setEditClockOutValue(rec?.clockOut ?? '')
    setEditBreakValue(rec?.breakMinutes ?? 0)
  }

  const closeAttendanceEdit = () => {
    setEditClockInCast(null)
    setEditClockInValue('')
    setEditClockOutValue('')
    setEditBreakValue(0)
  }

  // 編集ダイアログでの丸め後 (開始=切り上げ / 終了=切り捨て) の値。
  // 終了未入力なら null（勤務中）。
  const editRoundedIn = /^\d{2}:\d{2}$/.test(editClockInValue)
    ? roundClockInHHMM(editClockInValue) : null
  const editRoundedOut = /^\d{2}:\d{2}$/.test(editClockOutValue)
    ? roundClockOutHHMM(editClockOutValue) : null
  // プレビュー用の勤務時間（終了未確定なら null）。深夜跨ぎは calcWorkHours が
  // +24h で吸収するので 20:00→04:00 等もそのまま正しく出る。
  const editPreviewHours = editRoundedIn && editRoundedOut
    ? calcWorkHours(editRoundedIn, editRoundedOut, editBreakValue)
    : null

  const handleAttendanceEditSave = () => {
    if (!editClockInCast) return
    const rec = todayAttendanceByCastId.get(editClockInCast.id)
    if (!rec) return
    // PDF/Word 第2弾: 締め済み営業日の勤怠は修正不可（reopen 後に再開）。
    if (isBusinessDateClosed(rec.date, dailyReports)) return
    if (!editRoundedIn) return // 開始時刻は必須
    const newClockIn = editRoundedIn
    const newClockOut = editRoundedOut // null = 勤務中（終了未確定）
    const newBreak = Math.max(0, Math.round(editBreakValue) || 0)
    // 終了確定済みなら勤務時間を再計算（日跨ぎ対応）、未確定なら 0。
    const workHours = newClockOut
      ? calcWorkHours(newClockIn, newClockOut, newBreak)
      : 0
    updateAttendance(rec.id, {
      clockIn: newClockIn,
      clockOut: newClockOut,
      breakMinutes: newBreak,
      workHours,
    })
    // 変更があったフィールドだけ監査ログに残す。
    const now = new Date().toISOString()
    const by = user?.displayName ?? 'スタッフ'
    const logField = (
      field: 'clockIn' | 'clockOut' | 'breakMinutes',
      before: string | null, after: string | null,
    ) => {
      if (before === after) return
      addAttendanceEditLog({
        id: Date.now() + Math.floor(Math.random() * 1000),
        recordId: rec.id, castId: editClockInCast.id, castName: editClockInCast.name,
        field, before, after, editedAt: now, editedBy: by,
      })
    }
    logField('clockIn', rec.clockIn ?? null, newClockIn)
    logField('clockOut', rec.clockOut ?? null, newClockOut)
    logField('breakMinutes', String(rec.breakMinutes ?? 0), String(newBreak))
    closeAttendanceEdit()
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
    const cast = casts.find((c) => c.id === id)
    setCasts((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, active: true, onBreak: false, lastClockInAt: new Date().toISOString() }
          : c,
      ),
    )
    // PDF E: 待機画面からの出勤も AttendanceRecord に記録する。
    // E の勤務枠 / 修正 / 給与計算は todayAttendanceByCastId を見ているため、
    // ここを書いておかないと UI が一切反映されない。
    // 当日既に存在するレコードがあれば二重作成しない（再出勤などのケース）。
    if (cast && cast.id) {
      const existing = todayAttendanceByCastId.get(cast.id)
      if (!existing) {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        // PDF E: 出勤時刻は 15 分単位で「切り上げ」（店側保守的）
        const roundedIn = roundClockInHHMM(`${hh}:${mm}`)
        addAttendance({
          id: Date.now(),
          staffId: cast.id,
          staffName: cast.name,
          staffType: 'cast',
          date: todayStr,
          clockIn: roundedIn,
          clockOut: null,
          breakMinutes: 0,
          workHours: 0,
        })
      } else if (existing.clockOut) {
        // 再出勤: clockOut を解除して当日レコードを「出勤中」に戻す。
        // 監査ログ: clockOut が消えた事実も残す。
        const oldClockOut = existing.clockOut
        updateAttendance(existing.id, { clockOut: null })
        addAttendanceEditLog({
          id: Date.now(),
          recordId: existing.id,
          castId: cast.id,
          castName: cast.name,
          field: 'clockOut',
          before: oldClockOut,
          after: null,
          editedAt: new Date().toISOString(),
          editedBy: user?.displayName ?? 'スタッフ',
        })
      }
    }
  }

  const handleClockOut = (id: number) => {
    const cast = casts.find((c) => c.id === id)
    const isLoose = cast ? isInLooseTime(cast) : false
    setCasts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        // ルーズタイム中の退勤は出勤打刻を打消し → 給与計算対象外。
        // 判定は isInLooseTime に一本化（閾値変更時の二重管理を防ぐ）。
        return {
          ...c,
          active: false,
          onBreak: false,
          lastClockInAt: isLoose ? null : c.lastClockInAt,
        }
      }),
    )
    // PDF E: 退勤も AttendanceRecord に反映する。
    // - 通常退勤: clockOut + workHours を入れる
    // - ルーズタイム退勤（給与計算対象外）: workHours=0, clockOut=now を入れて
    //   AttendanceRecord 自体は残す（削除 API が無いため、勤務時間 0 で実質ノーカウント）
    if (cast) {
      const existing = todayAttendanceByCastId.get(cast.id)
      if (existing && !existing.clockOut) {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        // PDF E: 退勤時刻は 15 分単位で「切り捨て」（店側保守的）
        const clockOut = roundClockOutHHMM(`${hh}:${mm}`)
        if (isLoose) {
          updateAttendance(existing.id, { clockOut, workHours: 0 })
        } else {
          // PDF E: workHours は丸め後の clockIn/Out で計算する。
          const inHHMM = existing.clockIn ?? `${hh}:${mm}`
          const workHours = calcWorkHours(inHHMM, clockOut, existing.breakMinutes ?? 0)
          updateAttendance(existing.id, { clockOut, workHours })
        }
        addAttendanceEditLog({
          id: Date.now(),
          recordId: existing.id,
          castId: cast.id,
          castName: cast.name,
          field: 'clockOut',
          before: null,
          after: clockOut,
          editedAt: new Date().toISOString(),
          editedBy: user?.displayName ?? 'スタッフ',
        })
      }
    }
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
          <div className="text-[11px] text-gray-500 mb-2 px-1 leading-relaxed">
            <span className="text-gray-400">この画面＝</span>今の在店・接客中・待機中の確認用。出勤/退勤は左右へドラッグ。
            <br />
            勤務時間（給与計算に使う確定値）は各カードの
            <span className="text-gold/80">「勤務時間の編集」</span>
            で開始・終了・休憩をまとめて確定できます。「現在枠(目安)」は確定時間ではありません。
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
                    onEditClockIn={todayRec ? () => openAttendanceEdit(c) : undefined}
                    onPayslip={() => setPayslipCast(c)}
                    /* PDF/Word 第2弾: 締め済み営業日は日払い操作不可 → ボタン自体を出さない */
                    onDailyPay={
                      isBusinessDateClosed(todayStr, dailyReports)
                        ? undefined
                        : () => {
                            // ボトルバックを給与明細と一致させるため、全キャストの率を渡す。
                            const bottleRates = buildBottleBackRateByCast(casts)
                            const breakdown = computeDailyPayBreakdown(
                              c, todayStr, attendanceRecords, billingRecords, dailyPayRequests,
                              bottleRates,
                            )
                            setDailyPayTarget({
                              cast: c,
                              calculatedAmount: breakdown.net,
                              breakdown,
                            })
                          }
                    }
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
              <Avatar />
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
                  <div className="font-bold">{t.number}卓</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    対応中: {t.assignedCasts.length > 0 ? t.assignedCasts.join(', ') : 'フリー'}
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

      {/* DailyPayDialog: 待機画面からも自動計算 + 上書き + 調整理由 + メモ + 操作者 + paidAt を統一保存 */}
      <DailyPayDialog
        open={!!dailyPayTarget}
        cast={dailyPayTarget ? { id: dailyPayTarget.cast.id, name: dailyPayTarget.cast.name } : null}
        calculatedAmount={dailyPayTarget?.calculatedAmount ?? 0}
        targetDate={todayStr}
        operator={user?.displayName ?? user?.username}
        staffType="cast"
        breakdown={dailyPayTarget?.breakdown}
        workTimeConfirmed={
          !!dailyPayTarget &&
          !!todayAttendanceByCastId.get(dailyPayTarget.cast.id)?.clockOut
        }
        onEditWorkTime={dailyPayTarget ? () => {
          // 日払い→勤務時間確定への動線: 日払いを閉じて勤務時間編集を開く。
          const c = dailyPayTarget.cast
          setDailyPayTarget(null)
          openAttendanceEdit(c)
        } : undefined}
        onSubmit={submitDailyPayFromDialog}
        onClose={() => setDailyPayTarget(null)}
      />

      {/* 勤務時間の編集 — 当日レコード対象。開始/終了/休憩をまとめて確定し、
          保存時に勤務時間を即再計算する（給与計算に使う確定値はここで作る）。 */}
      <Modal
        open={!!editClockInCast}
        onClose={closeAttendanceEdit}
        title={editClockInCast ? `${editClockInCast.name} - 勤務時間の編集` : ''}
        size="sm"
        footer={
          <>
            <GhostButton onClick={closeAttendanceEdit} className="flex-1">キャンセル</GhostButton>
            <GoldButton onClick={handleAttendanceEditSave} className="flex-1" disabled={!editRoundedIn}>
              保存して確定
            </GoldButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="開始（出勤）時刻 HH:MM">
            {/* 15分丸めの業務制約に合わせて時/分 select の TimeInput を使う。開始は切り上げ。 */}
            <TimeInput
              value={editClockInValue}
              onChange={(v) => setEditClockInValue(v)}
              className="w-full"
            />
          </Field>
          <Field label="終了（退勤）時刻 HH:MM">
            <TimeInput
              value={editClockOutValue}
              onChange={(v) => setEditClockOutValue(v)}
              className="w-full"
            />
            <button
              type="button"
              onClick={() => setEditClockOutValue('')}
              className="mt-1 text-[10px] text-gray-400 underline"
            >
              終了時刻をクリア（勤務中に戻す）
            </button>
          </Field>
          <Field label="休憩（分）">
            <NumberInput value={editBreakValue} onChange={setEditBreakValue} min={0} step={5} />
          </Field>
          {/* 確定後の勤務時間プレビュー。深夜跨ぎ（例 20:00〜04:00）も正しく出す。 */}
          <div className="bg-white/[0.03] border border-white/5 rounded p-2 text-xs">
            {editPreviewHours !== null ? (
              <span className="text-emerald-300 tabular-nums">
                勤務時間 {editPreviewHours.toFixed(2)} h
                <span className="text-gray-500">（{editRoundedIn}〜{editRoundedOut}・休憩{editBreakValue}分・日跨ぎ可）</span>
              </span>
            ) : (
              <span className="text-amber-300">
                終了時刻 未入力（勤務中）。終了を入れると勤務時間が確定します。
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500">
            ※ 開始=15分切り上げ / 終了=15分切り捨てに丸めて保存。給与計算に使う勤務時間はこの確定値です。
          </p>
        </div>
      </Modal>
    </div>
  )
}

// ─── サブコンポーネント ───────────────────────────────────

function Avatar() {
  // PDF E: 頭文字表示（"あ"/"れ"/"ゆ"等）を削除。アイコン部のレイアウトは
  // 残すが文字は出さず、隣の cast.name フル表示を主表記とする。
  // name prop は旧 API 互換のため呼び出し側が渡しているが、ここでは未使用。
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
    // 1 分ごとに親 (WaitingCastPage) の setNowTick が発火して再 render される設計
    // のため、render 時点の Date.now() に依存しても min 表示は分粒度で更新される。
    // pure 違反は意図的に許容 (時計に依存する待機時間表示の宿命)。
    // eslint-disable-next-line react-hooks/purity
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

      <Avatar />

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
          {/* リアルタイムの現在枠（15分目安）。確定した勤務時間ではないことが
              分かるよう「現在枠」ラベルを付ける（終了時刻の誤読を防ぐ）。 */}
          {workRange && variant === 'on' && (
            <span className="ml-2 text-gold/80 tabular-nums">現在枠(目安) {workRange}</span>
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
