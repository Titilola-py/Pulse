"""
Authentication routes
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limiter import (
    rate_limiter,
    LOGIN_ATTEMPT_LIMIT,
    LOGIN_ATTEMPT_WINDOW_SECONDS,
)
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
    validate_password,
)
from app.db.session import get_db
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    LogoutResponse,
    UserResponse,
)


router = APIRouter()

def _get_refresh_token_record(db: Session, token: str) -> RefreshToken | None:
    return db.execute(
        select(RefreshToken).where(RefreshToken.token == token)
    ).scalar_one_or_none()


def _store_refresh_token(db: Session, user_id: str, token: str) -> None:
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    record = RefreshToken(
        user_id=user_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()


def _revoke_refresh_token(db: Session, record: RefreshToken) -> None:
    record.revoked_at = datetime.utcnow()
    db.add(record)
    db.commit()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Sign up", description="Create a new account (sign up).")
@limiter.limit("3/minute")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """User sign up endpoint"""
    existing = db.execute(
        select(User).where(
            or_(User.username == payload.username, User.email == payload.email)
        )
    ).scalar_one_or_none()

    if existing:
        if existing.username == payload.username:
            detail = "Username already signed up"
        elif existing.email == payload.email:
            detail = "Email already signed up"
        else:
            detail = "User already signed up"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    try:
        validate_password(payload.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post("/login", response_model=TokenResponse, summary="Sign in", description="Authenticate a user (sign in).")
@limiter.limit("5/minute")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """User sign in endpoint"""
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"login:{client_host}"
    if not rate_limiter.allow(rate_key, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign in attempts. Please try again later.",
        )

    user = db.execute(
        select(User).where(
            or_(User.username == payload.username, User.email == payload.username)
        )
    ).scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    _store_refresh_token(db, user.id, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )



@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token", description="Refresh an access token using a valid refresh token.")
@limiter.limit("10/minute")
def refresh_token(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Refresh access token endpoint"""
    token_data = decode_token(payload.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_record = _get_refresh_token_record(db, payload.refresh_token)
    if not token_record or token_record.revoked_at or token_record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = token_data.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=user.id)
    refresh_token_value = create_refresh_token(subject=user.id)
    _store_refresh_token(db, user.id, refresh_token_value)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_value,
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user"""
    return current_user



@router.post("/logout", response_model=LogoutResponse, summary="Sign out", description="Sign out by revoking the provided refresh token.")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Sign out by revoking a refresh token."""
    token_data = decode_token(payload.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_record = _get_refresh_token_record(db, payload.refresh_token)
    if token_record and not token_record.revoked_at:
        _revoke_refresh_token(db, token_record)

    return {"detail": "Signed out"}
