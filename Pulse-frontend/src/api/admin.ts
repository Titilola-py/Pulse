import api from './client'
import type { AdminUser } from '../types'

export const getAdminUsers = async () => {
  const response = await api.get<AdminUser[]>('/admin/users')
  return response.data
}
