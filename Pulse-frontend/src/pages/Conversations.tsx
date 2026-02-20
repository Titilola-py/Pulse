import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { createConversation, getConversations, searchUsers } from '../api'
import { useAuth } from '../context/AuthContext'
import type {
  Conversation,
  ConversationParticipant,
  User,
  UserSearchResult,
} from '../types'

const MIN_GROUP_PARTICIPANTS = 2

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data === 'string') {
      return data
    }
    if (data && typeof data === 'object') {
      if ('detail' in data && typeof data.detail === 'string') {
        return data.detail
      }
      if ('message' in data) {
        const message = (data as { message?: string }).message
        if (message) return message
      }
    }
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

const getParticipantLabel = (participant: ConversationParticipant) => {
  if (participant.full_name) return participant.full_name
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
  const unreadCount = conversation.unread_count ?? conversation.unreadCount ?? 0

  if (!conversation.last_message) {
    return unreadCount > 0
      ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'}`
      : 'No messages yet'
  }

  if (typeof conversation.last_message === 'string') return conversation.last_message
  return conversation.last_message.content ?? conversation.last_message.body ?? 'New update'
}

const getUnreadCount = (conversation: Conversation) => {
  return conversation.unread_count ?? conversation.unreadCount ?? 0
}

const getSearchResultLabel = (user: UserSearchResult) => user.full_name ?? user.username

