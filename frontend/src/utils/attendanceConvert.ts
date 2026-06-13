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

/** 営業日 cutoff 時刻（JST、5時）。これ以前の HH:MM は前営業日の続きとして
 *  扱う = カレンダー日付は businessDate + 1 day になる。backend
 *  `lib/businessDate.BUSINESS_DAY_CUTOFF_HOUR_DEFAULT` と同一値。 */
const BUSINESS_DAY_CUTOFF_HOUR = 5

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 単一時刻 (clockIn / scheduledClockIn) の `HH:MM` を、businessDate と
 * cutoff から実カレンダー日を導出して ISO 8601 (JST) に変換する。
 *
 * cutoff ロジック: HH:MM の時間部が `cutoffHour` 未満の場合、その時刻は
 * 「businessDate の翌カレンダー日（深夜出勤）」とみなして +1 day した
 * ISO を返す。例: businessDate=2026-06-04, hhmm=02:30, cutoff=5 →
 * `2026-06-05T02:30:00+09:00`。
 *
 * 理由: backend は businessDate を `getBusinessDate(clockIn ISO)` で導出し、
 * 5 時前は前営業日として返す仕様 (`backend/lib/businessDate.ts`)。フロント
 * 内部では「`record.date` = businessDate」として保持するので、HH:MM を ISO
 * に戻すときに同じ cutoff を逆適用しないとカレンダー日付が 1 日ズレて、
 * backend で `clockOut < clockIn` の 400 や businessDate 誤計算が発生する。
 *
 * ※ clockOut は単純な cutoff では不十分（20:00→06:00 のような深夜越え
 *   退勤で clockOut HH=06 が cutoff 上の "businessDate のまま" と判定され
 *   clockIn より前になる）。clockOut は `clockOutHhmmToIsoJst` を使うこと。
 *
 * 空入力は空文字を返す（caller 側で正規化済みの前提）。
 */
export function hhmmToIsoJst(
  businessDate: string,
  hhmm: string,
  cutoffHour: number = BUSINESS_DAY_CUTOFF_HOUR,
): string {
  if (!businessDate || !hhmm) return ''
  const [hStr] = hhmm.split(':')
  const hour = Number(hStr)
  const calendarDate =
    Number.isFinite(hour) && hour < cutoffHour
      ? addDaysToDateString(businessDate, 1)
      : businessDate
  return `${calendarDate}T${hhmm}:00+09:00`
}

/**
 * clockOut 専用の HH:MM → ISO 8601 (JST) 変換。clockIn を基準にした
 * 「clockIn 以降の最初の HH:MM 出現」を返す。
 *
 * アルゴリズム:
 *   1. clockIn ISO を `hhmmToIsoJst(businessDate, clockInHhmm, cutoff)` で導出
 *   2. clockIn の カレンダー日（JST）に clockOut HH:MM を貼り付けて candidate を作る
 *   3. candidate >= clockIn なら採用、< なら +1 day（深夜越え退勤）
 *
 * これにより以下を全て正しく ISO 化できる:
 *   - 通常: 20:00 → 22:00 (同日)
 *   - 深夜越え: 20:00 → 02:00 (翌日)
 *   - 深夜越え＋朝退勤: 20:00 → 06:00 (翌日) ← cutoff 単独だと失敗するケース
 *   - 深夜出勤＋朝退勤: 02:30 → 04:30 (clockIn と同じ翌カレンダー日)
 *   - クロウ報告バグ: businessDate=06-04, clockIn=02:30, clockOut patch 04:30
 *     → 06-05T04:30+09:00（clockIn が cutoff で 06-05 に上がるため）
 *
 * 空 clockInHhmm の場合は cutoff のみで clockOut を ISO 化（旧データ救済）。
 */
export function clockOutHhmmToIsoJst(
  businessDate: string,
  clockInHhmm: string,
  clockOutHhmm: string,
  cutoffHour: number = BUSINESS_DAY_CUTOFF_HOUR,
): string {
  if (!businessDate || !clockOutHhmm) return ''
  if (!clockInHhmm) return hhmmToIsoJst(businessDate, clockOutHhmm, cutoffHour)
  const clockInIso = hhmmToIsoJst(businessDate, clockInHhmm, cutoffHour)
  const clockInMs = new Date(clockInIso).getTime()
  const clockInCalendarDate = isoToDateJst(clockInIso)
  const candidate = `${clockInCalendarDate}T${clockOutHhmm}:00+09:00`
  if (new Date(candidate).getTime() < clockInMs) {
    return `${addDaysToDateString(clockInCalendarDate, 1)}T${clockOutHhmm}:00+09:00`
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

/** バックエンド PATCH /api/attendance/:id のリクエスト body。
 *  3 フィールドのいずれか 1 つ以上を含む partial body を送る。
 *  全て省略すると backend は 400 を返す。 */
export interface BackendPatchBody {
  clockIn?: string // ISO 8601
  clockOut?: string | null // ISO 8601、null = 終了クリア（勤務中に戻す）
  breakMinutes?: number
}

/** フロントの patch + 元レコード（businessDate 取得用）→ バック PATCH body。
 *
 *  baseRecord.date は businessDate（fromBackend が backend businessDate を
 *  そのままセットしている）。HH:MM を ISO 化する際は:
 *    - clockIn / scheduledClockIn → `hhmmToIsoJst` の cutoff(5) を逆適用
 *    - clockOut → `clockOutHhmmToIsoJst` で clockIn ISO 以降になるよう補正
 *  これにより 20:00→06:00 のような深夜越え退勤や、深夜出勤 record の事後
 *  PATCH も backend が期待する正しい ISO に変換される。
 *
 *  workHours は backend が再計算するため送らない（送っても無視される）。 */
export function toBackendPatch(
  patch: Partial<AttendanceRecord>,
  baseRecord: AttendanceRecord,
): BackendPatchBody {
  const body: BackendPatchBody = {}

  if (patch.clockIn !== undefined && patch.clockIn !== null) {
    body.clockIn = hhmmToIsoJst(baseRecord.date, patch.clockIn)
  }

  if (patch.clockOut === null) {
    // 終了クリア（勤務中に戻す）。backend に明示 null を送って clockOut を
    // 消し workMinutes/paidMinutes を 0 に戻させる。
    body.clockOut = null
  } else if (patch.clockOut !== undefined) {
    // 同 patch に clockIn が含まれていれば「新 clockIn」を基準にする。
    // 含まれていなければ baseRecord.clockIn (= 旧 clockIn HH:MM) を基準。
    const effectiveClockInHhmm =
      patch.clockIn !== undefined && patch.clockIn !== null
        ? patch.clockIn
        : (baseRecord.clockIn ?? '')
    body.clockOut = clockOutHhmmToIsoJst(
      baseRecord.date,
      effectiveClockInHhmm,
      patch.clockOut,
    )
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
