import api from './client'
import type { UserSearchResult } from '../types'

export const searchUsers = async (query: string, limit?: number) => {
  const response = await api.get<UserSearchResult[]>('/api/users/search', {
    params: { q: query, limit },
  })
  return response.data
}
