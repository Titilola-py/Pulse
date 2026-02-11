export type ConversationParticipant = {
  id?: string | number
  username?: string
  full_name?: string | null
  email?: string
}

export type Conversation = {
  id: string | number
  name?: string | null
  title?: string
  topic?: string
  is_group?: boolean
  participants?: ConversationParticipant[]
  created_at?: string
  updated_at?: string
  unread_count?: number
  unreadCount?: number
  last_message?: { content?: string; body?: string } | string
}

export type ConversationCreateRequest = {
  participant_ids: Array<string | number>
  is_group: boolean
  name?: string
  description?: string
}
