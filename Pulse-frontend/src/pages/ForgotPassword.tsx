import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { forgotPassword } from '../api'
import type { AuthForgotPasswordRequest } from '../types'

const SUCCESS_MESSAGE = 'If the email exists, a reset link has been sent.'

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

export default function ForgotPassword() {
  const [formData, setFormData] = useState<AuthForgotPasswordRequest>({
    email: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const email = formData.email.trim()

    if (!email) {
      setError('Email is required.')
      return
    }

    try {
      setIsSubmitting(true)
      await forgotPassword({ email })
      setSuccessMessage(SUCCESS_MESSAGE)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page auth-page">
      <h1>Forgot password</h1>
      <p>Enter your email to receive a reset link.</p>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
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
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send reset link'}
          </button>
        </div>

        <p className="auth-switch">
          Remembered your password?{' '}
          <Link className="auth-switch-link" to="/login">
            Sign in
          </Link>
        </p>
      </form>
    </section>
  )
}
