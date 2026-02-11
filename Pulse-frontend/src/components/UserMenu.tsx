import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { User } from '../types'

const getInitials = (user: User) => {
  const source = user.username || user.email
  if (!source) return 'U'

  const parts = source
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return source.slice(0, 2).toUpperCase()
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const getDisplayName = (user: User) => user.username || user.email

export default function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const initials = useMemo(() => (user ? getInitials(user) : ''), [user])
  const displayName = user ? getDisplayName(user) : ''

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target || !menuRef.current) return
      if (!menuRef.current.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [isOpen])

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleSignOut = () => {
    logout()
    setIsOpen(false)
    navigate('/')
  }

  if (!user) return null

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`avatar-button ${isOpen ? 'is-open' : ''}`}
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open user menu"
      >
        <span className="avatar-initials">{initials}</span>
      </button>

      {isOpen && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <span className="user-name">{displayName}</span>
            {user.email && user.username && (
              <span className="user-email">{user.email}</span>
            )}
          </div>
          <Link to="/profile" className="dropdown-item" onClick={handleClose}>
            Profile
          </Link>
          <Link to="/support" className="dropdown-item" onClick={handleClose}>
            Support
          </Link>
          <button className="dropdown-item" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
