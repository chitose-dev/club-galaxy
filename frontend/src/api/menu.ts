import { api } from './client'
import type {
  GuestMenuItem,
  CastMenuItem,
  SetPrice,
  MenuCategory,
} from '../data/mock'

export const menuApi = {
  listCategories: () => api.get<MenuCategory[]>('/api/menu/categories'),
  replaceCategories: (cats: MenuCategory[]) =>
    api.put<MenuCategory[]>('/api/menu/categories', cats),
  listGuest: () => api.get<GuestMenuItem[]>('/api/menu/guest'),
  replaceGuest: (items: GuestMenuItem[]) =>
    api.put<GuestMenuItem[]>('/api/menu/guest', items),
  listCast: () => api.get<CastMenuItem[]>('/api/menu/cast'),
  replaceCast: (items: CastMenuItem[]) =>
    api.put<CastMenuItem[]>('/api/menu/cast', items),
  listSetPrices: () => api.get<SetPrice[]>('/api/menu/set-prices'),
  replaceSetPrices: (items: SetPrice[]) =>
    api.put<SetPrice[]>('/api/menu/set-prices', items),
  listCharges: () => api.get<SetPrice[]>('/api/menu/charges'),
  replaceCharges: (items: SetPrice[]) =>
    api.put<SetPrice[]>('/api/menu/charges', items),
}
