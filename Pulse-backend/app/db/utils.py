"""
Database utility functions for querying and pagination
"""
from typing import TypeVar, Generic, Optional, List, Any, Dict
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel

T = TypeVar("T", bound=DeclarativeBase)
SchemaT = TypeVar("SchemaT", bound=BaseModel)


class PaginationParams(BaseModel):
    """Pagination parameters"""
    skip: int = 0
    limit: int = 20
    
    class Config:
        ge = 0


class PaginatedResponse(BaseModel, Generic[SchemaT]):
    """Paginated response wrapper"""
    total: int
    skip: int
    limit: int
    items: List[Any]


async def get_by_id(
    db: AsyncSession,
    model: type[T],
    id: Any
) -> Optional[T]:
    """Get a single record by ID"""
    query = select(model).where(model.id == id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_all(
    db: AsyncSession,
    model: type[T],
    skip: int = 0,
    limit: int = 20
) -> List[T]:
    """Get all records with pagination"""
    query = select(model).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def count(
    db: AsyncSession,
    model: type[T]
) -> int:
    """Count total records"""
    query = select(func.count(model.id))
    result = await db.execute(query)
    return result.scalar() or 0


async def create(
    db: AsyncSession,
    model: type[T],
    obj_in: Dict[str, Any]
) -> T:
    """Create a new record"""
    db_obj = model(**obj_in)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


async def update(
    db: AsyncSession,
    db_obj: T,
    obj_in: Dict[str, Any]
) -> T:
    """Update an existing record"""
    for key, value in obj_in.items():
        if hasattr(db_obj, key):
            setattr(db_obj, key, value)
    
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


async def delete(
    db: AsyncSession,
    db_obj: T
) -> bool:
    """Delete a record"""
    await db.delete(db_obj)
    await db.commit()
    return True


async def get_paginated(
    db: AsyncSession,
    model: type[T],
    skip: int = 0,
    limit: int = 20
) -> Dict[str, Any]:
    """Get paginated results with total count"""
    total = await count(db, model)
    items = await get_all(db, model, skip=skip, limit=limit)
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": items
    }
