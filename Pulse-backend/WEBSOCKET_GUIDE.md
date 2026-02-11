# WebSocket Real-Time Chat Implementation

## Overview

This document describes the WebSocket implementation for real-time chat messaging in the Pulse backend. The system supports multiple users per conversation with message broadcasting and persistence.

## Architecture

### Components

1. **ConnectionManager** (`app/websocket/manager.py`)
   - Manages WebSocket connections per conversation
   - Tracks active users and connections
   - Handles message broadcasting to multiple users
   - Cleans up disconnected connections

2. **Chat Service** (`app/services/chat.py`)
   - Handles database operations for conversations and messages
   - Manages message persistence
   - Provides conversation member verification

3. **Chat Routes** (`app/chat/routes.py`)
   - REST API endpoints for conversation and message management
   - WebSocket endpoint for real-time communication
   - JWT token verification for both REST and WebSocket

4. **Models** (`app/models/conversation.py`)
   - `Conversation`: Represents a chat conversation
   - `Message`: Represents individual messages
   - Many-to-many relationship between Users and Conversations

## Database Models

### Conversation

```python
- id: str (UUID primary key)
- name: str (optional, for group conversations)
- description: str (optional)
- is_group: bool (whether it's a group or 1-on-1)
- created_at: datetime
- updated_at: datetime
- users: List[User] (participants)
- messages: List[Message] (conversation history)
```

### Message

```python
- id: str (UUID primary key)
- conversation_id: str (FK to Conversation)
- sender_id: str (FK to User)
- content: str (message text)
- is_edited: bool (whether message was edited)
- created_at: datetime
- updated_at: datetime
- sender: User (relationship to sender)
- conversation: Conversation (relationship to conversation)
```

### conversation_users (Association Table)

- Links users to conversations (many-to-many relationship)

## WebSocket Protocol

### Connection

**Endpoint:** `ws://localhost:8000/api/chat/ws/{conversation_id}?token={jwt_token}`

**Authentication:**

- JWT token passed as query parameter
- Token must contain `sub` (user_id) claim
- User must be a member of the conversation

**Example Connection (JavaScript):**

```javascript
const token = localStorage.getItem("access_token");
const conversationId = "conv-123";
const ws = new WebSocket(
  `ws://localhost:8000/api/chat/ws/${conversationId}?token=${token}`,
);
```

### Message Format

#### Client → Server

**Send Message:**

```json
{
  "type": "message",
  "content": "Hello, world!"
}
```

**Typing Indicator:**

```json
{
  "type": "typing"
}
```

#### Server → Client

**Message Received:**

```json
{
  "type": "message",
  "content": "Hello, world!",
  "sender_id": "user-123",
  "sender_username": "john_doe",
  "message_id": "msg-456",
  "timestamp": "2026-02-04T10:30:00.123456",
  "is_edited": false
}
```

**Typing Indicator:**

```json
{
  "type": "typing",
  "sender_id": "user-123",
  "sender_username": "john_doe"
}
```

**System Message (User Join/Leave):**

```json
{
  "type": "system",
  "content": "User john_doe joined the conversation",
  "sender_id": "user-123",
  "active_users": ["user-123", "user-456"]
}
```

**Error:**

```json
{
  "type": "error",
  "content": "Message content cannot be empty"
}
```

## REST API Endpoints

### Conversations

#### Create Conversation

```
POST /api/chat/conversations
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Team Discussion",
  "description": "Discuss project plans",
  "is_group": true,
  "participant_ids": ["user-123", "user-456"]
}
```

#### List User Conversations

```
GET /api/chat/conversations?limit=50&offset=0
Authorization: Bearer {token}
```

#### Get Conversation Details

```
GET /api/chat/conversations/{conversation_id}
Authorization: Bearer {token}
```

### Messages

#### Get Messages (Paginated)

```
GET /api/chat/conversations/{conversation_id}/messages?limit=50&offset=0
Authorization: Bearer {token}
```

## Features

### 1. Real-Time Broadcasting

- Messages are instantly broadcast to all connected users in a conversation
- Typing indicators are shared with other participants
- User join/leave notifications are sent to active connections

### 2. Message Persistence

- All messages are persisted to the database immediately when sent
- Messages include metadata: sender, timestamp, edit status
- Conversation history is accessible via REST API

### 3. User Management

- Track active users in each conversation
- Multiple connections per user are supported
- Automatic cleanup of disconnected connections

### 4. Authentication & Authorization

- JWT token-based authentication for WebSocket connections
- Verification that users are conversation members
- Secure token passing via query parameter

### 5. Error Handling

- Invalid tokens are rejected before connection
- Non-members cannot access conversations
- Graceful handling of disconnections
- Error messages sent to client for invalid messages

## Connection Manager API

### `async connect(conversation_id, user_id, websocket)`

Register a new WebSocket connection for a user.

### `disconnect(conversation_id, user_id, websocket)`

Remove a WebSocket connection and clean up if necessary.

### `async broadcast(conversation_id, message, exclude_user_id=None)`

Broadcast a message to all active connections in a conversation.

### `get_active_users(conversation_id) → Set[str]`

Get the set of active user IDs in a conversation.

### `get_connection_count(conversation_id) → int`

Get the number of active connections in a conversation.

## Usage Example

### JavaScript Client

```javascript
class ChatClient {
  constructor(conversationId, token) {
    this.conversationId = conversationId;
    this.token = token;
    this.ws = null;
  }

