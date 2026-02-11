"""
Database session management
"""
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool
from app.core.config import settings

logger = logging.getLogger(__name__)


# Database URL (can be overridden via DATABASE_URL env var)
DATABASE_URL = settings.database_url


def get_engine_config():
    """Get engine configuration based on settings"""
    db_url = DATABASE_URL
    
    # Convert async database URLs to sync equivalents
    if "sqlite+aiosqlite" in db_url:
        db_url = db_url.replace("sqlite+aiosqlite", "sqlite")
    
    # For SQLite, use NullPool to avoid connection pool issues
    if "sqlite" in db_url:
        return {"poolclass": NullPool, "connect_args": {"check_same_thread": False}}
    
    # For PostgreSQL
    pool_config = {
        "pool_size": settings.database_pool_size,
        "max_overflow": settings.database_max_overflow,
        "pool_recycle": settings.database_pool_recycle,
        "pool_pre_ping": settings.database_pool_pre_ping,
    }
    
    # Use NullPool for development/testing to avoid connection issues
    if settings.debug:
        pool_config = {"poolclass": NullPool}
    
    return pool_config


# Database URL used across the project
db_url = DATABASE_URL

# Force sync drivers for sync engine
if "sqlite+aiosqlite" in db_url:
    db_url = db_url.replace("sqlite+aiosqlite", "sqlite")

# Create sync engine with optimized settings
engine = create_engine(
    db_url,
    echo=settings.database_echo,
    **get_engine_config()
)

# Create sync session factory
SessionLocal = sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)




def ensure_user_presence_columns():
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
    except Exception as e:
        logger.warning("Failed to ensure user presence columns: %s", e)




def ensure_message_lifecycle_columns():
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
    except Exception as e:
        logger.warning("Failed to ensure message lifecycle columns: %s", e)


def get_db():
    """
    Dependency for getting database session
    
    Usage:
        def my_endpoint(db: Session = Depends(get_db)):
            # Use db session
            pass
    """
    session = SessionLocal()
    try:
        yield session
    except Exception as e:
        session.rollback()
        raise
    finally:
        session.close()


def init_db():
    """Initialize database tables"""
    try:
        from app.db.base import Base
        Base.metadata.create_all(bind=engine)
        ensure_user_presence_columns()
        ensure_message_lifecycle_columns()
    except Exception as e:
        logger.error("Database initialization error: %s", e)


def close_db():
    """Close database connection pool"""
    try:
        engine.dispose()
    except Exception as e:
        logger.error("Error closing database: %s", e)


