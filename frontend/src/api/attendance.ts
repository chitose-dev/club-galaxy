import { api } from './client'
import type { AttendanceRecord } from '../data/mock'
import { toBackendCreate, toBackendPatch, fromBackend } from '../utils/attendanceConvert'

export interface AttendanceListResponse {
  data: AttendanceRecord[]
  nextCursor: string | null
}

interface RawListResponse {
  data: Record<string, unknown>[]
  nextCursor: string | null
}

/**
 * 勤怠 API クライアント。フロントの `AttendanceRecord` (date + HH:MM + workHours) と
 * バックエンド型 (businessDate + ISO 8601 + workMinutes/paidMinutes) の差異を
 * boundary で吸収する。
 *
 * 変換ロジックは `utils/attendanceConvert.ts` に集約し、テストもそちらで担保。
 * ここはルーティングと shape 変換のグルーだけに留める。
 */
export const attendanceApi = {
  list: async (params?: {
    businessDate?: string
    staffId?: number
    limit?: number
    cursor?: string
  }): Promise<AttendanceListResponse> => {
    const q = new URLSearchParams()
    if (params?.businessDate) q.set('businessDate', params.businessDate)
    if (params?.staffId !== undefined) q.set('staffId', String(params.staffId))
    if (params?.limit !== undefined) q.set('limit', String(params.limit))
    if (params?.cursor) q.set('cursor', params.cursor)
    const qs = q.toString()
    const raw = await api.get<RawListResponse>(`/api/attendance${qs ? `?${qs}` : ''}`)
    return {
      data: raw.data.map((r) => fromBackend(r)),
      nextCursor: raw.nextCursor,
    }
  },

  create: async (record: AttendanceRecord): Promise<AttendanceRecord> => {
    const body = toBackendCreate(record)
    const created = await api.post<Record<string, unknown>>('/api/attendance', body)
    return fromBackend(created)
  },

  /**
   * 既存レコードを patch する。サーバーは ISO 8601 を要求するため、
   * patch の HH:MM フィールドは `baseRecord` (= 変更前の record) を参照して
   * ISO 8601 化する（特に clockOut は日跨ぎ判定で baseRecord.clockIn が必須）。
   */
  update: async (
    id: number,
    patch: Partial<AttendanceRecord>,
    baseRecord: AttendanceRecord,
  ): Promise<AttendanceRecord> => {
    const body = toBackendPatch(patch, baseRecord)
    const updated = await api.patch<Record<string, unknown>>(`/api/attendance/${id}`, body)
    return fromBackend(updated)
  },
}
