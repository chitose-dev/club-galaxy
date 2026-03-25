import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { dummyAccounts, type UserAccount } from './data/mock'

interface AuthState {
  user: UserAccount | null
  login: (username: string, pin: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const STORAGE_KEY = 'club-galaxy-auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    try {
      const parsed = JSON.parse(saved)
      return dummyAccounts.find((a) => a.username === parsed.username) ?? null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: user.username }))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [user])

  const login = (username: string, pin: string): boolean => {
    const account = dummyAccounts.find((a) => a.username === username && a.pin === pin)
    if (account) {
      setUser(account)
      return true
    }
    return false
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

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
