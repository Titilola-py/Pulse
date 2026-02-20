"""
Security utilities - JWT, password hashing, authentication
"""
from datetime import datetime, timedelta
import re
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

PASSWORD_REQUIREMENTS_MESSAGE = (
    "Password must be 8-64 characters and include at least one uppercase letter, "
    "one lowercase letter, and one number."
)


# Password hashing

def validate_password(password: str) -> None:
    """Validate a password against the application's password policy."""
    if not password:
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)
    if len(password) < 8 or len(password) > 64:
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)
    if not re.search(r"[A-Z]", password):
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)
    if not re.search(r"[a-z]", password):
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)
    if not re.search(r"\d", password):
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)


def hash_password(password: str) -> str:
    """Hash a password using passlib."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password using passlib."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


# JWT utilities

def _build_token_payload(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    to_encode: Dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "exp": datetime.utcnow() + expires_delta,
    }
    if extra:
        to_encode.update(extra)
    return to_encode


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a JWT access token."""
    if not subject:
        raise ValueError("Subject is required for access token")

    expire = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = _build_token_payload(subject, "access", expire, extra)
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a JWT refresh token."""
    if not subject:
        raise ValueError("Subject is required for refresh token")

    expire = expires_delta or timedelta(days=settings.refresh_token_expire_days)
    to_encode = _build_token_payload(subject, "refresh", expire, extra)
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        return payload
    except JWTError:
        return None


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Get the current authenticated user from a Bearer token.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch full user record so role and other auth fields are available to dependencies.
    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.role:
        user.role = "user"

    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role for protected endpoints."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
