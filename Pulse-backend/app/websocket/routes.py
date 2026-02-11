"""
WebSocket routes for chat.
"""
import logging
from typing import Optional
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from datetime import datetime
from sqlalchemy import select

from app.core.rate_limiter import (
    rate_limiter,
    WS_EVENT_LIMIT,
    WS_EVENT_WINDOW_SECONDS,
    MESSAGE_EVENT_LIMIT,
    MESSAGE_EVENT_WINDOW_SECONDS,
)
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.chat import MessageCreate
from app.services.chat import ChatService
from app.websocket.manager import manager


router = APIRouter(tags=["websocket"])

logger = logging.getLogger(__name__)


def _extract_token(websocket: WebSocket) -> Optional[str]:
    token = websocket.query_params.get("token")
    if token:
        return token

    auth_header = websocket.headers.get("authorization")
    if not auth_header:
        return None

    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]

    return None


def _get_user_id_from_token(token: str) -> Optional[str]:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None

    return payload.get("sub")


async def _close_policy(websocket: WebSocket, reason: str) -> None:
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=reason)


async def _mark_message_delivered(message_id: str) -> None:
    def _update() -> None:
        db = SessionLocal()
        try:
            ChatService.mark_message_delivered(
                db=db,
                message_id=message_id,
                delivered_at=datetime.utcnow(),
            )
        except Exception as e:
            logger.warning("Failed to mark message delivered: %s", e)
        finally:
            db.close()

    await asyncio.to_thread(_update)


async def _set_user_presence(
    user_id: str,
    is_online: bool,
    last_seen: Optional[datetime] = None
) -> None:
    def _update() -> None:
        db = SessionLocal()
        try:
            user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
            if not user:
                return
            user.is_online = is_online
            if not is_online:
                user.last_seen = last_seen or datetime.utcnow()
            db.add(user)
            db.commit()
        except Exception as e:
            logger.warning("Failed to update user presence: %s", e)
        finally:
            db.close()

    await asyncio.to_thread(_update)


async def _handle_message_read(
    conversation_id: str,
    user_id: str,
    message_id: str
) -> tuple[str, Optional[datetime]]:
    def _update() -> tuple[str, Optional[datetime]]:
        db = SessionLocal()
        try:
            is_member = ChatService.user_in_conversation(
                db=db,
                conversation_id=conversation_id,
                user_id=user_id,
            )
            if not is_member:
                return "forbidden", None
            requested_at = datetime.utcnow()
            message = ChatService.mark_message_read(
                db=db,
                message_id=message_id,
                conversation_id=conversation_id,
                read_at=requested_at,
            )
            if not message:
                return "not_found", None
            return "ok", message.read_at or requested_at
        except Exception as e:
            logger.warning("Failed to mark message read: %s", e)
            return "error", None
        finally:
            db.close()

    return await asyncio.to_thread(_update)


async def _handle_message_delete(
    conversation_id: str,
    user_id: str,
    message_id: str
) -> tuple[str, Optional[dict]]:
    def _update() -> tuple[str, Optional[dict]]:
        db = SessionLocal()
        try:
            is_member = ChatService.user_in_conversation(
                db=db,
                conversation_id=conversation_id,
                user_id=user_id,
            )
            if not is_member:
                return "forbidden", None
            status, message = ChatService.soft_delete_message(
                db=db,
                message_id=message_id,
                requester_id=user_id,
                conversation_id=conversation_id,
            )
            if status != "ok":
                return status, None
            payload = {
                "message_id": message.id,
                "sender_id": message.sender_id,
                "is_deleted": message.is_deleted,
                "content": message.content,
                "updated_at": message.updated_at.isoformat() if message.updated_at else None,
            }
            return "ok", payload
        except Exception as e:
            logger.warning("Failed to delete message: %s", e)
            return "error", None
        finally:
            db.close()

    return await asyncio.to_thread(_update)


