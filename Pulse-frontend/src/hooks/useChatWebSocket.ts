import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  isManualClose,
  markWebSocketManualClose,
  registerWebSocket,
  unregisterWebSocket,
} from '../utils/websocketRegistry'

export type ChatIncomingEvent = {
  type?: string
  [key: string]: unknown
}

export type ChatMessageEvent = {
  type: 'message'
  content: string
  id?: number | string
  [key: string]: unknown
}

export type ChatReadReceiptEvent = {
  type: 'message_read'
  message_id: number
  [key: string]: unknown
}

export type ChatMessageHandler = (event: ChatIncomingEvent) => void

type UseChatWebSocketParams = {
  conversationId: string | number
  token: string
  onMessage: ChatMessageHandler
}

type UseChatWebSocketReturn = {
  sendMessage: (content: string) => boolean
  sendReadReceipt: (messageId: number) => boolean
}

const buildWebSocketUrl = (conversationId: string | number, token: string) => {
  const encodedToken = encodeURIComponent(token)
  return `ws://localhost:8000/ws/chat/${conversationId}?token=${encodedToken}`
}

export const useChatWebSocket = ({
  conversationId,
  token,
  onMessage,
}: UseChatWebSocketParams): UseChatWebSocketReturn => {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  const connectionKey = useMemo(
    () => `chat-${conversationId}-${Math.random().toString(36).slice(2, 8)}`,
    [conversationId],
  )

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) {
      return
    }

    clearReconnectTimeout()

    const attempt = reconnectAttemptRef.current
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    reconnectAttemptRef.current += 1

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connect()
    }, delay)
  }, [clearReconnectTimeout])

  const connect = useCallback(() => {
    if (!conversationId || !token) {
      return
    }

    const url = buildWebSocketUrl(conversationId, token)
    const socket = new WebSocket(url)
    socketRef.current = socket
    registerWebSocket(connectionKey, socket)

    socket.onopen = () => {
      reconnectAttemptRef.current = 0
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChatIncomingEvent
        onMessageRef.current(data)
      } catch (error) {
        console.error('WebSocket message parse error', error)
      }
    }

    socket.onerror = (event) => {
      console.error('WebSocket error', event)
    }

    socket.onclose = () => {
      unregisterWebSocket(connectionKey)
      if (isManualClose(socket)) {
        return
      }
      scheduleReconnect()
    }
  }, [conversationId, token, scheduleReconnect, connectionKey])

  useEffect(() => {
    shouldReconnectRef.current = true
    connect()

    return () => {
      shouldReconnectRef.current = false
      clearReconnectTimeout()
      if (socketRef.current) {
        markWebSocketManualClose(socketRef.current)
        socketRef.current.close()
        socketRef.current = null
      }
      unregisterWebSocket(connectionKey)
    }
  }, [connect, clearReconnectTimeout, connectionKey])

  const sendMessage = useCallback((content: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'message',
        content,
      } satisfies ChatMessageEvent),
    )

    return true
  }, [])

  const sendReadReceipt = useCallback((messageId: number) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'message_read',
        message_id: messageId,
      } satisfies ChatReadReceiptEvent),
    )

    return true
  }, [])

  return { sendMessage, sendReadReceipt }
}

export default useChatWebSocket
