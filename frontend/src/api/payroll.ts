import { api } from './client'
import type { DailyPayRequest, Deduction } from '../data/mock'

// バック側 DailyWork は { castId, businessDate, ... } を含む集計キャッシュ。
// フロントの DailyWork 型 (data/mock) と shape が一部異なる可能性があるため、
// list 取得時は loose に object[] で受ける。
export const payrollApi = {
  listDailyPayments: (castId?: number) => {
    const qs = castId !== undefined ? `?castId=${castId}` : ''
    return api.get<DailyPayRequest[]>(`/api/payroll/daily-payments${qs}`)
  },
  createDailyPayment: (payment: DailyPayRequest) =>
    api.post<DailyPayRequest>('/api/payroll/daily-payments', payment),
  listDeductions: (castId?: number) => {
    const qs = castId !== undefined ? `?castId=${castId}` : ''
    return api.get<Deduction[]>(`/api/payroll/deductions${qs}`)
  },
  replaceDeductions: (deductions: Deduction[]) =>
    api.put<Deduction[]>('/api/payroll/deductions', deductions),
  getDailyWork: (castId: number) =>
    api.get<Array<Record<string, unknown>>>(`/api/payroll/daily-work/${castId}`),
}
