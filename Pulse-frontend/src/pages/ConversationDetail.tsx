import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
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

type PendingOutgoing = {
  tempId: string
  content: string
  createdAtMs: number
}

type ConversationsOutletContext = {
  onConversationRead?: (conversationId: string | number) => void
  onConversationPreviewUpdate?: (
    conversationId: string | number,
    preview: string,
  ) => void
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
    sender_name?: string
    sender_username?: string
    temp_id?: string
    client_temp_id?: string
    message_id?: string | number
    created_at?: string
    timestamp?: string
    delivered_at?: string | null
    read_at?: string | null
    body?: string
    text?: string
  }

  const senderId = message.senderId ?? fallback.sender_id
  const senderName =
    message.senderName ??
    fallback.sender_name ??
    fallback.sender_username ??
    message.sender?.username
  const tempId = message.tempId ?? fallback.temp_id ?? fallback.client_temp_id
  const messageId = message.id ?? fallback.message_id
  const content = message.content ?? fallback.body ?? fallback.text ?? ''

  return {
    ...message,
    id: messageId,
    tempId,
    content,
    senderId,
    senderName,
    sender:
      message.sender ??
      (senderId !== undefined && senderId !== null
        ? {
            id: senderId,
            ...(senderName ? { username: senderName } : {}),
          }
        : undefined),
    createdAt: message.createdAt ?? fallback.created_at ?? fallback.timestamp,
    deliveredAt: message.deliveredAt ?? fallback.delivered_at ?? null,
    readAt: message.readAt ?? fallback.read_at ?? null,
  }
}

const parseIncomingMessage = (payload: unknown): Message | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const nestedCandidates = [record.message, record.data, record.payload, record.result]

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const messageCandidate = candidate as Record<string, unknown>
    const hasMessageShape =
      'id' in messageCandidate ||
      'message_id' in messageCandidate ||
      'content' in messageCandidate ||
      'body' in messageCandidate ||
      'text' in messageCandidate

    if (hasMessageShape) {
      return messageCandidate as Message
    }
  }

  const hasContent = 'content' in record || 'body' in record || 'text' in record
  const isMessageEnvelope = record.type === 'message' || record.event === 'message'

  if (hasContent || isMessageEnvelope) {
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
  if (message.status === 'sending') {
    return 'Sending...'
  }

  if (message.readAt || message.status === 'read') {
    return 'Seen'
  }

  if (message.deliveredAt || message.status === 'delivered') {
    return 'Delivered'
  }

  return 'Sent'
}

const isNearBottom = (element: HTMLElement, offset = 120) => {
  const { scrollTop, scrollHeight, clientHeight } = element
  return scrollHeight - (scrollTop + clientHeight) <= offset
}

const toIdKey = (value: string | number | null | undefined) => {
  if (value === undefined || value === null) {
    return null
  }

  return String(value)
}

const isTempMessageId = (value: Message['id']) =>
  typeof value === 'string' && value.startsWith('temp-')

const createTempMessageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ConversationDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { onConversationRead, onConversationPreviewUpdate } =
    useOutletContext<ConversationsOutletContext>()
  const currentUserId = user ? String(user.id) : null
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
  const pendingReadReceiptsRef = useRef(new Set<Message['id']>())
  const pendingOutgoingRef = useRef<PendingOutgoing[]>([])
  const typingTimeoutRef = useRef<number | null>(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shouldAutoScrollRef = useRef(true)
  const notifiedMessageIdsRef = useRef(new Set<string>())

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return left - right
    })
  }, [messages])

  const participantNameById = useMemo(() => {
    const map = new Map<string, string>()

    participants.forEach((participant) => {
      const participantRecord = participant as ConversationParticipant & {
        userId?: string | number
        user_id?: string | number
        fullName?: string | null
        user?: {
          id?: string | number
          username?: string
          full_name?: string | null
          fullName?: string | null
          email?: string
        }
      }

      const name =
        participantRecord.username ??
        participantRecord.user?.username ??
        participantRecord.full_name ??
        participantRecord.user?.full_name ??
        participantRecord.fullName ??
        participantRecord.user?.fullName ??
        participantRecord.email ??
        participantRecord.user?.email

      if (!name) {
        return
      }

      const candidateIds = [
        participantRecord.id,
        participantRecord.userId,
        participantRecord.user_id,
        participantRecord.user?.id,
      ]

      candidateIds.forEach((candidateId) => {
        if (candidateId !== undefined && candidateId !== null) {
          map.set(String(candidateId), name)
        }
      })
    })

    return map
  }, [participants])

  const otherParticipantUsername = useMemo(() => {
    if (!currentUserId) {
      return null
    }

    for (const [participantId, participantName] of participantNameById.entries()) {
      if (participantId !== currentUserId) {
        return participantName
      }
    }

    return null
  }, [currentUserId, participantNameById])

  const messageById = useMemo(() => {
    return new Map(messages.map((message) => [message.id, message]))
  }, [messages])

  const unreadIncomingMessageIds = useMemo(() => {
    if (!currentUserId) {
      return [] as Message['id'][]
    }

    return sortedMessages
      .filter((message) => {
        const senderKey = toIdKey(message.senderId ?? message.sender?.id)
        const isOwnMessage = senderKey === currentUserId

        if (isOwnMessage) {
          return false
        }

        return !message.readAt && message.status !== 'read'
      })
      .map((message) => message.id)
  }, [currentUserId, sortedMessages])

  const unreadIncomingCount = unreadIncomingMessageIds.length

  const lastMessagePreview = useMemo(() => {
    for (let index = sortedMessages.length - 1; index >= 0; index -= 1) {
      const content = sortedMessages[index].content?.trim()
      if (content) {
        return content
      }
    }

    return null
  }, [sortedMessages])

  const notifyIncomingMessage = useCallback(
    (incoming: Message) => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return
      }

      if (Notification.permission !== 'granted') {
        return
      }

      if (document.visibilityState === 'visible' && document.hasFocus()) {
        return
      }

      const senderKey = toIdKey(incoming.senderId ?? incoming.sender?.id)
      if (!senderKey || senderKey === currentUserId) {
        return
      }

      const messageIdKey = toIdKey(incoming.id)
      if (messageIdKey && notifiedMessageIdsRef.current.has(messageIdKey)) {
        return
      }

      if (messageIdKey) {
        notifiedMessageIdsRef.current.add(messageIdKey)
      }

      const senderLabel =
        incoming.senderName ??
        incoming.sender?.username ??
        participantNameById.get(senderKey) ??
        'New message'

      const notification = new Notification(senderLabel, {
        body: incoming.content?.trim() || 'You have a new message.',
        tag: `conversation-${id ?? 'unknown'}-${messageIdKey ?? Date.now()}`,
      })

      notification.onclick = () => {
        window.focus()
        notification.close()
      }

      window.setTimeout(() => {
        notification.close()
      }, 6000)
    },
    [currentUserId, id, participantNameById],
  )

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

  const markMessagesAsReadLocally = useCallback((messageIds: Message['id'][]) => {
    if (messageIds.length === 0) {
      return
    }

    const messageIdKeys = new Set(messageIds.map((messageId) => String(messageId)))

    setMessages((prev) =>
      prev.map((message) => {
        if (!messageIdKeys.has(String(message.id))) {
          return message
        }

        return {
          ...message,
          status: 'read',
          readAt: message.readAt ?? new Date().toISOString(),
        }
      }),
    )
  }, [])

  const flushPendingReadReceipts = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    Array.from(pendingReadReceiptsRef.current).forEach((messageId) => {
      if (sentReadReceiptsRef.current.has(messageId)) {
        pendingReadReceiptsRef.current.delete(messageId)
        return
      }

      socketRef.current?.send(
        JSON.stringify({
          type: 'message_read',
          message_id: messageId,
        }),
      )

      sentReadReceiptsRef.current.add(messageId)
      pendingReadReceiptsRef.current.delete(messageId)
    })
  }, [])

  const sendReadReceipt = useCallback(
    (messageId: Message['id']) => {
      if (messageId === undefined || messageId === null) {
        return
      }

      if (sentReadReceiptsRef.current.has(messageId)) {
        return
      }

      pendingReadReceiptsRef.current.add(messageId)
      flushPendingReadReceipts()
    },
    [flushPendingReadReceipts],
  )

  const upsertMessage = useCallback(
    (incoming: Message) => {
      const normalized = normalizeMessage(incoming)
      const normalizedSenderKey = toIdKey(normalized.senderId ?? normalized.sender?.id)
      const normalizedIdKey = toIdKey(normalized.id)
      const incomingCreatedAt = normalized.createdAt
        ? new Date(normalized.createdAt).getTime()
        : Date.now()
      const normalizedContent = normalized.content.trim()

      let resolvedTempId = normalized.tempId ?? null

      if (resolvedTempId) {
        pendingOutgoingRef.current = pendingOutgoingRef.current.filter(
          (pending) => pending.tempId !== resolvedTempId,
        )
      } else if (normalizedContent && currentUserId) {
        const isPotentialOwnMessage =
          normalizedSenderKey === currentUserId || normalizedSenderKey === null

        if (isPotentialOwnMessage) {
          let bestPendingIndex = -1
          let bestDelta = Number.POSITIVE_INFINITY

          pendingOutgoingRef.current.forEach((pending, index) => {
            if (pending.content !== normalizedContent) {
              return
            }

            const delta = Math.abs(pending.createdAtMs - incomingCreatedAt)
            if (delta <= 120000 && delta < bestDelta) {
              bestPendingIndex = index
              bestDelta = delta
            }
          })

          if (bestPendingIndex !== -1) {
            resolvedTempId = pendingOutgoingRef.current[bestPendingIndex].tempId
            pendingOutgoingRef.current.splice(bestPendingIndex, 1)
          }
        }
      }

      setMessages((prev) => {
        const existingIndex = prev.findIndex((message) => {
          const messageIdKey = toIdKey(message.id)
          if (normalizedIdKey && messageIdKey === normalizedIdKey) {
            return true
          }

          if (!resolvedTempId) {
            return false
          }

          return message.tempId === resolvedTempId || messageIdKey === resolvedTempId
        })

        if (existingIndex !== -1) {
          const next = [...prev]
          const current = next[existingIndex]
          next[existingIndex] = {
            ...current,
            ...normalized,
            ...(resolvedTempId ? { tempId: resolvedTempId } : {}),
            status: normalized.status ?? current.status ?? 'sent',
            id: normalizedIdKey ? normalized.id : current.id,
            tempId: resolvedTempId ?? normalized.tempId ?? current.tempId,
          }
          return next
        }

        const isCurrentUserMessage =
          currentUserId !== null &&
          (normalizedSenderKey === currentUserId || resolvedTempId !== null)

        if (isCurrentUserMessage) {
          const optimisticIndex = prev.findIndex((message) => {
            const messageIdKey = toIdKey(message.id)

            if (
              resolvedTempId &&
              (message.tempId === resolvedTempId || messageIdKey === resolvedTempId)
            ) {
              return true
            }

            if (!isTempMessageId(message.id)) {
              return false
            }

            const optimisticSenderKey = toIdKey(message.senderId ?? message.sender?.id)
            if (optimisticSenderKey !== currentUserId) {
              return false
            }

            if (message.content.trim() !== normalizedContent) {
              return false
            }

            const optimisticCreatedAt = message.createdAt
              ? new Date(message.createdAt).getTime()
              : incomingCreatedAt

            return Math.abs(optimisticCreatedAt - incomingCreatedAt) <= 120000
          })

          if (optimisticIndex !== -1) {
            const next = [...prev]
            const current = next[optimisticIndex]
            next[optimisticIndex] = {
              ...current,
              ...normalized,
              ...(resolvedTempId ? { tempId: resolvedTempId } : {}),
              status: normalized.status ?? 'sent',
              id: normalizedIdKey ? normalized.id : current.id,
              tempId: resolvedTempId ?? normalized.tempId ?? current.tempId,
            }
            return next
          }
        }

        if (!normalizedIdKey && normalizedSenderKey && normalizedContent) {
          const duplicateWithoutIdIndex = prev.findIndex((message) => {
            const senderKey = toIdKey(message.senderId ?? message.sender?.id)
            if (senderKey !== normalizedSenderKey) {
              return false
            }

            if (message.content.trim() !== normalizedContent) {
              return false
            }

            const messageCreatedAt = message.createdAt
              ? new Date(message.createdAt).getTime()
              : incomingCreatedAt

            return Math.abs(messageCreatedAt - incomingCreatedAt) <= 3000
          })

          if (duplicateWithoutIdIndex !== -1) {
            const next = [...prev]
            const current = next[duplicateWithoutIdIndex]
            next[duplicateWithoutIdIndex] = {
              ...current,
              ...normalized,
              ...(resolvedTempId ? { tempId: resolvedTempId } : {}),
              status: normalized.status ?? current.status,
              id: normalizedIdKey ? normalized.id : current.id,
              tempId: resolvedTempId ?? normalized.tempId ?? current.tempId,
            }
            return next
          }
        }

        const nextId = normalizedIdKey ? normalized.id : resolvedTempId ?? normalized.id
        if (nextId === undefined || nextId === null) {
          return prev
        }

        return [
          ...prev,
          {
            ...normalized,
            id: nextId,
            tempId: resolvedTempId ?? normalized.tempId,
          },
        ]
      })

      if (id && normalizedContent) {
        onConversationPreviewUpdate?.(id, normalizedContent)
      }
    },
    [currentUserId, id, onConversationPreviewUpdate],
  )

  const applyReceiptUpdate = useCallback((receipt: ReceiptUpdate) => {
    setMessages((prev) => {
      const receiptMessageIdKey = toIdKey(receipt.messageId)
      const index = prev.findIndex(
        (message) => toIdKey(message.id) === receiptMessageIdKey,
      )
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
    sentReadReceiptsRef.current.clear()
    pendingReadReceiptsRef.current.clear()
    pendingOutgoingRef.current = []
    notifiedMessageIdsRef.current.clear()
  }, [id])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return
    }

    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!id || !lastMessagePreview) {
      return
    }

    onConversationPreviewUpdate?.(id, lastMessagePreview)
  }, [id, lastMessagePreview, onConversationPreviewUpdate])

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
      flushPendingReadReceipts()
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
          const normalizedIncoming = normalizeMessage(incoming)
          notifyIncomingMessage(normalizedIncoming)
          upsertMessage(normalizedIncoming)
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
  }, [id, applyReceiptUpdate, flushPendingReadReceipts, handleTypingEvent, notifyIncomingMessage, resetTypingState, upsertMessage])

  useEffect(() => {
    if (!id || !currentUserId) {
      return
    }

    if (unreadIncomingMessageIds.length === 0) {
      onConversationRead?.(id)
      return
    }

    unreadIncomingMessageIds.forEach((messageId) => {
      sendReadReceipt(messageId)
    })

    markMessagesAsReadLocally(unreadIncomingMessageIds)
    onConversationRead?.(id)
  }, [
    currentUserId,
    id,
    markMessagesAsReadLocally,
    onConversationRead,
    sendReadReceipt,
    unreadIncomingMessageIds,
  ])
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
            toIdKey(message.senderId ?? message.sender?.id) === currentUserId
          if (isOwnMessage) return

          if (message.readAt || message.status === 'read') {
            sentReadReceiptsRef.current.add(messageId)
            return
          }

          sendReadReceipt(messageId)
          markMessagesAsReadLocally([messageId])
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
  }, [currentUserId, markMessagesAsReadLocally, messageById, sendReadReceipt, user])

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

    const tempId = createTempMessageId()
    pendingOutgoingRef.current = [
      ...pendingOutgoingRef.current,
      {
        tempId,
        content: trimmed,
        createdAtMs: Date.now(),
      },
    ].slice(-100)

    const optimisticMessage: Message = normalizeMessage({
      id: tempId,
      tempId,
      content: trimmed,
      createdAt: new Date().toISOString(),
      senderId: user?.id,
      senderName: user?.username,
      sender: user
        ? { id: user.id, username: user.username, email: user.email }
        : undefined,
      status: 'sending',
    })

    setMessages((prev) => [...prev, optimisticMessage])

    if (id) {
      onConversationPreviewUpdate?.(id, trimmed)
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'message',
        content: trimmed,
        temp_id: tempId,
        client_temp_id: tempId,
      }),
    )

    setDraft('')
    stopTyping()
  }

  return (
    <section className="chat-thread">
      <div className="chat-topbar">
        <div>
          {otherParticipantUsername && (
            <p className="chat-title">{otherParticipantUsername}</p>
          )}
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
            <h3>
              No messages yet.
              {unreadIncomingCount > 0 && (
                <span className="conversation-unread">{unreadIncomingCount}</span>
              )}
            </h3>
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
            const isMine = senderKey !== null && senderKey === currentUserId
            const senderNameFromParticipants = senderKey ? participantNameById.get(senderKey) : null
            const createdLabel = formatTimestamp(message.createdAt)
            const senderLabel = isMine
              ? user?.username ?? user?.email ?? 'You'
              : message.senderName ??
                message.sender?.username ??
                senderNameFromParticipants ??
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

