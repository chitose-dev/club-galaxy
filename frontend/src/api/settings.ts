import { api } from './client'
import type { StoreSettings } from '../data/mock'

export const settingsApi = {
  get: () => api.get<StoreSettings>('/api/settings'),
  update: (settings: Partial<StoreSettings>) =>
    api.put<StoreSettings>('/api/settings', settings),
}