@router.websocket("/ws/chat/{conversation_id}")
async def chat_websocket(websocket: WebSocket, conversation_id: str):
    token = _extract_token(websocket)
    if not token:
        await _close_policy(websocket, "Missing authentication token")
        return

    user_id = _get_user_id_from_token(token)
    if not user_id:
        await _close_policy(websocket, "Invalid or expired token")
        return

    db = SessionLocal()
    try:
        is_member = ChatService.user_in_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=user_id,
        )
        if not is_member:
            await _close_policy(websocket, "Not a participant in this conversation")
            return

        user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
        if not user:
            await _close_policy(websocket, "User not found")
            return

        user_username = user.username
    except Exception:
        await websocket.close(
            code=status.WS_1011_SERVER_ERROR,
            reason="Failed to authorize websocket",
        )
        return
    finally:
        db.close()

    previous_connections = manager.get_user_connection_count(user_id)
    await manager.connect(
        conversation_id=conversation_id,
        user_id=user_id,
        websocket=websocket,
    )

    if previous_connections == 0:
        asyncio.create_task(_set_user_presence(user_id=user_id, is_online=True))
        presence_event = {
            "type": "presence",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "username": user_username,
            "status": "online",
        }
        await manager.broadcast_except(
            conversation_id=conversation_id,
            message=presence_event,
            exclude_user_id=user_id,
        )

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({
                    "type": "error",
                    "detail": "Invalid JSON payload",
                })
                continue

            if not isinstance(payload, dict):
                await websocket.send_json({
                    "type": "error",
                    "detail": "Invalid message format",
                })
                continue

            rate_key = f"ws:{user_id}"
            if not rate_limiter.allow(rate_key, WS_EVENT_LIMIT, WS_EVENT_WINDOW_SECONDS):
                await websocket.send_json({
                    "type": "error",
                    "detail": "Rate limit exceeded. Please slow down.",
                })
                continue

            message_type = payload.get("type") or "message"
            if message_type in {"typing_start", "typing_stop"}:
                typing_event = {
                    "type": message_type,
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "sender_username": user_username,
                }
                await manager.broadcast_except(
                    conversation_id=conversation_id,
                    message=typing_event,
                    exclude_user_id=user_id,
                )
                continue

            if message_type == "message_delete":
                message_id = payload.get("message_id") or payload.get("id")
                if not isinstance(message_id, str) or not message_id.strip():
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Message ID is required",
                    })
                    continue

                status, payload_data = await _handle_message_delete(
                    conversation_id=conversation_id,
                    user_id=user_id,
                    message_id=message_id.strip(),
                )

                if status == "forbidden":
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Not authorized to delete this message",
                    })
                    continue

                if status == "not_found":
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Message not found",
                    })
                    continue

                if status != "ok" or payload_data is None:
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Failed to delete message",
                    })
                    continue

                delete_event = {
                    "type": "message_delete",
                    "conversation_id": conversation_id,
                    "deleted_by": user_id,
                    **payload_data,
                }
                await manager.broadcast(
                    conversation_id=conversation_id,
                    message=delete_event,
                )
                continue

            if message_type == "message_read":
                message_id = payload.get("message_id") or payload.get("id")
                if not isinstance(message_id, str) or not message_id.strip():
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Message ID is required",
                    })
                    continue

                status, read_at = await _handle_message_read(
                    conversation_id=conversation_id,
                    user_id=user_id,
                    message_id=message_id.strip(),
                )

                if status == "forbidden":
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Not authorized to read this message",
                    })
                    continue

                if status == "not_found":
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Message not found",
                    })
                    continue

                if status != "ok" or read_at is None:
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Failed to mark message as read",
                    })
                    continue

                receipt = {
                    "type": "message_read",
                    "message_id": message_id.strip(),
                    "conversation_id": conversation_id,
                    "reader_id": user_id,
                    "read_at": read_at.isoformat(),
                }
                await manager.broadcast_except(
                    conversation_id=conversation_id,
                    message=receipt,
                    exclude_user_id=user_id,
                )
                continue

            if message_type == "message":
                msg_key = f"msg:{conversation_id}:{user_id}"
                if not rate_limiter.allow(msg_key, MESSAGE_EVENT_LIMIT, MESSAGE_EVENT_WINDOW_SECONDS):
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Too many messages. Please slow down.",
                    })
                    continue

            content = payload.get("content")
            if not isinstance(content, str) or not content.strip():
                await websocket.send_json({
                    "type": "error",
                    "detail": "Message content is required",
                })
                continue

            message_content = content.strip()

            db = SessionLocal()
            try:
                message = ChatService.create_message(
                    db=db,
                    conversation_id=conversation_id,
                    sender_id=user_id,
                    message_data=MessageCreate(content=message_content),
                )
                response = {
                    "type": "message",
                    "id": message.id,
                    "conversation_id": message.conversation_id,
                    "sender_id": message.sender_id,
                    "sender_username": user_username,
                    "content": message.content,
                    "is_edited": message.is_edited,
                    "is_deleted": message.is_deleted,
                    "timestamp": message.created_at.isoformat(),
                }
                await manager.broadcast(
                    conversation_id=conversation_id,
                    message=response,
                )
                asyncio.create_task(_mark_message_delivered(message.id))
            except Exception:
                await websocket.send_json({
                    "type": "error",
                    "detail": "Failed to send message",
                })
            finally:
                db.close()
    except WebSocketDisconnect:
        manager.disconnect(
            conversation_id=conversation_id,
            user_id=user_id,
            websocket=websocket,
        )
        if manager.get_user_connection_count(user_id) == 0:
            last_seen = datetime.utcnow()
            asyncio.create_task(
                _set_user_presence(user_id=user_id, is_online=False, last_seen=last_seen)
            )
            presence_event = {
                "type": "presence",
                "conversation_id": conversation_id,
                "user_id": user_id,
                "username": user_username,
                "status": "offline",
                "last_seen": last_seen.isoformat(),
            }
            await manager.broadcast_except(
                conversation_id=conversation_id,
                message=presence_event,
                exclude_user_id=user_id,
            )
    except Exception:
        manager.disconnect(
            conversation_id=conversation_id,
            user_id=user_id,
            websocket=websocket,
        )
        if manager.get_user_connection_count(user_id) == 0:
            last_seen = datetime.utcnow()
            asyncio.create_task(
                _set_user_presence(user_id=user_id, is_online=False, last_seen=last_seen)
            )
            presence_event = {
                "type": "presence",
                "conversation_id": conversation_id,
                "user_id": user_id,
                "username": user_username,
                "status": "offline",
                "last_seen": last_seen.isoformat(),
            }
            await manager.broadcast_except(
                conversation_id=conversation_id,
                message=presence_event,
                exclude_user_id=user_id,
            )
