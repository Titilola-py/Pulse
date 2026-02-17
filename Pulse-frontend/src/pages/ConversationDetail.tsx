import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { getConversationMessages } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  isManualClose,
  markWebSocketManualClose,
  registerWebSocket,
  unregisterWebSocket,
} from '../utils/websocketRegistry'
import type { ConversationParticipant, Message } from '../types'

type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

type ReceiptUpdate = {
  messageId: Message['id']
  status?: Message['status']
  deliveredAt?: Message['deliveredAt']
  readAt?: Message['readAt']
}

type TypingUser = {
  key: string
  name: string
  userId?: Message['senderId']
}

type TypingEvent = {
  kind: 'start' | 'stop'
  key: string
  name: string
  userId?: Message['senderId']
}

const ACCESS_TOKEN_KEY = 'accessToken'

const getWebSocketBaseUrl = () => {
  const envBase = import.meta.env.VITE_WS_BASE_URL
  if (envBase) return envBase.replace(/\/$/, '')
  const apiBase = import.meta.env.VITE_API_BASE_URL
  if (apiBase) return apiBase.replace(/^http/, 'ws').replace(/\/$/, '')
  return 'ws://localhost:8000'
}

const normalizeMessage = (message: Message): Message => {
  const fallback = message as Message & {
    sender_id?: string | number
    created_at?: string
    delivered_at?: string | null
    read_at?: string | null
  }

  return {
    ...message,
    senderId: message.senderId ?? fallback.sender_id,
    createdAt: message.createdAt ?? fallback.created_at,
    deliveredAt: message.deliveredAt ?? fallback.delivered_at ?? null,
    readAt: message.readAt ?? fallback.read_at ?? null,
  }
}

const parseIncomingMessage = (payload: unknown): Message | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  if (record.type === 'message' && 'content' in record) {
    return record as Message
  }

  if ('message' in record && record.message && typeof record.message === 'object') {
    return record.message as Message
  }

  if ('data' in record && record.data && typeof record.data === 'object') {
    return record.data as Message
  }

  if ('content' in record) {
    return record as Message
  }

  return null
}

const parseReceiptUpdate = (payload: unknown): ReceiptUpdate | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const messageId = record.messageId ?? record.message_id ?? record.id
  const hasReadAt = 'readAt' in record || 'read_at' in record
  const hasDeliveredAt = 'deliveredAt' in record || 'delivered_at' in record
  const isReceiptEvent =
    record.type === 'receipt' ||
    record.event === 'receipt' ||
    record.type === 'message_read' ||
    record.event === 'message_read'
  const isReceipt =
    isReceiptEvent ||
    hasReadAt ||
    hasDeliveredAt ||
    record.status === 'read' ||
    record.status === 'delivered'

  if (!isReceipt || messageId === undefined || messageId === null) {
    return null
  }

  return {
    messageId: messageId as Message['id'],
    status: record.status as Message['status'],
    deliveredAt: (record.deliveredAt ?? record.delivered_at) as Message['deliveredAt'],
    readAt: (record.readAt ?? record.read_at) as Message['readAt'],
  }
}

const parseTypingEvent = (payload: unknown): TypingEvent | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const rawType = record.type ?? record.event

  if (rawType !== 'typing_start' && rawType !== 'typing_stop') {
    return null
  }

  const userRecord = (record.user ?? record.sender ?? record.actor) as
    | Record<string, unknown>
    | undefined

  const rawUserId =
    userRecord?.id ??
    userRecord?.userId ??
    userRecord?.user_id ??
    record.userId ??
    record.user_id ??
    record.id

  const username =
    (userRecord?.username as string | undefined) ??
    (record.username as string | undefined)
  const email =
    (userRecord?.email as string | undefined) ??
    (record.email as string | undefined)
  const name = username ?? email ?? (rawUserId ? `User ${rawUserId}` : 'Someone')
  const key =
    rawUserId !== undefined && rawUserId !== null
      ? `id:${rawUserId}`
      : `name:${name}`

  return {
    kind: rawType === 'typing_start' ? 'start' : 'stop',
    key,
    name,
    userId: rawUserId as Message['senderId'] | undefined,
  }
}

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

