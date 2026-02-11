import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { registerUser } from '../api'
import type { AuthRegisterRequest } from '../types'

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

export default function Register() {
  const [formData, setFormData] = useState<AuthRegisterRequest>({
    username: '',
    email: '',
    password: '',
    full_name: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const validate = () => {
    if (
      !formData.username.trim() ||
      !formData.email.trim() ||
      !formData.password.trim() ||
      !formData.full_name.trim()
    ) {
      setError('All fields are required.')
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
      const response = await registerUser(formData)
      setSuccessMessage(response.message ?? 'Account created. You can sign in now.')
      setFormData({ username: '', email: '', password: '', full_name: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page auth-page">
      <h1>Sign up</h1>
      <p>Create your Pulse account and start new conversations.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Full name</span>
          <input
            className="form-input"
            type="text"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            autoComplete="name"
            required
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
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {successMessage && <p className="form-success">{successMessage}</p>}

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

