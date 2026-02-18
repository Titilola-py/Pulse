"""Pydantic schemas for authentication."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    """Schema for user sign up."""

    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)


class LoginRequest(BaseModel):
    """Schema for user sign in."""

    username: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    """Schema for refresh token."""

    refresh_token: str = Field(..., min_length=1)


class ForgotPasswordRequest(BaseModel):
    """Schema for initiating password reset."""

    email: str = Field(..., min_length=3, max_length=255)


class ResetPasswordRequest(BaseModel):
    """Schema for completing password reset."""

    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=8, max_length=128)


class PasswordResetResponse(BaseModel):
    """Schema for forgot/reset password responses."""

    message: str


class TokenResponse(BaseModel):
    """Schema for access/refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LogoutResponse(BaseModel):
    """Schema for logout response."""

    detail: str


class UserResponse(BaseModel):
    """Schema for user response (no sensitive fields)."""

    id: str
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_superuser: bool
    is_online: bool
    last_seen: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
