"""
Conversation and Message models for chat functionality
"""
from sqlalchemy import Column, String, ForeignKey, Text, Table, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from datetime import datetime
from uuid import uuid4
from app.db.base_class import Base, TimestampMixin


# Association table for many-to-many relationship between users and conversations
conversation_users = Table(
    'conversation_users',
    Base.metadata,
    Column('conversation_id', String(36), ForeignKey('conversations.id')),
    Column('user_id', String(36), ForeignKey('users.id'))
)


class Conversation(Base, TimestampMixin):
    """Conversation model for grouping messages between users"""
    __tablename__ = "conversations"
    
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
        nullable=False
    )
    name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )
    is_group: Mapped[bool] = mapped_column(
        default=False,
        nullable=False
    )
    
    # Relationships
    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        secondary=conversation_users,
        back_populates="conversations"
    )


class Message(Base, TimestampMixin):
    """Message model for storing chat messages"""
    __tablename__ = "messages"
    
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
        nullable=False
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('conversations.id'),
        nullable=False,
        index=True
    )
    sender_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('users.id'),
        nullable=False
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )
    is_edited: Mapped[bool] = mapped_column(
        default=False,
        nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(
        default=False,
        nullable=False
    )
    
    # Relationships
    conversation: Mapped["Conversation"] = relationship(
        "Conversation",
        back_populates="messages"
    )
    sender: Mapped["User"] = relationship(
        "User",
        foreign_keys=[sender_id]
    )
