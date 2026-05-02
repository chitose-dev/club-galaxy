import { api } from './client'
import type { BillingRecord, DiscountLog } from '../data/mock'

export const billingApi = {
  list: (params?: { businessDate?: string; includeVoided?: boolean; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.businessDate) q.set('businessDate', params.businessDate)
    if (params?.includeVoided) q.set('includeVoided', 'true')
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return api.get<BillingRecord[]>(`/api/billing/records${qs ? `?${qs}` : ''}`)
  },
  create: (record: BillingRecord) => api.post<BillingRecord>('/api/billing/records', record),
  listDiscounts: (businessDate?: string) => {
    const qs = businessDate ? `?businessDate=${businessDate}` : ''
    return api.get<DiscountLog[]>(`/api/billing/discounts${qs}`)
  },
  createDiscount: (log: DiscountLog) => api.post<DiscountLog>('/api/billing/discounts', log),
}
