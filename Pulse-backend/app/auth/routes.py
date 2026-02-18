"""Authentication routes."""

from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.auth.password_reset import (
    build_password_reset_link,
    generate_password_reset_token,
    get_reset_token_expiry,
    hash_reset_token,
    send_reset_email_with_resend_safe,
)
from app.core.config import settings
from app.core.limiter import limiter
from app.core.rate_limiter import (
    LOGIN_ATTEMPT_LIMIT,
    LOGIN_ATTEMPT_WINDOW_SECONDS,
    rate_limiter,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    validate_password,
    verify_password,
)
from app.db.session import get_async_db, get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutResponse,
    PasswordResetResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)


router = APIRouter()

FORGOT_PASSWORD_RESPONSE_MESSAGE = "If the email exists, a reset link has been sent."
RESET_PASSWORD_SUCCESS_MESSAGE = "Password has been reset successfully."
INVALID_RESET_TOKEN_MESSAGE = "Invalid or expired reset token"


def _get_refresh_token_record(db: Session, token: str) -> RefreshToken | None:
    return db.execute(select(RefreshToken).where(RefreshToken.token == token)).scalar_one_or_none()


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


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Sign up",
    description="Create a new account (sign up).",
)
@limiter.limit("3/minute")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """User sign up endpoint."""
    existing = db.execute(
        select(User).where(or_(User.username == payload.username, User.email == payload.email))
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


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Sign in",
    description="Authenticate a user (sign in).",
)
@limiter.limit("5/minute")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """User sign in endpoint."""
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"login:{client_host}"
    if not rate_limiter.allow(rate_key, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign in attempts. Please try again later.",
        )

    user = db.execute(
        select(User).where(or_(User.username == payload.username, User.email == payload.username))
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


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Refresh an access token using a valid refresh token.",
)
@limiter.limit("10/minute")
def refresh_token(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Refresh access token endpoint."""
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


@router.post(
    "/forgot-password",
    response_model=PasswordResetResponse,
    summary="Forgot password",
    description="Request a password reset link.",
)
@limiter.limit("5/minute")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
):
    """Create and email a one-time password reset token without revealing account existence."""
    response = PasswordResetResponse(message=FORGOT_PASSWORD_RESPONSE_MESSAGE)
    normalized_email = payload.email.strip().lower()

    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if not user:
        # Keep similar work to reduce user-enumeration timing differences.
        generate_password_reset_token()
        return response

    raw_token, hashed_token = generate_password_reset_token()
    user.reset_token = hashed_token
    user.reset_token_expiry = get_reset_token_expiry()
    await db.commit()

    reset_link = build_password_reset_link(raw_token)
    background_tasks.add_task(send_reset_email_with_resend_safe, user.email, reset_link)

    return response


@router.post(
    "/reset-password",
    response_model=PasswordResetResponse,
    summary="Reset password",
    description="Reset account password using a valid one-time reset token.",
)
@limiter.limit("10/minute")
async def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_async_db),
):
    """Validate token/expiry, rotate password hash, and clear reset token fields."""
    try:
        validate_password(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    now = datetime.utcnow()
    token_hash = hash_reset_token(payload.token.strip())

    result = await db.execute(select(User).where(User.reset_token == token_hash))
    user = result.scalar_one_or_none()

    if not user or not user.reset_token_expiry or user.reset_token_expiry < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=INVALID_RESET_TOKEN_MESSAGE,
        )

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expiry = None

    # Revoke existing refresh tokens so active sessions cannot survive a password reset.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )

    await db.commit()

    return PasswordResetResponse(message=RESET_PASSWORD_SUCCESS_MESSAGE)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return current_user


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Sign out",
    description="Sign out by revoking the provided refresh token.",
)
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
