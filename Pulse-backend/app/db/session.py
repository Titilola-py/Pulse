"""
Database session management
"""
import logging
from typing import AsyncGenerator, Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

logger = logging.getLogger(__name__)


# Database URL (can be overridden via DATABASE_URL env var)
DATABASE_URL = settings.database_url


def _to_sync_database_url(db_url: str) -> str:
    """Convert configured DB URL to a sync SQLAlchemy URL."""
    if "sqlite+aiosqlite" in db_url:
        return db_url.replace("sqlite+aiosqlite", "sqlite")
    if "postgresql+asyncpg" in db_url:
        return db_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    if "postgres+asyncpg" in db_url:
        return db_url.replace("postgres+asyncpg", "postgresql+psycopg2")
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if db_url.startswith("postgresql://"):
        return db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return db_url


def _to_async_database_url(db_url: str) -> str:
    """Convert configured DB URL to an async SQLAlchemy URL."""
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    if db_url.startswith("postgresql://"):
        return db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "postgresql+psycopg2" in db_url:
        return db_url.replace("postgresql+psycopg2", "postgresql+asyncpg")
    if db_url.startswith("sqlite:///") and "sqlite+aiosqlite" not in db_url:
        return db_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    if db_url.startswith("sqlite://") and "sqlite+aiosqlite" not in db_url:
        return db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return db_url


def _get_sync_engine_config(db_url: str) -> dict:
    """Get sync engine configuration based on settings and database type."""
    if "sqlite" in db_url:
        return {"poolclass": NullPool, "connect_args": {"check_same_thread": False}}

    config = {
        "pool_size": settings.database_pool_size,
        "max_overflow": settings.database_max_overflow,
        "pool_recycle": settings.database_pool_recycle,
        "pool_pre_ping": settings.database_pool_pre_ping,
    }

    if settings.debug:
        config = {"poolclass": NullPool}

    return config


def _get_async_engine_config(db_url: str) -> dict:
    """Get async engine configuration based on settings and database type."""
    if "sqlite" in db_url:
        return {"poolclass": NullPool}

    config = {
        "pool_size": settings.database_pool_size,
        "max_overflow": settings.database_max_overflow,
        "pool_recycle": settings.database_pool_recycle,
        "pool_pre_ping": settings.database_pool_pre_ping,
    }

    if settings.debug:
        config = {"poolclass": NullPool}

    return config


# Database URLs used across the project
sync_db_url = _to_sync_database_url(DATABASE_URL)
async_db_url = _to_async_database_url(DATABASE_URL)

# Create sync engine/session factory
engine = create_engine(
    sync_db_url,
    echo=settings.database_echo,
    **_get_sync_engine_config(sync_db_url),
)
SessionLocal = sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Create async engine/session factory
async_engine = create_async_engine(
    async_db_url,
    echo=settings.database_echo,
    **_get_async_engine_config(async_db_url),
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def ensure_user_presence_columns() -> None:
    # Ensure presence columns exist on users table
    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("users")}
        missing = []
        if "is_online" not in existing:
            missing.append("is_online")
        if "last_seen" not in existing:
            missing.append("last_seen")
        if not missing:
            return

        with engine.begin() as conn:
            for column in missing:
                if column == "is_online":
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT 0"))
                else:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {column} TIMESTAMP"))
        logger.info("Database updated: added columns to users: %s", ", ".join(missing))
    except Exception as exc:
        logger.warning("Failed to ensure user presence columns: %s", exc)


def ensure_message_lifecycle_columns() -> None:
    # Ensure message lifecycle columns exist on messages table
    try:
        inspector = inspect(engine)
        if "messages" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("messages")}
        missing = []
        if "delivered_at" not in existing:
            missing.append("delivered_at")
        if "read_at" not in existing:
            missing.append("read_at")
        if "is_deleted" not in existing:
            missing.append("is_deleted")
        if not missing:
            return

        with engine.begin() as conn:
            for column in missing:
                if column == "is_deleted":
                    conn.execute(text("ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                else:
                    conn.execute(text(f"ALTER TABLE messages ADD COLUMN {column} TIMESTAMP"))
        logger.info("Database updated: added columns to messages: %s", ", ".join(missing))
    except Exception as exc:
        logger.warning("Failed to ensure message lifecycle columns: %s", exc)


def ensure_password_reset_columns() -> None:
    # Ensure password reset columns exist on users table
    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return

        existing_columns = {col["name"] for col in inspector.get_columns("users")}
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}

        with engine.begin() as conn:
            if "reset_token" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token VARCHAR(64)"))
            if "reset_token_expiry" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP"))
            if "ix_users_reset_token" not in existing_indexes:
                conn.execute(text("CREATE INDEX ix_users_reset_token ON users (reset_token)"))
    except Exception as exc:
        logger.warning("Failed to ensure password reset columns: %s", exc)


def get_db() -> Generator[Session, None, None]:
    """Dependency for getting a sync database session."""
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def init_db() -> None:
    """Initialize database tables and required columns."""
    try:
        from app.db.base import Base

        Base.metadata.create_all(bind=engine)
        ensure_user_presence_columns()
        ensure_message_lifecycle_columns()
        ensure_password_reset_columns()
    except Exception as exc:
        logger.error("Database initialization error: %s", exc)


def close_db() -> None:
    """Close database connection pools."""
    try:
        engine.dispose()
        async_engine.sync_engine.dispose()
    except Exception as exc:
        logger.error("Error closing database: %s", exc)
