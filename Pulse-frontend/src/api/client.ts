import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { RefreshTokenRequest, RefreshTokenResponse } from '../types'

const API_BASE_URL = 'http://localhost:8000'
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

const applyAccessToken = (config: InternalAxiosRequestConfig, token: string) => {
  config.headers = config.headers ?? {}
  config.headers.Authorization = `Bearer ${token}`
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) {
    applyAccessToken(config, token)
  }
  return config
})

let refreshPromise: Promise<string> | null = null

const refreshAccessToken = async (refreshToken: string) => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<RefreshTokenResponse>(
        `${API_BASE_URL}/api/auth/refresh`,
        { refresh_token: refreshToken } satisfies RefreshTokenRequest,
      )
      .then((response) => {
        const { access_token, refresh_token: newRefreshToken } = response.data
        if (newRefreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken)
        }
        return access_token
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const originalRequest = error.config as RetriableRequestConfig | undefined

    if (status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!refreshToken) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const newAccessToken = await refreshAccessToken(refreshToken)
      localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken)
      applyAccessToken(originalRequest, newAccessToken)
      return api(originalRequest)
    } catch (refreshError) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      return Promise.reject(refreshError)
    }
  },
)

export default api
