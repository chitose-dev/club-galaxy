import { api } from './client'
import type { UserAccount, Cast } from '../data/mock'

interface LoginResponse {
  username: string
  role: 'owner' | 'staff' | 'cast'
  displayName: string
  castId?: number
  hourlyRate?: number
  token: string
}

export const authApi = {
  login: (username: string, pin: string) =>
    api.post<LoginResponse>('/api/auth/login', { username, pin }),
  heartbeat: () =>
    api.post<{ ok: boolean; jti: string; username: string; refreshedAt: string }>(
      '/api/auth/heartbeat',
      {},
    ),
  logout: () => api.post<{ ok: boolean }>('/api/auth/logout', {}),
  listUsers: () =>
    api.get<Array<UserAccount & { failedAttempts?: number; lockedUntil?: string | null }>>(
      '/api/auth/users',
    ),
  createUser: (user: {
    username: string
    pin: string
    role: string
    displayName: string
    castId?: number
    hourlyRate?: number
    /** role=cast かつ castId 未指定時：新規キャスト名（同時に casts に作成される） */
    castName?: string
    /** role=cast 新規作成時：保証率 0.0〜1.0 */
    guaranteeRate?: number
  }) =>
    api.post<{ user: UserAccount; cast: Cast | null }>('/api/auth/users', user),
  updateUser: (username: string, patch: Partial<UserAccount> & { pin?: string }) =>
    api.patch<UserAccount>(`/api/auth/users/${username}`, patch),
  deleteUser: (username: string) =>
    api.delete<{ ok: boolean }>(`/api/auth/users/${username}`),
}
