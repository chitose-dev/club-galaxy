import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { UserAccount } from './data/mock'

const API_BASE = (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL
  ?? 'https://club-galaxy-backend-733762302128.asia-northeast1.run.app'

const AUTH_TOKEN_KEY = 'authToken'
const AUTH_USER_KEY = 'club-galaxy-auth'

interface AuthState {
  user: UserAccount | null
  login: (username: string, pin: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem(AUTH_USER_KEY)
    if (!saved) return null
    try {
      return JSON.parse(saved) as UserAccount
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(AUTH_USER_KEY)
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  }, [user])

  const login = async (username: string, pin: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin }),
      })
      if (!res.ok) return false
      const data = await res.json() as { token: string } & UserAccount
      const { token, ...userInfo } = data
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      setUser(userInfo as UserAccount)
      return true
    } catch {
      return false
    }
  }

  const logout = () => {
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// store.tsx と同じく Provider + Hook 同居の慣用パターン。Fast Refresh より
// caller (11 ファイル) の import 安定を優先するためここで抑制する。
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
