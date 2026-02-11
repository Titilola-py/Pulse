"""
WebSocket connection manager for chat conversations.
"""
from typing import Dict, Set, Optional
from fastapi import WebSocket


class ConnectionManager:
    """
    Manage WebSocket connections grouped by conversation and user.
    """

    def __init__(self):
        # Dict[conversation_id] -> Dict[user_id] -> Set[WebSocket connections]
        self.active_connections: Dict[str, Dict[str, Set[WebSocket]]] = {}

    async def connect(self, conversation_id: str, user_id: str, websocket: WebSocket) -> None:
        """
        Accept and register a WebSocket connection for a user in a conversation.
        """
        await websocket.accept()

        conversation = self.active_connections.setdefault(conversation_id, {})
        user_connections = conversation.setdefault(user_id, set())
        user_connections.add(websocket)

    def disconnect(self, conversation_id: str, user_id: str, websocket: WebSocket) -> None:
        """
        Remove a WebSocket connection and clean up empty groups.
        """
        conversation = self.active_connections.get(conversation_id)
        if not conversation:
            return

        user_connections = conversation.get(user_id)
        if not user_connections:
            return

        if websocket in user_connections:
            user_connections.remove(websocket)

        if not user_connections:
            conversation.pop(user_id, None)

        if not conversation:
            self.active_connections.pop(conversation_id, None)

    def get_user_connection_count(self, user_id: str) -> int:
        """
        Get the number of active WebSocket connections for a user across all conversations.
        """
        count = 0
        for conversation in self.active_connections.values():
            connections = conversation.get(user_id)
            if connections:
                count += len(connections)
        return count

    async def broadcast(self, conversation_id: str, message: dict) -> None:
        """
        Broadcast a message to all connections in a conversation.
        """
        conversation = self.active_connections.get(conversation_id)
        if not conversation:
            return

        disconnected = []
        for user_id, connections in conversation.items():
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append((user_id, connection))

        for user_id, connection in disconnected:
            self.disconnect(conversation_id, user_id, connection)

    async def broadcast_except(
        self,
        conversation_id: str,
        message: dict,
        exclude_user_id: Optional[str] = None
    ) -> None:
        """
        Broadcast a message to all connections in a conversation except a user.
        """
        conversation = self.active_connections.get(conversation_id)
        if not conversation:
            return

        disconnected = []
        for user_id, connections in conversation.items():
            if exclude_user_id and user_id == exclude_user_id:
                continue
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append((user_id, connection))

        for user_id, connection in disconnected:
            self.disconnect(conversation_id, user_id, connection)


# Global instance of the connection manager
manager = ConnectionManager()
