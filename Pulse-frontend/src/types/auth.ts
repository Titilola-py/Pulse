import type { User } from './user'

export type AuthRegisterRequest = {
  username: string
  email: string
  password: string
  full_name?: string | null
}

export type AuthRegisterResponse = {
  message?: string
}

export type AuthLoginRequest = {
  username: string
  password: string
}

export type AuthLoginResponse = {
  access_token: string
  refresh_token: string
  token_type: string
}

export type AuthMeResponse = User | { user: User }

export type RefreshTokenRequest = {
  refresh_token: string
}

export type RefreshTokenResponse = {
  access_token: string
  refresh_token: string
  token_type: string
}
