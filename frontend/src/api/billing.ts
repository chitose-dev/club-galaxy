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
  /** 未収管理用の部分更新（owner only）。
   *  受理されるフィールドは uncollectedStatus / uncollectedReason / writtenOffAt / settledOff のみ。 */
  updateRecord: (id: string, patch: Partial<Pick<BillingRecord,
    'uncollectedStatus' | 'uncollectedReason' | 'writtenOffAt' | 'settledOff'
  >>) => api.patch<BillingRecord>(`/api/billing/records/${id}`, patch),
  listDiscounts: (businessDate?: string) => {
    const qs = businessDate ? `?businessDate=${businessDate}` : ''
    return api.get<DiscountLog[]>(`/api/billing/discounts${qs}`)
  },
  createDiscount: (log: DiscountLog) => api.post<DiscountLog>('/api/billing/discounts', log),
  /** 取消（owner only）。voidedAt / voidedBy / voidReason を立てる。
   *  該当営業日が締め済みなら 422 ALREADY_CLOSED、二重 void は 409 ALREADY_VOIDED。 */
  voidRecord: (id: string, reason: string) =>
    api.post<BillingRecord>(`/api/billing/records/${id}/void`, { voidReason: reason }),
}
