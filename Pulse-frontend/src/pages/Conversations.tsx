import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import axios from 'axios'
import { getConversations } from '../api'
import { useAuth } from '../context/AuthContext'
import type { Conversation, ConversationParticipant, User } from '../types'

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

const getParticipantLabel = (participant: ConversationParticipant) => {
  if (participant.username) return participant.username
  if (participant.email) return participant.email
  if (participant.id !== undefined) return `User ${participant.id}`
  return 'Unknown'
}

const getConversationTitle = (conversation: Conversation, currentUser?: User | null) => {
  if (conversation.name) return conversation.name
  if (conversation.title) return conversation.title
  if (conversation.topic) return conversation.topic

  if (conversation.participants?.length) {
    const names = conversation.participants
      .filter((participant) => (currentUser ? participant.id !== currentUser.id : true))
      .map(getParticipantLabel)
      .filter((label) => label)

    if (names.length > 0) {
      return names.join(', ')
    }
  }

  return `Conversation ${conversation.id}`
}

const getConversationPreview = (conversation: Conversation) => {
  if (!conversation.last_message) return 'No messages yet'
  if (typeof conversation.last_message === 'string') return conversation.last_message
  return conversation.last_message.content ?? conversation.last_message.body ?? 'New update'
}

const getUnreadCount = (conversation: Conversation) => {
  return conversation.unread_count ?? conversation.unreadCount ?? 0
}

export default function Conversations() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const newConversationRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchConversations = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getConversations()
        if (isMounted) {
          setConversations(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(getErrorMessage(err))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchConversations()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)')

    const handleChange = () => {
      setIsCollapsed(media.matches)
    }

    handleChange()
    media.addEventListener('change', handleChange)

    return () => {
      media.removeEventListener('change', handleChange)
    }
  }, [])

  const filteredConversations = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return conversations

    return conversations.filter((conversation) =>
      getConversationTitle(conversation, user).toLowerCase().includes(trimmed),
    )
  }, [conversations, query, user])

  const handleSelectConversation = () => {
    if (window.matchMedia('(max-width: 960px)').matches) {
      setIsCollapsed(true)
    }
  }

  const handleStartConversation = () => {
    const button = newConversationRef.current
    if (!button) return
    button.scrollIntoView({ behavior: 'smooth', block: 'center' })
    button.focus()
  }

  const toggleSidebar = () => {
    setIsCollapsed((prev) => !prev)
  }

  const hasConversations = conversations.length > 0
  const isFiltering = query.trim().length > 0

  return (
    <section className={`chat-shell ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`chat-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-logo" aria-hidden="true" />
            <span className="sidebar-title">Pulse</span>
          </div>
          <div className="sidebar-actions">
            <button
              className="icon-button icon-button--ghost"
              type="button"
              aria-label="Sidebar settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 12h5M15 12h5M9 12a2 2 0 114 0 2 2 0 01-4 0z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="icon-button icon-button--ghost sidebar-toggle"
              type="button"
              aria-label="Toggle sidebar"
              aria-expanded={!isCollapsed}
              onClick={toggleSidebar}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 7h14M5 12h14M5 17h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="sidebar-search">
          <input
            className="form-input chat-input"
            type="search"
            placeholder="Search conversations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search conversations"
          />
        </div>

        {error && <p className="sidebar-error">{error}</p>}
        {isLoading && <p className="sidebar-hint">Loading conversations...</p>}

        {!isLoading && !error && (
          <div>
            {filteredConversations.length === 0 ? (
              <div className="sidebar-empty">

                <p className="sidebar-hint">
                  {isFiltering
                    ? 'No matches in this list.'
                    : 'Your conversation list is empty.'}
                </p>
                {!isFiltering && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleStartConversation}
                  >
                    Create your first chat
                  </button>
                )}
              </div>
            ) : (
              <nav className="conversation-list">
                {filteredConversations.map((conversation) => {
                  const unreadCount = getUnreadCount(conversation)
                  const title = getConversationTitle(conversation, user)
                  const preview = getConversationPreview(conversation)

                  return (
                    <NavLink
                      key={conversation.id}
                      to={`/conversations/${conversation.id}`}
                      className={({ isActive }) =>
                        `conversation-item ${isActive ? 'active' : ''}`
                      }
                      onClick={handleSelectConversation}
                    >
                      {({ isActive }) => (
                        <>
                          <div className="conversation-title">
                            <span>{title}</span>
                            {unreadCount > 0 && !isActive && (
                              <span className="conversation-unread">{unreadCount}</span>
                            )}
                          </div>
                          <span className="conversation-snippet">{preview}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </nav>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <button className="sidebar-new" type="button" ref={newConversationRef}>
            <span className="sidebar-new-icon" aria-hidden="true">
              +
            </span>
            New conversation
          </button>
        </div>
      </aside>

      <div className="chat-main">
        <Outlet context={{ hasConversations, onStartConversation: handleStartConversation }} />
      </div>
    </section>
  )
}



