"""
Database base class and common model utilities
"""
from datetime import datetime
from sqlalchemy import Column, DateTime, String, func
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from typing import Optional


Base = declarative_base()


class TimestampMixin:
    """Mixin that adds created_at and updated_at timestamps to models"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
