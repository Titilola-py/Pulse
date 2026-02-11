export type ConversationParticipant = {
  id?: string | number
  username?: string
  email?: string
}

export type Conversation = {
  id: string | number
  name?: string
  title?: string
  topic?: string
  participants?: ConversationParticipant[]
  unread_count?: number
  unreadCount?: number
  last_message?: { content?: string; body?: string } | string
}
