import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { getAdminUsers } from '../api'
import type { AdminUser } from '../types'

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load users. Please try again.'
}

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Never'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown'
  }

  return parsedDate.toLocaleString()
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    const loadUsers = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await getAdminUsers()
        if (!isCancelled) {
          setUsers(response)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(getErrorMessage(err))
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isCancelled = true
    }
  }, [])

  const adminCount = useMemo(() => users.filter((user) => user.role === 'admin').length, [users])

  return (
    <section className="page">
      <h1>Admin users</h1>
      <p>Authenticated admins can view all registered users.</p>

      <div className="card admin-users-card">
        <p>
          Total users: <strong>{users.length}</strong> | Admins: <strong>{adminCount}</strong>
        </p>

        {isLoading && <p>Loading users...</p>}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {!isLoading && !error && users.length === 0 && <p>No users found.</p>}

        {!isLoading && !error && users.length > 0 && (
          <div className="admin-users-table-wrapper">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last seen</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.is_active ? 'Active' : 'Disabled'}</td>
                    <td>{formatDateTime(user.last_seen)}</td>
                    <td>{formatDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
