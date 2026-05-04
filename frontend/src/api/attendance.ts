import { api } from './client'
import type { AttendanceRecord } from '../data/mock'

export interface AttendanceListResponse {
  data: AttendanceRecord[]
  nextCursor: string | null
}

export const attendanceApi = {
  list: (params?: { businessDate?: string; staffId?: number; limit?: number; cursor?: string }) => {
    const q = new URLSearchParams()
    if (params?.businessDate) q.set('businessDate', params.businessDate)
    if (params?.staffId !== undefined) q.set('staffId', String(params.staffId))
    if (params?.limit !== undefined) q.set('limit', String(params.limit))
    if (params?.cursor) q.set('cursor', params.cursor)
    const qs = q.toString()
    return api.get<AttendanceListResponse>(`/api/attendance${qs ? `?${qs}` : ''}`)
  },
  create: (record: AttendanceRecord) => api.post<AttendanceRecord>('/api/attendance', record),
  update: (id: number, patch: Partial<AttendanceRecord>) =>
    api.patch<AttendanceRecord>(`/api/attendance/${id}`, patch),
}
