export type Message = {
  id: string | number
  conversationId?: string | number
  senderId?: string | number
  sender?: {
    id: string | number
    username?: string
    email?: string
  }
  content: string
  createdAt?: string
  deliveredAt?: string | null
  readAt?: string | null
  status?: 'sent' | 'delivered' | 'read' | string
}
