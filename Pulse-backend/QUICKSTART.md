# Quick Start Guide - WebSocket Chat

## Prerequisites

Ensure these packages are installed (already in requirements.txt):

- FastAPI
- SQLAlchemy
- python-jose
- aioredis (optional, for scaling)

## Starting the Server

```bash
# From the project root directory
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server will:

1. Initialize database tables automatically
2. Start listening on `http://localhost:8000`
3. WebSocket endpoint: `ws://localhost:8000/api/chat/ws/{conversation_id}?token={jwt}`

## Step-by-Step Usage

### 1. Authenticate Users (REST API)

First, you need JWT tokens. Use your login endpoint:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "password123"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### 2. Create a Conversation (REST API)

```bash
curl -X POST http://localhost:8000/api/chat/conversations \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Team Chat",
    "description": "Our team discussion",
    "is_group": true,
    "participant_ids": ["user-id-1", "user-id-2"]
  }'
```

Response:

```json
{
  "id": "conv-123",
  "name": "Team Chat",
  "description": "Our team discussion",
  "is_group": true,
  "created_at": "2026-02-04T10:00:00",
  "updated_at": "2026-02-04T10:00:00"
}
```

### 3. Get Conversation History (REST API)

```bash
curl -X GET 'http://localhost:8000/api/chat/conversations/conv-123/messages' \
  -H "Authorization: Bearer {access_token}"
```

Response:

```json
[
  {
    "id": "msg-1",
    "conversation_id": "conv-123",
    "sender_id": "user-1",
    "content": "Hello everyone!",
    "is_edited": false,
    "created_at": "2026-02-04T10:05:00",
    "updated_at": "2026-02-04T10:05:00"
  }
]
```

### 4. Connect to WebSocket (Real-Time Chat)

**JavaScript/TypeScript:**

```javascript
// Connect
const token = "your-jwt-token-here";
const conversationId = "conv-123";
const ws = new WebSocket(
  `ws://localhost:8000/api/chat/ws/${conversationId}?token=${token}`,
);

// Listen for messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(`${message.sender_username}: ${message.content}`);
};

// Send message
ws.send(
  JSON.stringify({
    type: "message",
    content: "Hello from browser!",
  }),
);

// Show typing indicator
ws.send(
  JSON.stringify({
    type: "typing",
  }),
);

// Disconnect
ws.close();
```

**Python (asyncio):**

```python
import asyncio
import json
import websockets

async def chat():
    token = "your-jwt-token-here"
    conversation_id = "conv-123"
    uri = f"ws://localhost:8000/api/chat/ws/{conversation_id}?token={token}"

    async with websockets.connect(uri) as websocket:
        # Send message
        await websocket.send(json.dumps({
            'type': 'message',
            'content': 'Hello from Python!'
        }))

        # Listen for messages
        async for message in websocket:
            data = json.loads(message)
            if data['type'] == 'message':
                print(f"{data['sender_username']}: {data['content']}")

asyncio.run(chat())
```

**cURL (basic testing):**

```bash
# Using websocat (install: cargo install websocat)
websocat ws://localhost:8000/api/chat/ws/conv-123?token=your-jwt-token
```

Then type and press Enter to send messages:

```
{"type": "message", "content": "Hello!"}
```

## Message Flow Example

### Sender

```json
→ {"type": "message", "content": "Hello everyone!"}
← {"type": "message", "content": "Hello everyone!", "sender_id": "user-1", "sender_username": "alice", "message_id": "msg-456", "timestamp": "2026-02-04T10:30:00.123456", "is_edited": false}
```

### Other Participants (automatically receive)

```json
← {"type": "message", "content": "Hello everyone!", "sender_id": "user-1", "sender_username": "alice", "message_id": "msg-456", "timestamp": "2026-02-04T10:30:00.123456", "is_edited": false}
```

### System Notification (when someone joins)

```json
← {"type": "system", "content": "User alice joined the conversation", "sender_id": "user-1", "active_users": ["user-1", "user-2"]}
```

## Common Issues & Solutions

### Issue: "Invalid token" error

**Solution:**

- Verify token is not expired (check in JWT debugger)
- Ensure token contains `sub` claim with user_id
- Use Bearer token format: `Authorization: Bearer {token}`

### Issue: Connection refused

**Solution:**

- Verify server is running on port 8000
- Check firewall settings
- Ensure correct WebSocket URL format: `ws://` not `http://`

