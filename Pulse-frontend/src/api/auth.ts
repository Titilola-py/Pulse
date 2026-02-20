import api from './client'
import type {
  AuthForgotPasswordRequest,
  AuthForgotPasswordResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResetPasswordRequest,
  AuthResetPasswordResponse,
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

export const forgotPassword = async (payload: AuthForgotPasswordRequest) => {
  const response = await api.post<AuthForgotPasswordResponse>('/api/auth/forgot-password', payload)
  return response.data
}

export const resetPassword = async (payload: AuthResetPasswordRequest) => {
  const response = await api.post<AuthResetPasswordResponse>('/api/auth/reset-password', payload)
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
