export type UserRole = 'user' | 'admin'

export type User = {
  id: string | number
  username: string
  email: string
  full_name?: string | null
  role?: UserRole
}

export type UserSearchResult = {
  id: string | number
  username: string
  full_name?: string | null
}

export type AdminUser = {
  id: string
  username: string
  email: string
  full_name?: string | null
  role: UserRole
  is_active: boolean
  is_online: boolean
  last_seen?: string | null
  created_at: string
  updated_at: string
}
