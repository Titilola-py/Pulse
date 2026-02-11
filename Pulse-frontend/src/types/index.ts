export type ApiError = {
  message: string
  status?: number
}

export type { ApiResponse } from './api'
export type { User } from './user'
export type { Message } from './message'
export type { Conversation, ConversationParticipant } from './conversation'
export type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from './auth'
