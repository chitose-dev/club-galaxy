import { api } from './client'
import type { Cast } from '../data/mock'

export const castsApi = {
  list: () => api.get<Cast[]>('/api/casts'),
  get: (id: number) => api.get<Cast>(`/api/casts/${id}`),
  update: (id: number, patch: Partial<Cast>) =>
    api.patch<Cast>(`/api/casts/${id}`, patch),
  replaceAll: (casts: Cast[]) => api.put<Cast[]>('/api/casts', casts),
}
