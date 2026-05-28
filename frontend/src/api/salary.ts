import { api } from './client'

export interface SalarySelfResponse {
  role: 'owner' | 'staff' | 'cast'
  username: string
  dailyWork?: Array<Record<string, unknown>>
  dailyPayments?: Array<Record<string, unknown>>
  deductions?: Array<Record<string, unknown>>
  attendanceRecords?: Array<Record<string, unknown>>
}

export const salaryApi = {
  getMe: () => api.get<SalarySelfResponse>('/api/salary/me'),
}
