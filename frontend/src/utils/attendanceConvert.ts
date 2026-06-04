/**
 * AttendanceRecord のフロント / バックエンド間 boundary 変換 純関数群。
 *
 * フロント型 (`data/mock.ts`):
 *   - date: 'YYYY-MM-DD'
 *   - clockIn / clockOut: 'HH:MM' | null
 *   - workHours: number (小数時間)
 *   - scheduledClockIn?: 'HH:MM' | null
 *
 * バック型 (`backend/types.ts`):
 *   - businessDate: 'YYYY-MM-DD'
 *   - clockIn: ISO 8601 timestamp (JST)
 *   - clockOut: ISO 8601 timestamp | null
 *   - workMinutes / paidMinutes: number (整数分)
 *   - scheduledClockIn: ISO 8601 | null
 *
 * 不一致のまま POST すると backend `getBusinessDate("21:30")` が Invalid Date
 * になり、`businessDate` が NaN-NaN-NaN で書き込まれ、以後の date 絞り込み
 * クエリで永久に出てこなくなる。PATCH 側も clockOut が ISO 8601 でないと
 * `new Date("21:30")` が NaN になり 400 で必ず弾かれる。
 *
 * 旧データ（HH:MM のまま誤保存された legacy レコード）の互換性のため、
 * ISO → HH:MM 変換側で `new Date(value).getTime()` が NaN なら入力値を
 * そのまま返す fallback を入れる（先方確定方針）。
 */

import type { AttendanceRecord } from '../data/mock'

const JST_OFFSET_MIN = 9 * 60 // JST は UTC + 9 時間

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `YYYY-MM-DD` + `HH:MM` → `YYYY-MM-DDTHH:MM:00+09:00` の ISO 8601 文字列。
 *  入力検証はゆるく（caller 側で正規化済みの前提）、空入力は空文字を返す。 */
export function hhmmToIsoJst(date: string, hhmm: string): string {
  if (!date || !hhmm) return ''
  return `${date}T${hhmm}:00+09:00`
}

/** 退勤時刻専用: clockIn の ISO 8601 を参照し、新しい clockOut HH:MM が
 *  当日の clockIn 以降になる ISO 8601 を返す。clockOut が clockIn より前
 *  （= 日跨ぎ退勤、例: 23:30 出勤 → 01:30 退勤）なら 1 日加算する。 */
export function clockOutHhmmToIsoJst(clockInIso: string, clockOutHhmm: string): string {
  if (!clockInIso || !clockOutHhmm) return ''
  const clockInDate = new Date(clockInIso)
  if (Number.isNaN(clockInDate.getTime())) {
    // clockIn が malformed ならフォールバック: clockOut の date 部を抽出できない
    // ため、今日の calendar date を使う（古いレコード救済目的の経路）。
    const today = isoToDateJst(new Date().toISOString())
    return hhmmToIsoJst(today, clockOutHhmm)
  }
  const clockInDateStr = isoToDateJst(clockInIso)
  const candidate = hhmmToIsoJst(clockInDateStr, clockOutHhmm)
  const candidateMs = new Date(candidate).getTime()
  if (candidateMs < clockInDate.getTime()) {
    // 日跨ぎ: +1 day
    const next = addDaysToDateString(clockInDateStr, 1)
    return hhmmToIsoJst(next, clockOutHhmm)
  }
  return candidate
}

/** ISO 8601 → JST 表示の `HH:MM`。malformed (NaN) なら入力をそのまま返す
 *  （legacy 旧データ救済: HH:MM 文字列がそのまま保存されていたケース対応）。 */
export function isoToHhmmJst(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    // 既に HH:MM 形式の旧データならそのまま返す
    if (/^\d{1,2}:\d{2}$/.test(value)) return value
    return null
  }
  // JST 補正してから HH:MM 抽出
  const jstMs = d.getTime() + JST_OFFSET_MIN * 60_000
  const jst = new Date(jstMs)
  // jst は UTC 補正済みの Date object なので、UTC メソッドで JST 表示が取れる
  return `${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}`
}

/** ISO 8601 → JST 表示の `YYYY-MM-DD`。malformed なら空文字。 */
export function isoToDateJst(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const jstMs = d.getTime() + JST_OFFSET_MIN * 60_000
  const jst = new Date(jstMs)
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`
}

/** `YYYY-MM-DD` に `days` 日を加算した `YYYY-MM-DD`。負値で減算も可。 */
export function addDaysToDateString(date: string, days: number): string {
  // 12:00 JST 基準で日付加算（DST 等の影響を受けにくくするため正午起点）
  const base = new Date(`${date}T12:00:00+09:00`)
  base.setUTCDate(base.getUTCDate() + days)
  const jstMs = base.getTime() + JST_OFFSET_MIN * 60_000
  const jst = new Date(jstMs)
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`
}

