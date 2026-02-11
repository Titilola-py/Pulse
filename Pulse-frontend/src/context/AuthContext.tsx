import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getCurrentUser } from '../api'
import { closeAllWebSockets } from '../utils/websocketRegistry'
import type { User } from '../types'

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  refreshUser: () => Promise<User | null>
  setUser: (user: User | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const hasAccessToken = Boolean(localStorage.getItem(ACCESS_TOKEN_KEY))
    const hasRefreshToken = Boolean(localStorage.getItem(REFRESH_TOKEN_KEY))

    if (!hasAccessToken && !hasRefreshToken) {
      setUser(null)
      setIsLoading(false)
      return null
    }

    setIsLoading(true)
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch {
      setUser(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    closeAllWebSockets()
    setUser(null)
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      refreshUser,
      setUser,
      logout,
    }),
    [user, isLoading, refreshUser, setUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export default AuthContext