  connect() {
    const url = `ws://localhost:8000/api/chat/ws/${this.conversationId}?token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("Connected to conversation");
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    this.ws.onclose = () => {
      console.log("Disconnected from conversation");
    };
  }

  sendMessage(content) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "message",
          content: content,
        }),
      );
    }
  }

  sendTyping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "typing",
        }),
      );
    }
  }

  handleMessage(message) {
    if (message.type === "message") {
      console.log(`${message.sender_username}: ${message.content}`);
    } else if (message.type === "typing") {
      console.log(`${message.sender_username} is typing...`);
    } else if (message.type === "system") {
      console.log(`[System] ${message.content}`);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage
const client = new ChatClient("conv-123", "your-jwt-token");
client.connect();
client.sendMessage("Hello, everyone!");
```

### Python Client (asyncio + websockets)

```python
import asyncio
import json
import websockets

class ChatClient:
    def __init__(self, conversation_id, token):
        self.conversation_id = conversation_id
        self.token = token
        self.ws = None

    async def connect(self):
        url = f'ws://localhost:8000/api/chat/ws/{self.conversation_id}?token={self.token}'
        async with websockets.connect(url) as ws:
            self.ws = ws
            print('Connected to conversation')

            # Listen for messages
            try:
                async for message in ws:
                    data = json.loads(message)
                    self.handle_message(data)
            except websockets.exceptions.ConnectionClosed:
                print('Disconnected from conversation')

    async def send_message(self, content):
        if self.ws:
            await self.ws.send(json.dumps({
                'type': 'message',
                'content': content
            }))

    def handle_message(self, message):
        if message['type'] == 'message':
            print(f"{message['sender_username']}: {message['content']}")
        elif message['type'] == 'system':
            print(f"[System] {message['content']}")

# Usage
async def main():
    client = ChatClient('conv-123', 'your-jwt-token')
    await client.connect()

asyncio.run(main())
```

## Performance Considerations

1. **Connection Pooling**
   - The application uses async database sessions
   - Each WebSocket connection maintains its own session for message persistence

2. **Message Broadcasting**
   - Broadcast operations are non-blocking (async)
   - Failed sends are logged but don't block other connections
   - Disconnected connections are automatically cleaned up

3. **Memory Management**
   - Conversations with no active connections are removed from memory
   - Connection dictionaries use weak references to allow garbage collection

4. **Scalability**
   - Current implementation is single-instance
   - For multi-instance deployments, consider:
     - Redis pub/sub for cross-instance broadcasting
     - Shared connection state via cache layer
     - Load balancing with sticky sessions or Redis adapter

## Testing

### Test WebSocket Connection

```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://localhost:8000/api/chat/ws/conv-123?token=your_token"
```

### Using WebSocket Testing Tools

- VS Code WebSocket Client extension
- Postman (v8.0+)
- Thunder Client

## Troubleshooting

### Connection Refused

- Check if the server is running
- Verify JWT token is valid
- Ensure conversation_id is correct

### Invalid Token

- Verify token format (must be valid JWT)
- Check token hasn't expired
- Confirm token contains `sub` claim with user_id

### Access Denied

- Verify user is a member of the conversation
- Check user_id in token matches a conversation participant

### Messages Not Persisting

- Verify database connection is active
- Check database tables were created
- Look for errors in server logs

## Future Enhancements

1. **Message Features**
   - Edit/delete messages
   - Message reactions (emojis)
   - Message threading
   - File/media attachments

2. **Presence Features**
   - Read receipts
   - Last seen timestamp
   - Online/offline status

3. **Advanced Features**
   - Encryption at rest and in transit
   - Message search
   - Conversation archiving
   - Message moderation

4. **Performance**
   - Redis caching for active conversations
   - Message queue for high-volume scenarios
   - Connection pooling optimization

## Dependencies

- **FastAPI**: Web framework with WebSocket support
- **SQLAlchemy**: ORM for database operations
- **python-jose**: JWT token handling
- **asyncio**: Async programming

## Configuration

WebSocket settings are inherited from the main app configuration in `app/core/config.py`. Key parameters:

- `SECRET_KEY`: Used for JWT token verification
- `ALGORITHM`: JWT algorithm (default: HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Token expiration time
- `DATABASE_URL`: Database connection string

## License & Support

For issues or questions, refer to the main project documentation.
