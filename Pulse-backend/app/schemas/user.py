"""User schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserSearchResponse(BaseModel):
    id: str
    username: str
    full_name: Optional[str]

    class Config:
        from_attributes = True


class AdminUserResponse(BaseModel):
    """Safe user payload for admin user listing."""

    id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    is_online: bool
    last_seen: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
