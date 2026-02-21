import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { getConversations } from '../api'
import { useAuth } from '../context/AuthContext'
import type { Conversation, ConversationParticipant } from '../types'

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
      if ('message' in data && typeof data.message === 'string') {
        return data.message
      }
    }
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load conversations right now.'
}

const getParticipantName = (participant: ConversationParticipant) => {
  if (participant.full_name) return participant.full_name
  if (participant.username) return participant.username
  if (participant.email) return participant.email
  if (participant.id !== undefined && participant.id !== null) {
    return `User ${participant.id}`
  }
  return 'Unknown'
}

const getConversationName = (conversation: Conversation, currentUserId?: string | null) => {
  if (conversation.name) return conversation.name
  if (conversation.title) return conversation.title
  if (conversation.topic) return conversation.topic

  if (conversation.participants?.length) {
    const others = conversation.participants.filter((participant) => {
      if (!currentUserId || participant.id === undefined || participant.id === null) {
        return true
      }
      return String(participant.id) !== currentUserId
    })

    if (others.length > 0) {
      return others.map(getParticipantName).join(', ')
    }

    return conversation.participants.map(getParticipantName).join(', ')
  }

  return `Conversation ${conversation.id}`
}

const getLastMessageText = (conversation: Conversation) => {
  const record = conversation as Conversation & {
    lastMessage?: string | { content?: string; body?: string; text?: string }
    last_message_content?: string
    last_message_text?: string
  }

  const directPreview =
    record.last_message_content ??
    record.last_message_text ??
    (typeof record.lastMessage === 'string' ? record.lastMessage : undefined)

  if (directPreview && directPreview.trim()) {
    return directPreview
  }

  if (typeof conversation.last_message === 'string') {
    return conversation.last_message
  }

  const objectPreview =
    conversation.last_message?.content ??
    conversation.last_message?.body ??
    (record.lastMessage && typeof record.lastMessage === 'object'
      ? record.lastMessage.content ?? record.lastMessage.body ?? record.lastMessage.text
      : undefined)

  if (objectPreview && objectPreview.trim()) {
    return objectPreview
  }

  return 'No messages yet'
}

const getUnreadCount = (conversation: Conversation) => {
  return conversation.unread_count ?? conversation.unreadCount ?? 0
}

const getConversationSortTime = (conversation: Conversation) => {
  const candidate = conversation.updated_at ?? conversation.created_at
  if (!candidate) return 0
  const time = new Date(candidate).getTime()
  return Number.isNaN(time) ? 0 : time
}

export default function Dashboard() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchRecentConversations = async () => {
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

    void fetchRecentConversations()

    return () => {
      isMounted = false
    }
  }, [])

  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((left, right) => getConversationSortTime(right) - getConversationSortTime(left))
      .slice(0, 12)
  }, [conversations])

  return (
    <section className="page support-page">
      <h1>Dashboard</h1>
      <p>Recent conversations are updated from your latest chat activity.</p>

      <div className="card">
        {isLoading && <p className="sidebar-hint">Loading recent conversations...</p>}
        {error && <p className="form-error">{error}</p>}

        {!isLoading && !error && recentConversations.length === 0 && (
          <p className="sidebar-hint">No recent conversations yet.</p>
        )}

        {!isLoading && !error && recentConversations.length > 0 && (
          <nav className="conversation-list" aria-label="Recent conversations">
            {recentConversations.map((conversation) => {
              const title = getConversationName(conversation, user ? String(user.id) : null)
              const preview = getLastMessageText(conversation)
              const unreadCount = getUnreadCount(conversation)

              return (
                <Link
                  key={conversation.id}
                  to={`/conversations/${conversation.id}`}
                  className="conversation-item"
                >
                  <div className="conversation-title">
                    <span>{title}</span>
                    {unreadCount > 0 && (
                      <span className="conversation-unread">{unreadCount}</span>
                    )}
                  </div>
                  <span className="conversation-snippet">{preview}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </section>
  )
}
