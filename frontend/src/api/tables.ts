import { api } from './client'
import type { Table, OrderItem } from '../data/mock'

export const tablesApi = {
  list: () => api.get<Table[]>('/api/tables'),
  get: (id: number) => api.get<Table>(`/api/tables/${id}`),
  open: (id: number, body: {
    guestCount: number
    setCount: number
    startTime: string
    mainNominationCastNames?: string[]
    isDouhan?: boolean
    isBanaiShimei?: boolean
  }) => api.post<Table>(`/api/tables/${id}/open`, body),
  close: (id: number) => api.post<void>(`/api/tables/${id}/close`, {}),
  update: (id: number, patch: Partial<Table>) =>
    api.patch<Table>(`/api/tables/${id}`, patch),
  addOrder: (tableId: number, order: Omit<OrderItem, 'id'>) =>
    api.post<Table>(`/api/tables/${tableId}/orders`, order),
  removeOrder: (tableId: number, orderId: number) =>
    api.delete<Table>(`/api/tables/${tableId}/orders/${orderId}`),
  /** Fix C: menuItem.id + castName で 1 減算（atomic）。
   *  quantity > 1 なら -1、1 以下なら order 削除。 */
  decrementOrder: (tableId: number, menuItemId: number, castName?: string) =>
    api.post<{ ok: boolean; removedOrderId: number }>(
      `/api/tables/${tableId}/orders/decrement`,
      castName !== undefined ? { menuItemId, castName } : { menuItemId },
    ),
  reorder: (fromIndex: number, toIndex: number) =>
    api.put<void>('/api/tables/reorder', { fromIndex, toIndex }),
  moveCast: (castName: string, fromTableId: number | null, toTableId: number | null) =>
    api.post<void>('/api/tables/move-cast', { castName, fromTableId, toTableId }),
  reset: (id: number) => api.post<void>(`/api/tables/${id}/reset`, {}),
}
