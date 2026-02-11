"""
Pydantic schemas for chat/message operations
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from enum import Enum


class MessageCreate(BaseModel):
    """Schema for creating a message"""
    content: str = Field(..., min_length=1, max_length=5000)


class MessageResponse(BaseModel):
    """Schema for message response"""
    id: str
    conversation_id: str
    sender_id: str
    content: str
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    """Schema for creating a conversation"""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    is_group: bool = False
    participant_ids: List[str] = Field(..., min_items=1)


class ConversationUpdate(BaseModel):
    """Schema for updating a conversation"""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


class ConversationResponse(BaseModel):
    """Schema for conversation response"""
    id: str
    name: Optional[str]
    description: Optional[str]
    is_group: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ConversationDetailResponse(ConversationResponse):
    """Schema for detailed conversation response with messages"""
    messages: List[MessageResponse] = []


class WebSocketMessage(BaseModel):
    """Schema for WebSocket message"""
    type: str  # "message", "typing", "system"
    content: Optional[str] = None
    sender_id: Optional[str] = None
    sender_username: Optional[str] = None
    message_id: Optional[str] = None
    timestamp: Optional[datetime] = None


class WebSocketMessageResponse(BaseModel):
    """Schema for WebSocket message response"""
    type: str
    content: Optional[str] = None
    sender_id: Optional[str] = None
    sender_username: Optional[str] = None
    message_id: Optional[str] = None
    timestamp: datetime
    is_edited: bool = False
