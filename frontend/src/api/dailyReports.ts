import { api } from './client'
import type { DailyReport } from '../data/mock'

export const dailyReportsApi = {
  list: (businessDate?: string) => {
    const qs = businessDate ? `?businessDate=${businessDate}` : ''
    return api.get<DailyReport[]>(`/api/daily-reports${qs}`)
  },
  create: (report: DailyReport) => api.post<DailyReport>('/api/daily-reports', report),
  delete: (businessDate: string) => api.delete<{ deleted: string }>(`/api/daily-reports/${businessDate}`),
}
