import { api } from './client'
import type { Expense } from '../data/mock'

export const expensesApi = {
  list: (params?: { businessDate?: string; month?: string }) => {
    const q = new URLSearchParams()
    if (params?.businessDate) q.set('businessDate', params.businessDate)
    if (params?.month) q.set('month', params.month)
    const qs = q.toString()
    return api.get<Expense[]>(`/api/expenses${qs ? `?${qs}` : ''}`)
  },
  create: (expense: Expense) => api.post<Expense>('/api/expenses', expense),
  softDelete: (id: number) => api.delete<{ ok: boolean }>(`/api/expenses/${id}`),
}
