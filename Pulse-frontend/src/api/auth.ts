import api from './client'
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  User,
} from '../types'

export const registerUser = async (payload: AuthRegisterRequest) => {
  const response = await api.post<AuthRegisterResponse>('/api/auth/register', payload)
  return response.data
}

export const loginUser = async (payload: AuthLoginRequest) => {
  const response = await api.post<AuthLoginResponse>('/api/auth/login', payload)
  return response.data
}

export const getCurrentUser = async () => {
  const response = await api.get<AuthMeResponse>('/api/auth/me')
  const data = response.data

  if (data && typeof data === 'object' && 'user' in data) {
    return (data as { user: User }).user
  }

  return data as User
}
