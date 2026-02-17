import api from './client'
import type {
  Conversation,
  ConversationParticipant,
  Message,
  ConversationCreateRequest,
} from '../types'

export type ConversationMessagesResponse = {
  participants?: ConversationParticipant[]
  messages?: Message[]
}

export const getConversations = async () => {
  const response = await api.get<Conversation[]>('/api/chat/conversations')
  return response.data
}

export const getConversationMessages = async (conversationId: string | number) => {
  const response = await api.get<Message[] | ConversationMessagesResponse>(
    `/api/chat/conversations/${conversationId}/messages`,
  )
  return response.data
}

export const createConversation = async (payload: ConversationCreateRequest) => {
  const response = await api.post<Conversation>('/api/chat/conversations', payload)
  return response.data
}
