import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { resetPassword } from '../api'
import type { AuthResetPasswordRequest } from '../types'

type ResetPasswordFormData = {
  newPassword: string
  confirmPassword: string
}

const TOKEN_ERROR_MESSAGE = 'Reset token is missing or invalid.'
const SUCCESS_MESSAGE = 'Password reset successful. Redirecting to sign in...'

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data

    if (typeof data === 'string' && data.trim()) {
      return data
    }

    if (data && typeof data === 'object') {
      if ('detail' in data) {
        const detail = (data as { detail?: unknown }).detail

        if (typeof detail === 'string' && detail.trim()) {
          return detail
        }

        if (Array.isArray(detail)) {
          const message = detail
            .map((item) => {
              if (item && typeof item === 'object' && 'msg' in item) {
                return (item as { msg?: string }).msg
              }
              return null
            })
            .find((item): item is string => typeof item === 'string' && item.trim().length > 0)

          if (message) {
            return message
          }
        }
      }

      if ('message' in data) {
        const message = (data as { message?: string }).message
        if (message) {
          return message
        }
      }
    }

    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const tokenError = token ? null : TOKEN_ERROR_MESSAGE

  const [formData, setFormData] = useState<ResetPasswordFormData>({
    newPassword: '',
    confirmPassword: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!successMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      navigate('/login')
    }, 1500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [successMessage, navigate])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const validate = () => {
    if (tokenError) {
      return false
    }

    if (!formData.newPassword.trim() || !formData.confirmPassword.trim()) {
      setError('New password and confirm password are required.')
      return false
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return false
    }

    return true
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (!validate()) {
      return
    }

    try {
      setIsSubmitting(true)
      const payload: AuthResetPasswordRequest = {
        token,
        new_password: formData.newPassword,
      }

      await resetPassword(payload)
      setSuccessMessage(SUCCESS_MESSAGE)
      setFormData({ newPassword: '', confirmPassword: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDisabled = Boolean(tokenError) || isSubmitting || Boolean(successMessage)

  return (
    <section className="page auth-page">
      <h1>Reset password</h1>
      <p>Choose a new password for your account.</p>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
        {tokenError && (
          <p className="form-error" role="alert">
            {tokenError}
          </p>
        )}

        <label className="form-field">
          <span className="form-label">New password</span>
          <input
            className="form-input"
            type="password"
            name="newPassword"
            value={formData.newPassword}
            onChange={handleChange}
            autoComplete="new-password"
            disabled={isDisabled}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Confirm password</span>
          <input
            className="form-input"
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            autoComplete="new-password"
            disabled={isDisabled}
            required
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="form-success" role="status">
            {successMessage}
          </p>
        )}

        <div className="form-actions">
          <button className="button" type="submit" disabled={isDisabled}>
            {isSubmitting ? 'Resetting...' : 'Reset password'}
          </button>
        </div>

        <p className="auth-switch">
          Need a new link?{' '}
          <Link className="auth-switch-link" to="/forgot-password">
            Request password reset
          </Link>
        </p>

        <p className="auth-switch">
          Back to{' '}
          <Link className="auth-switch-link" to="/login">
            Sign in
          </Link>
        </p>
      </form>
    </section>
  )
}
