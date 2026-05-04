import { api } from './client'
import type { AdvancePayment } from '../data/mock'

export const advancesApi = {
  list: (params?: { castId?: number; month?: string }) => {
    const q = new URLSearchParams()
    if (params?.castId !== undefined) q.set('castId', String(params.castId))
    if (params?.month) q.set('month', params.month)
    const qs = q.toString()
    return api.get<AdvancePayment[]>(`/api/advances${qs ? `?${qs}` : ''}`)
  },
  create: (payment: AdvancePayment) => api.post<AdvancePayment>('/api/advances', payment),
  softDelete: (id: number) => api.delete<{ ok: boolean }>(`/api/advances/${id}`),
}
