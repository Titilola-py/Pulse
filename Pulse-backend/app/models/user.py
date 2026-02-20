"""
User model for authentication and user management
"""
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin


class User(Base, TimestampMixin):
    """User model"""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
        nullable=False,
    )
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    full_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        default="user",
        nullable=False,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    reset_token: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )
    reset_token_expiry: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    is_online: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    last_seen: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )
    is_superuser: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # Relationships
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation",
        secondary="conversation_users",
        back_populates="users",
    )

    # Indexes and constraints for common queries and role safety
    __table_args__ = (
        Index("ix_users_username", "username"),
        Index("ix_users_email", "email"),
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username}, email={self.email}, role={self.role})>"
