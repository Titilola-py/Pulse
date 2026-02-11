import { useOutletContext } from 'react-router-dom'

type ConversationsOutletContext = {
  hasConversations: boolean
  onStartConversation: () => void
}

export default function ConversationsEmpty() {
  const { hasConversations, onStartConversation } =
    useOutletContext<ConversationsOutletContext>()

  const title = hasConversations
    ? 'Select a conversation'
    : 'No conversations yet. Start one.'
  const body = hasConversations
    ? 'Choose a thread from the left to keep the conversation moving.'
    : 'Create your first conversation and your messages will appear here.'
  const ctaLabel = hasConversations ? 'Browse conversations' : 'Start a conversation'

  return (
    <div className="chat-empty">
      <div className="empty-state">
        <div className="empty-illustration">
          <span className="empty-bubble empty-bubble--one" />
          <span className="empty-bubble empty-bubble--two" />
          <span className="empty-bubble empty-bubble--three" />
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        <button className="button" type="button" onClick={onStartConversation}>
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