// ─── 高レベル変換 (record 単位) ─────────────────────────────────────────

/** バックエンド POST /api/attendance のリクエスト body。
 *  backend `tables.ts` で要求される shape に合わせる。 */
export interface BackendCreateBody {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  clockIn: string // ISO 8601
  breakMinutes: number
  scheduledClockIn?: string | null // ISO 8601 | null
  autoCreated?: boolean
}

/** フロントの新規 AttendanceRecord をバックエンド POST 用 body に変換。
 *  - date + clockIn (HH:MM) → ISO 8601
 *  - scheduledClockIn (HH:MM) も同じ date に対して ISO 化
 *  - workHours は backend が無視するので含めない（POST 時点で 0 固定） */
export function toBackendCreate(front: AttendanceRecord): BackendCreateBody {
  if (!front.clockIn) {
    // フロントは clockIn null で create する経路は本来ないが、防御的に空文字を渡す
    // と backend が 400 で弾くため、最低限 ISO 8601 を組み立てる。
    throw new Error('clockIn (HH:MM) が未指定のレコードは保存できません')
  }
  return {
    id: front.id,
    staffId: front.staffId,
    staffName: front.staffName,
    staffType: front.staffType,
    clockIn: hhmmToIsoJst(front.date, front.clockIn),
    breakMinutes: front.breakMinutes ?? 0,
    ...(front.scheduledClockIn
      ? { scheduledClockIn: hhmmToIsoJst(front.date, front.scheduledClockIn) }
      : {}),
  }
}

/** バックエンド PATCH /api/attendance/:id のリクエスト body。 */
export interface BackendPatchBody {
  clockOut?: string // ISO 8601
  breakMinutes?: number
}

/** フロントの patch + 元レコード（clockIn の ISO 復元用）→ バック PATCH body。
 *  clockOut HH:MM を clockIn の ISO に基づいて日跨ぎ判定込みで ISO 化する。
 *  workHours は backend が再計算するため送らない（送っても無視される）。 */
export function toBackendPatch(
  patch: Partial<AttendanceRecord>,
  baseRecord: AttendanceRecord,
): BackendPatchBody {
  const body: BackendPatchBody = {}
  if (patch.clockOut !== undefined && patch.clockOut !== null) {
    // clockIn を ISO 8601 化（baseRecord は front 型なので date + HH:MM）
    const clockInIso = baseRecord.clockIn
      ? hhmmToIsoJst(baseRecord.date, baseRecord.clockIn)
      : ''
    body.clockOut = clockOutHhmmToIsoJst(clockInIso, patch.clockOut)
  }
  if (patch.breakMinutes !== undefined) {
    body.breakMinutes = patch.breakMinutes
  }
  return body
}

/** バックエンド GET レスポンスの 1 レコードをフロント表示用に変換。
 *  - businessDate → date
 *  - ISO 8601 clockIn/clockOut → HH:MM (JST)
 *  - workMinutes → workHours (= workMinutes / 60、小数許容)
 *  - scheduledClockIn ISO → HH:MM
 *  malformed な ISO は HH:MM をそのまま返す fallback で旧データを温存。 */
export function fromBackend(
  back: Record<string, unknown>,
): AttendanceRecord {
  const workMinutes = typeof back.workMinutes === 'number' ? back.workMinutes : 0
  // フロント既存 date フィールドが残っている古いレコードもありうるので、
  // businessDate を優先しつつ fallback で date を見る。
  const date =
    (typeof back.businessDate === 'string' && back.businessDate) ||
    (typeof back.date === 'string' && back.date) ||
    ''
  return {
    id: typeof back.id === 'number' ? back.id : 0,
    staffId: typeof back.staffId === 'number' ? back.staffId : 0,
    staffName: typeof back.staffName === 'string' ? back.staffName : '',
    staffType: back.staffType === 'boy' ? 'boy' : 'cast',
    date,
    clockIn: isoToHhmmJst(typeof back.clockIn === 'string' ? back.clockIn : null),
    clockOut: isoToHhmmJst(typeof back.clockOut === 'string' ? back.clockOut : null),
    breakMinutes: typeof back.breakMinutes === 'number' ? back.breakMinutes : 0,
    workHours: workMinutes > 0 ? workMinutes / 60 : 0,
    ...(back.scheduledClockIn !== undefined
      ? { scheduledClockIn: isoToHhmmJst(back.scheduledClockIn as string | null) }
      : {}),
  }
}
