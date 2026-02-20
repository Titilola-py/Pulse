"""Admin-only routes."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.session import get_async_db
from app.models.user import User
from app.schemas.user import AdminUserResponse


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[AdminUserResponse])
async def list_users(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_async_db),
):
    """Return all users for admins only."""
    _ = current_user

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return users
