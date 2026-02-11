import api from './client'
import type { Conversation, Message } from '../types'

export const getConversations = async () => {
  const response = await api.get<Conversation[]>('/api/chat/conversations')
  return response.data
}

export const getConversationMessages = async (conversationId: string | number) => {
  const response = await api.get<Message[]>(
    `/api/chat/conversations/${conversationId}/messages`,
  )
  return response.data
}
