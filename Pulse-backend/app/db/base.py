"""
Database base class and common model utilities
"""
from app.db.base_class import Base, TimestampMixin

# Import models to ensure they are registered with SQLAlchemy metadata
from app.models.user import User  # noqa: F401
from app.models.conversation import Conversation, Message  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401

__all__ = ["Base", "TimestampMixin", "User", "Conversation", "Message", "RefreshToken"]
