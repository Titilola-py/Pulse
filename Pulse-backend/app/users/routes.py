"""
User routes
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import select

from app.core.security import get_current_user
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserSearchResponse


router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search", response_model=List[UserSearchResponse])
@limiter.limit("20/minute")
def search_users(
    request: Request,
    q: str = Query(..., min_length=1, max_length=50),
    limit: int = Query(10, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    term = q.strip()
    if not term:
        return []

    stmt = (
        select(User)
        .where(User.id != current_user.id, User.username.ilike(f"%{term}%"))
        .order_by(User.username.asc())
        .limit(limit)
    )
    results = db.execute(stmt).scalars().all()
    return results



