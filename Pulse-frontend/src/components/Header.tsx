import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import UserMenu from './UserMenu'

const getNavClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'active' : undefined

export default function Header() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => setIsOpen((prev) => !prev)
  const closeMenu = () => setIsOpen(false)

  const showAuthLinks = !user
  const showConversations = Boolean(user)

  return (
    <header className="app-header">
      <div className="brand">
        <Link to="/" className="brand-link" onClick={closeMenu} aria-label="Pulse home">
          <span className="brand-dot" aria-hidden="true" />
          <span className="sr-only">Pulse</span>
        </Link>
      </div>

      <div className="header-actions">
        <button
          className={`nav-toggle ${isOpen ? 'is-open' : ''}`}
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={isOpen}
          aria-controls="primary-nav"
          onClick={toggleMenu}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="primary-nav" className={`nav ${isOpen ? 'is-open' : ''}`}>
          {showConversations && (
            <NavLink to="/conversations" className={getNavClass} onClick={closeMenu}>
              Conversations
            </NavLink>
          )}
          {showAuthLinks && (
            <NavLink to="/login" className={getNavClass} onClick={closeMenu}>
              Sign in
            </NavLink>
          )}
          {showAuthLinks && (
            <NavLink to="/register" className={getNavClass} onClick={closeMenu}>
              Sign up
            </NavLink>
          )}
        </nav>

        {user && <UserMenu />}
      </div>

      <button
        className={`nav-scrim ${isOpen ? 'is-open' : ''}`}
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={closeMenu}
      />
    </header>
  )
}
