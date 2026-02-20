import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { loginUser } from '../api'
import { useAuth } from '../context/AuthContext'
import type { AuthLoginRequest } from '../types'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data === 'string') {
      return data
    }
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: string }).message
      if (message) return message
    }
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export default function Login() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [formData, setFormData] = useState<AuthLoginRequest>({
    username: '',
    password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const validate = () => {
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('Username and password are required.')
      return false
    }
    return true
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!validate()) {
      return
    }

    try {
      setIsSubmitting(true)
      const response = await loginUser(formData)
      localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token)
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token)
      const currentUser = await refreshUser()

      if (!currentUser) {
        setError('Unable to load your profile. Please try again.')
        return
      }

      navigate('/conversations')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page auth-page">
      <h1>Sign in</h1>
      <p>Sign in to continue your conversations.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Username</span>
          <input
            className="form-input"
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            autoComplete="username"
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Password</span>
          <input
            className="form-input"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            autoComplete="current-password"
            required
          />
        </label>

        <p className="auth-switch">
          <Link className="auth-switch-link" to="/forgot-password">
            Forgot password?
          </Link>
        </p>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <Link className="auth-switch-link" to="/register">
            Sign up
          </Link>
        </p>
      </form>

      <Link className="support-fab" to="/support" aria-label="Support">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 17l-3.5 3.5V6a2 2 0 012-2h13a2 2 0 012 2v7a2 2 0 01-2 2H7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="13" cy="10" r="1" fill="currentColor" />
          <circle cx="17" cy="10" r="1" fill="currentColor" />
        </svg>
      </Link>
    </section>
  )
}
