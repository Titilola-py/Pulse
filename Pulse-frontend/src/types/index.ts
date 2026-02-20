export type ApiError = {
  message: string
  status?: number
}

export type { ApiResponse } from './api'
export type { User, UserSearchResult, AdminUser, UserRole } from './user'
export type { Message } from './message'
export type { Conversation, ConversationParticipant, ConversationCreateRequest } from './conversation'
export type {
  AuthForgotPasswordRequest,
  AuthForgotPasswordResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResetPasswordRequest,
  AuthResetPasswordResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from './auth'
