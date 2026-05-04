import { api } from './client'
import type { Cast } from '../data/mock'

export const castsApi = {
  list: () => api.get<Cast[]>('/api/casts'),
  get: (id: number) => api.get<Cast>(`/api/casts/${id}`),
  /** 新規キャスト作成 (id は backend で採番)。owner only。 */
  create: (input: {
    name: string
    hourlyRate: number
    guaranteeRate: number
    realName?: string
    address?: string
    backRates?: Cast['backRates']
    active?: boolean
  }) => api.post<Cast>('/api/casts', input),
  update: (id: number, patch: Partial<Cast>) =>
    api.patch<Cast>(`/api/casts/${id}`, patch),
  replaceAll: (casts: Cast[]) => api.put<Cast[]>('/api/casts', casts),
}