### Issue: "Not a member of this conversation"

**Solution:**

- User ID must be in the conversation's participant list
- Use the correct JWT token for the user
- Check conversation was created with this user as participant

### Issue: Messages not persisting

**Solution:**

- Verify database connection is active
- Check database tables are created (should happen on startup)
- Look at server logs for database errors

## Testing Tools

### Browser Console

```javascript
// Paste directly in browser console for quick testing
const ws = new WebSocket("ws://localhost:8000/api/chat/ws/conv-123?token=...");
ws.onmessage = (e) => console.log(e.data);
ws.send(JSON.stringify({ type: "message", content: "test" }));
```

### VS Code WebSocket Client Extension

1. Install "WebSocket Client" extension
2. Open command palette: `Ctrl+Shift+P`
3. Run: "WebSocket Client: Connect"
4. Enter URL: `ws://localhost:8000/api/chat/ws/conv-123?token=...`

### Postman (v8.0+)

1. New tab → "WebSocket Request"
2. URL: `ws://localhost:8000/api/chat/ws/conv-123?token=...`
3. Click "Connect"
4. Send JSON in message field

### Thunder Client (VS Code)

Similar to Postman, supports WebSocket connections

## API Documentation

Once server is running, visit:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

These provide interactive documentation for all REST endpoints.

## Performance Tips

1. **Connection Limits:** Default connection pool is optimized for ~100 concurrent users
2. **Message Size:** Keep messages under 5KB for optimal performance
3. **Database:** Use PostgreSQL for production (SQLite works for dev)
4. **Scaling:** For >1000 concurrent users, consider Redis pub/sub integration

## Production Checklist

- [ ] Use HTTPS/WSS (SSL certificates)
- [ ] Set strong `SECRET_KEY` in environment
- [ ] Use PostgreSQL instead of SQLite
- [ ] Enable CORS only for your domain
- [ ] Set `DEBUG = False`
- [ ] Configure Redis for distributed deployments
- [ ] Add rate limiting
- [ ] Enable message encryption
- [ ] Set up monitoring/logging
- [ ] Use connection pool with appropriate size

## Extending the Implementation

### Add Message Reactions

```javascript
{
  "type": "reaction",
  "message_id": "msg-456",
  "emoji": "👍"
}
```

### Add Message Editing

```javascript
{
  "type": "edit",
  "message_id": "msg-456",
  "content": "Updated message"
}
```

### Add Message Deletion

```javascript
{
  "type": "delete",
  "message_id": "msg-456"
}
```

### Add Presence

```javascript
{
  "type": "presence",
  "status": "online|away|offline"
}
```

## Architecture

```
User 1          User 2          User 3
   ↓              ↓              ↓
WebSocket ← → ConnectionManager ← → Database
   ↑              ↑              ↑
 Broadcast to all users in conversation
```

## Files Reference

- **[WEBSOCKET_GUIDE.md](WEBSOCKET_GUIDE.md)** - Detailed technical documentation
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was implemented
- **[app/websocket/manager.py](app/websocket/manager.py)** - Connection manager
- **[app/chat/routes.py](app/chat/routes.py)** - WebSocket & REST endpoints
- **[app/services/chat.py](app/services/chat.py)** - Database operations
- **[app/models/conversation.py](app/models/conversation.py)** - Database models

## Support

For issues or questions:

1. Check [WEBSOCKET_GUIDE.md](WEBSOCKET_GUIDE.md) troubleshooting section
2. Review server logs for error messages
3. Use browser console to debug WebSocket messages
4. Check FastAPI docs at `/docs`

---

**Ready to chat!** 🚀