type ConversationsOutletContext = {
  hasConversations: boolean
  onStartConversation: () => void
  onConversationRead: (conversationId: Conversation['id']) => void
  onConversationPreviewUpdate: (
    conversationId: Conversation['id'],
    preview: string,
  ) => void
}
export default function Conversations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationQuery, setConversationQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [isGroup, setIsGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchRequestIdRef = useRef(0)

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

  useEffect(() => {
    if (isComposerOpen) {
      searchInputRef.current?.focus()
    }
  }, [isComposerOpen])

  useEffect(() => {
    if (!isComposerOpen) return

    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    const handle = window.setTimeout(async () => {
      try {
        setIsSearching(true)
        setSearchError(null)
        const results = await searchUsers(trimmed)
        if (searchRequestIdRef.current !== requestId) return
        const selectedIds = new Set(selectedUsers.map((selected) => selected.id))
        const filtered = results.filter((result) => !selectedIds.has(result.id))
        setSearchResults(filtered)
      } catch (err) {
        if (searchRequestIdRef.current !== requestId) return
        setSearchError(getErrorMessage(err))
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      window.clearTimeout(handle)
    }
  }, [searchQuery, selectedUsers, isComposerOpen])

  const filteredConversations = useMemo(() => {
    const trimmed = conversationQuery.trim().toLowerCase()
    if (!trimmed) return conversations

    return conversations.filter((conversation) =>
      getConversationTitle(conversation, user).toLowerCase().includes(trimmed),
    )
  }, [conversations, conversationQuery, user])

  const handleSelectConversation = () => {
    if (window.matchMedia('(max-width: 960px)').matches) {
      setIsCollapsed(true)
    }
  }

  const openComposer = () => {
    setIsCollapsed(false)
    setIsComposerOpen(true)
  }

  const resetComposer = () => {
    setIsGroup(false)
    setGroupName('')
    setSearchQuery('')
    setSearchResults([])
    setSelectedUsers([])
    setSearchError(null)
    setCreateError(null)
    setIsSearching(false)
    setIsCreating(false)
  }

  const closeComposer = () => {
    setIsComposerOpen(false)
    resetComposer()
  }

  const handleStartConversation = () => {
    openComposer()
  }

  const toggleSidebar = () => {
    setIsCollapsed((prev) => !prev)
  }

  const upsertConversation = (conversation: Conversation) => {
    setConversations((prev) => {
      const index = prev.findIndex((item) => item.id === conversation.id)
      if (index === -1) {
        return [conversation, ...prev]
      }
      const next = [...prev]
      const updated = { ...next[index], ...conversation }
      next.splice(index, 1)
      return [updated, ...next]
    })
  }

  const onConversationRead = useCallback((conversationId: Conversation['id']) => {
    setConversations((prev) =>
      prev.map((conversation) => {
        if (String(conversation.id) !== String(conversationId)) {
          return conversation
        }

        return {
          ...conversation,
          unread_count: 0,
          unreadCount: 0,
        }
      }),
    )
  }, [])

  const onConversationPreviewUpdate = useCallback(
    (conversationId: Conversation['id'], preview: string) => {
      setConversations((prev) => {
        const index = prev.findIndex(
          (conversation) => String(conversation.id) === String(conversationId),
        )

        if (index === -1) {
          return prev
        }

        const next = [...prev]
        const current = next[index]
        const currentLastMessage = current.last_message
        const nextLastMessage =
          typeof currentLastMessage === 'string'
            ? preview
            : {
                ...(currentLastMessage && typeof currentLastMessage === 'object'
                  ? currentLastMessage
                  : {}),
                content: preview,
                body: preview,
              }

        const updated: Conversation = {
          ...current,
          last_message: nextLastMessage,
        }

        next.splice(index, 1)
        return [updated, ...next]
      })
    },
    [],
  )

  const handleCreateConversation = async (
    participants: UserSearchResult[],
    asGroup: boolean,
  ) => {
    if (participants.length === 0) return

    setIsCreating(true)
    setCreateError(null)

    try {
      const payload = {
        participant_ids: participants.map((participant) => participant.id),
        is_group: asGroup,
        ...(asGroup && groupName.trim() ? { name: groupName.trim() } : {}),
      }
      const conversation = await createConversation(payload)
      upsertConversation(conversation)
      closeComposer()
      navigate(`/conversations/${conversation.id}`)
    } catch (err) {
      setCreateError(getErrorMessage(err))
    } finally {
      setIsCreating(false)
    }
  }

  const handleSelectResult = (result: UserSearchResult) => {
    if (!isGroup) {
      void handleCreateConversation([result], false)
      return
    }

    setSelectedUsers((prev) => {
      if (prev.some((selected) => selected.id === result.id)) {
        return prev.filter((selected) => selected.id !== result.id)
      }
      return [...prev, result]
    })
  }

  const handleRemoveSelected = (id: UserSearchResult['id']) => {
    setSelectedUsers((prev) => prev.filter((selected) => selected.id !== id))
  }

  const handleCreateGroup = () => {
    if (selectedUsers.length < MIN_GROUP_PARTICIPANTS) {
      setCreateError('Group chats require at least 2 other participants.')
      return
    }

    void handleCreateConversation(selectedUsers, true)
  }

  const hasConversations = conversations.length > 0
  const isFiltering = conversationQuery.trim().length > 0
  const showEmptyResults =
    isComposerOpen &&
    searchQuery.trim().length > 0 &&
    !isSearching &&
    !searchError &&
    searchResults.length === 0

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
            value={conversationQuery}
            onChange={(event) => setConversationQuery(event.target.value)}
            aria-label="Search conversations"
          />
        </div>

        {isComposerOpen && (
          <div className="sidebar-composer">
            <div className="composer-header">
              <span className="composer-title">Start a conversation</span>
              <button
                className="icon-button icon-button--ghost"
                type="button"
                aria-label="Close composer"
                onClick={closeComposer}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <label className="composer-toggle">
              <span>Group chat</span>
              <input
                type="checkbox"
                checked={isGroup}
                onChange={(event) => {
                  setIsGroup(event.target.checked)
                  setSelectedUsers([])
                  setCreateError(null)
                  if (!event.target.checked) {
                    setGroupName('')
                  }
                }}
                aria-label="Enable group chat"
              />
            </label>

            {isGroup && (
              <label className="form-field">
                <span className="form-label">Group name (optional)</span>
                <input
                  className="form-input"
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Design crew"
                />
              </label>
            )}

            <label className="form-field">
              <span className="form-label">Search users</span>
              <input
                ref={searchInputRef}
                className="form-input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by username"
              />
            </label>

            {!isGroup && (
              <p className="sidebar-hint">Select a user to start a 1:1 chat.</p>
            )}

            {isSearching && <p className="sidebar-hint">Searching...</p>}
            {searchError && <p className="sidebar-error">{searchError}</p>}
            {showEmptyResults && <p className="sidebar-hint">No users found.</p>}

            {searchResults.length > 0 && (
              <div className="search-results" role="listbox">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    className="search-result"
                    type="button"
                    onClick={() => handleSelectResult(result)}
                  >
                    <div>
                      <p className="result-name">{getSearchResultLabel(result)}</p>
                      <p className="result-handle">@{result.username}</p>
                    </div>
                    <span className="result-action">{isGroup ? 'Add' : 'Chat'}</span>
                  </button>
                ))}
              </div>
            )}

            {isGroup && selectedUsers.length > 0 && (
              <div className="selected-users">
                <span className="form-label">Selected ({selectedUsers.length})</span>
                <div className="selected-chips">
                  {selectedUsers.map((selected) => (
                    <button
                      key={selected.id}
                      className="selected-chip"
                      type="button"
                      onClick={() => handleRemoveSelected(selected.id)}
                    >
                      {getSearchResultLabel(selected)}
                    </button>
                  ))}
                </div>
                <p className="sidebar-hint">
                  Select at least {MIN_GROUP_PARTICIPANTS} people to start a group.
                </p>
              </div>
            )}

            {createError && <p className="form-error">{createError}</p>}

            {isGroup && (
              <div className="composer-actions">
                <button
                  className="button"
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={isCreating || selectedUsers.length < MIN_GROUP_PARTICIPANTS}
                >
                  {isCreating ? 'Creating...' : 'Create group'}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={closeComposer}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

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
                      {() => (
                        <>
                          <div className="conversation-title">
                            <span>{title}</span>
                            {unreadCount > 0 && (
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
          <button
            className="sidebar-new"
            type="button"
            onClick={isComposerOpen ? closeComposer : handleStartConversation}
          >
            <span className="sidebar-new-icon" aria-hidden="true">
              +
            </span>
            {isComposerOpen ? 'Close composer' : 'New conversation'}
          </button>
        </div>
      </aside>

      <div className="chat-main">
        <Outlet
          context={{
            hasConversations,
            onStartConversation: handleStartConversation,
            onConversationRead,
            onConversationPreviewUpdate,
          } satisfies ConversationsOutletContext}
        />
      </div>
    </section>
  )
}


