import { api } from './client'
import type { DailyReport } from '../data/mock'

export const dailyReportsApi = {
  list: (businessDate?: string) => {
    const qs = businessDate ? `?businessDate=${businessDate}` : ''
    return api.get<DailyReport[]>(`/api/daily-reports${qs}`)
  },
  create: (report: DailyReport) => api.post<DailyReport>('/api/daily-reports', report),
  delete: (businessDate: string) => api.delete<{ deleted: string }>(`/api/daily-reports/${businessDate}`),
  /** レジ締め解除（owner only）。closedAt を null に戻し reopenedAt/By/Reason を記録。
   *  締め後 void が必要な場合の通常フロー（設計書 §6）。 */
  reopen: (businessDate: string, reason: string) =>
    api.post<DailyReport>(`/api/daily-reports/${businessDate}/reopen`, { reopenReason: reason }),
}
