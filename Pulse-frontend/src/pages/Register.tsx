import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { registerUser } from '../api'
import type { AuthRegisterRequest } from '../types'

const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must be 8-64 characters and include at least one uppercase letter, one lowercase letter, and one number.'

const passwordRules = [
  '8-64 characters',
  'At least one uppercase letter (A-Z)',
  'At least one lowercase letter (a-z)',
  'At least one number (0-9)',
]

const getErrorMessages = (error: unknown): string[] => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data
    if (status === 404) {
      return [PASSWORD_REQUIREMENTS_MESSAGE]
    }
    if (typeof data === 'string') {
      return [data]
    }
    if (data && typeof data === 'object') {
      if ('detail' in data) {
        const detail = (data as { detail?: unknown }).detail
        if (Array.isArray(detail)) {
          const messages = detail
            .map((item) => {
              if (item && typeof item === 'object' && 'msg' in item) {
                const message = (item as { msg?: string }).msg
                if (typeof message === 'string' && message.trim()) {
                  return message
                }
              }
              return null
            })
            .filter((message): message is string => Boolean(message))
          if (messages.length > 0) {
            return messages
          }
        }
        if (typeof detail === 'string' && detail.trim()) {
          return [detail]
        }
      }
      if ('message' in data) {
        const message = (data as { message?: string }).message
        if (message) return [message]
      }
    }
    return [error.message]
  }

  if (error instanceof Error) {
    return [error.message]
  }

  return ['Something went wrong. Please try again.']
}

export default function Register() {
  const [formData, setFormData] = useState<AuthRegisterRequest>({
    username: '',
    email: '',
    password: '',
    full_name: '',
  })
  const [errors, setErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrors([])
    setSuccessMessage(null)

    try {
      setIsSubmitting(true)
      const payload: AuthRegisterRequest = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        ...(formData.full_name?.trim() ? { full_name: formData.full_name } : {}),
      }
      const response = await registerUser(payload)
      setSuccessMessage(response.message ?? 'Account created. You can sign in now.')
      setFormData({ username: '', email: '', password: '', full_name: '' })
    } catch (err) {
      setErrors(getErrorMessages(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page auth-page">
      <h1>Sign up</h1>
      <p>Create your Pulse account and start new conversations.</p>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
        <label className="form-field">
          <span className="form-label">Full name (optional)</span>
          <input
            className="form-input"
            type="text"
            name="full_name"
            value={formData.full_name ?? ''}
            onChange={handleChange}
            autoComplete="name"
          />
        </label>

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
          <span className="form-label">Email</span>
          <input
            className="form-input"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            autoComplete="email"
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
            autoComplete="new-password"
            aria-describedby="password-help"
            required
          />
          <div id="password-help" className="form-help">
            <span className="form-help-title">Password requirements</span>
            <ul className="form-help-list">
              {passwordRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </label>

        {errors.length > 0 && (
          <div className="form-error" role="alert">
            {errors.length === 1 ? (
              <p className="form-error-text">{errors[0]}</p>
            ) : (
              <ul className="form-error-list">
                {errors.map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {successMessage && (
          <p className="form-success" role="status">
            {successMessage}
          </p>
        )}

        <div className="form-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Sign up'}
          </button>
        </div>
        <p className="auth-switch">
          Already have an account?{' '}
          <Link className="auth-switch-link" to="/login">
            Sign in
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