const formatTimestamp = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const getMessageStatusLabel = (message: Message) => {
  if (message.readAt) {
    return 'Seen'
  }
  if (message.deliveredAt) {
    return 'Delivered'
  }
  return 'Sent'
}

const isNearBottom = (element: HTMLElement, offset = 120) => {
  const { scrollTop, scrollHeight, clientHeight } = element
  return scrollHeight - (scrollTop + clientHeight) <= offset
}

export default function ConversationDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<ConversationParticipant[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting')
  const [draft, setDraft] = useState('')
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const messageElementsRef = useRef(new Map<Message['id'], HTMLLIElement>())
  const elementMessageIdRef = useRef(new WeakMap<Element, Message['id']>())
  const sentReadReceiptsRef = useRef(new Set<Message['id']>())
  const typingTimeoutRef = useRef<number | null>(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shouldAutoScrollRef = useRef(true)

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return left - right
    })
  }, [messages])

  const participantById = useMemo(() => {
    const map = new Map<string, ConversationParticipant>()
    participants.forEach((participant) => {
      if (participant.id !== undefined && participant.id !== null) {
        map.set(String(participant.id), participant)
      }
    })
    return map
  }, [participants])

  const messageById = useMemo(() => {
    return new Map(messages.map((message) => [message.id, message]))
  }, [messages])

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return null
    const names = typingUsers.map((typingUser) => typingUser.name)

    if (names.length === 1) {
      return `${names[0]} is typing...`
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`
    }

    return `${names[0]}, ${names[1]} and ${names.length - 2} others are typing...`
  }, [typingUsers])

  const setMessageRef = useCallback((messageId: Message['id']) => {
    return (node: HTMLLIElement | null) => {
      const map = messageElementsRef.current
      const elementMap = elementMessageIdRef.current
      const existing = map.get(messageId)
      if (existing) {
        elementMap.delete(existing)
      }

      if (node) {
        map.set(messageId, node)
        elementMap.set(node, messageId)
      } else {
        map.delete(messageId)
      }
    }
  }, [])

  const upsertMessage = useCallback((incoming: Message) => {
    const normalized = normalizeMessage(incoming)
    if (normalized.id === undefined || normalized.id === null) {
      setMessages((prev) => [...prev, normalized])
      return
    }

    setMessages((prev) => {
      const index = prev.findIndex((message) => message.id === normalized.id)
      if (index === -1) {
        return [...prev, normalized]
      }
      const next = [...prev]
      next[index] = { ...next[index], ...normalized }
      return next
    })
  }, [])

  const applyReceiptUpdate = useCallback((receipt: ReceiptUpdate) => {
    setMessages((prev) => {
      const index = prev.findIndex((message) => message.id === receipt.messageId)
      if (index === -1) {
        return prev
      }
      const next = [...prev]
      next[index] = {
        ...next[index],
        status: receipt.status ?? next[index].status,
        deliveredAt: receipt.deliveredAt ?? next[index].deliveredAt,
        readAt: receipt.readAt ?? next[index].readAt,
      }
      return next
    })
  }, [])

  const handleTypingEvent = useCallback(
    (event: TypingEvent) => {
      const isSelf =
        user &&
        ((event.userId !== undefined && event.userId === user.id) ||
          event.name === user.username ||
          event.name === user.email)

      if (isSelf) {
        return
      }

      setTypingUsers((prev) => {
        const index = prev.findIndex((typingUser) => typingUser.key === event.key)

        if (event.kind === 'stop') {
          if (index === -1) {
            return prev
          }
          return prev.filter((typingUser) => typingUser.key !== event.key)
        }

        if (index !== -1) {
          const next = [...prev]
          next[index] = { ...next[index], name: event.name, userId: event.userId }
          return next
        }

        return [...prev, { key: event.key, name: event.name, userId: event.userId }]
      })
    },
    [user],
  )

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
  }, [])

  const sendTypingEvent = useCallback((type: 'typing_start' | 'typing_stop') => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false
    }

    socketRef.current.send(JSON.stringify({ type }))
    return true
  }, [])

  const startTyping = useCallback(() => {
    if (isTypingRef.current) {
      return
    }

    const sent = sendTypingEvent('typing_start')
    if (sent) {
      isTypingRef.current = true
    }
  }, [sendTypingEvent])

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      sendTypingEvent('typing_stop')
      isTypingRef.current = false
    }

    clearTypingTimeout()
  }, [clearTypingTimeout, sendTypingEvent])

  const scheduleStopTyping = useCallback(() => {
    clearTypingTimeout()
    typingTimeoutRef.current = window.setTimeout(() => {
      stopTyping()
    }, 3000)
  }, [clearTypingTimeout, stopTyping])

  const resetTypingState = useCallback(() => {
    isTypingRef.current = false
    clearTypingTimeout()
  }, [clearTypingTimeout])

  useEffect(() => {
    if (!id) {
      setError('Conversation ID is missing.')
      return
    }

    let isMounted = true

    const fetchMessages = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getConversationMessages(id)
        if (isMounted) {
          if (Array.isArray(data)) {
            setParticipants([])
            setMessages(data.map(normalizeMessage))
          } else {
            setParticipants(data.participants ?? [])
            setMessages((data.messages ?? []).map(normalizeMessage))
          }
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

    void fetchMessages()

    return () => {
      isMounted = false
    }
  }, [id])

  useEffect(() => {
    if (!id) {
      return
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) {
      setSocketStatus('error')
      return
    }

    setSocketStatus('connecting')

    const wsBaseUrl = getWebSocketBaseUrl()
    const ws = new WebSocket(
      `${wsBaseUrl}/ws/chat/${id}?token=${encodeURIComponent(token)}`,
    )
    socketRef.current = ws
    registerWebSocket(`conversation-${id}`, ws)

    ws.onopen = () => {
      setSocketStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)

        const typingEvent = parseTypingEvent(payload)
        if (typingEvent) {
          handleTypingEvent(typingEvent)
          return
        }

        const receipt = parseReceiptUpdate(payload)
        if (receipt) {
          applyReceiptUpdate(receipt)
          return
        }

        const incoming = parseIncomingMessage(payload)
        if (incoming) {
          upsertMessage(incoming)
        }
      } catch {
        // Ignore malformed payloads
      }
    }

    ws.onerror = () => {
      setSocketStatus('error')
      resetTypingState()
    }

    ws.onclose = () => {
      unregisterWebSocket(`conversation-${id}`)
      setSocketStatus('disconnected')
      resetTypingState()
      if (!isManualClose(ws)) {
        setSocketStatus('disconnected')
      }
    }

    return () => {
      markWebSocketManualClose(ws)
      unregisterWebSocket(`conversation-${id}`)
      ws.close()
    }
  }, [id, applyReceiptUpdate, handleTypingEvent, resetTypingState, upsertMessage])

  useEffect(() => {
    if (!listRef.current || !user) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return

          const messageId = elementMessageIdRef.current.get(entry.target)
          if (messageId === undefined || messageId === null) return
          if (sentReadReceiptsRef.current.has(messageId)) return

          const message = messageById.get(messageId)
          if (!message) return

          const isOwnMessage =
            message.senderId === user.id || message.sender?.id === user.id
          if (isOwnMessage) return

          if (message.readAt || message.status === 'read') {
            sentReadReceiptsRef.current.add(messageId)
            return
          }

          if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            return
          }

          socketRef.current.send(
            JSON.stringify({
              type: 'message_read',
              message_id: messageId,
            }),
          )

          sentReadReceiptsRef.current.add(messageId)
        })
      },
      {
        root: listRef.current,
        threshold: 0.6,
      },
    )

    messageElementsRef.current.forEach((element) => observer.observe(element))

    return () => {
      observer.disconnect()
    }
  }, [messageById, user])

  useEffect(() => {
    const node = listRef.current
    if (!node) return

    shouldAutoScrollRef.current = true

    const handleScroll = () => {
      shouldAutoScrollRef.current = isNearBottom(node)
    }

    node.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      node.removeEventListener('scroll', handleScroll)
    }
  }, [id])

  useEffect(() => {
    const node = listRef.current
    if (!node || !shouldAutoScrollRef.current) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [sortedMessages.length])

  useEffect(() => {
    return () => {
      stopTyping()
    }
  }, [stopTyping])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
    startTyping()
    scheduleStopTyping()
  }

  const handleFocus = () => {
    startTyping()
    scheduleStopTyping()
  }

  const handleBlur = () => {
    stopTyping()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Message connection is not ready yet.')
      return
    }

    setError(null)

    const optimisticMessage: Message = normalizeMessage({
      id: `temp-${Date.now()}`,
      content: trimmed,
      createdAt: new Date().toISOString(),
      senderId: user?.id,
      sender: user
        ? { id: user.id, username: user.username, email: user.email }
        : undefined,
      status: 'sent',
    })

    setMessages((prev) => [...prev, optimisticMessage])

    socketRef.current.send(
      JSON.stringify({
        type: 'message',
        content: trimmed,
      }),
    )

    setDraft('')
    stopTyping()
  }

  return (
    <section className="chat-thread">
      <div className="chat-topbar">
        <div>
          <p className="chat-title">Conversation {id}</p>
          <span className={`chat-status status-${socketStatus}`}>{socketStatus}</span>
        </div>
        <button className="icon-button" type="button" aria-label="Conversation settings">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
        </button>
      </div>

      <div className="chat-scroll" ref={listRef}>
        {isLoading && <p className="chat-hint">Loading messages...</p>}
        {error && <p className="form-error">{error}</p>}
        {!isLoading && !error && sortedMessages.length === 0 && (
          <div className="empty-state empty-state--messages">
            <div className="empty-illustration">
              <span className="empty-bubble empty-bubble--one" />
              <span className="empty-bubble empty-bubble--two" />
              <span className="empty-bubble empty-bubble--three" />
            </div>
            <h3>No messages yet.</h3>
            <p>Say hello to get the conversation started.</p>
            <button
              className="button"
              type="button"
              onClick={() => inputRef.current?.focus()}
            >
              Send your first message
            </button>
          </div>
        )}

        <ul className="message-list">
          {sortedMessages.map((message) => {
            const senderId = message.senderId ?? message.sender?.id
            const senderKey =
              senderId !== undefined && senderId !== null ? String(senderId) : null
            const currentUserId = user ? String(user.id) : null
            const isMine = senderKey !== null && senderKey === currentUserId
            const senderParticipant = senderKey ? participantById.get(senderKey) : undefined
            const createdLabel = formatTimestamp(message.createdAt)
            const senderLabel = isMine
              ? user?.username ?? user?.email ?? 'You'
              : message.sender?.username ??
                senderParticipant?.username ??
                senderParticipant?.full_name ??
                (senderId !== undefined && senderId !== null ? `User ${senderId}` : 'Unknown')
            const statusLabel = isMine ? getMessageStatusLabel(message) : null

            return (
              <li
                key={message.id}
                ref={setMessageRef(message.id)}
                className={`message-item ${isMine ? 'is-own' : ''}`}
              >
                <div className="message-bubble">
                  <div className="message-header">
                    <span className="message-sender">{senderLabel}</span>
                    {createdLabel && (
                      <span className="message-time">{createdLabel}</span>
                    )}
                  </div>
                  <p className="message-content">{message.content}</p>
                  <div className="message-meta">
                    {statusLabel && <span className="message-receipt">{statusLabel}</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {typingLabel && <p className="typing-indicator">{typingLabel}</p>}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <button className="icon-button" type="button" aria-label="Add attachment">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 12.5l7.25-7.25a3 3 0 014.25 4.25l-8.5 8.5a4.5 4.5 0 01-6.36-6.36l8.14-8.14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button className="icon-button" type="button" aria-label="Add emoji">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
            <path
              d="M8.5 14.5c1.1 1 2.3 1.5 3.5 1.5s2.4-.5 3.5-1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <input
          ref={inputRef}
          className="form-input chat-input"
          type="text"
          name="message"
          placeholder="Type your message..."
          value={draft}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label="Message"
        />
        <button className="button" type="submit">
          Send
        </button>
      </form>
    </section>
  )
}





