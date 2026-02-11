"""
User schemas
"""
from pydantic import BaseModel
from typing import Optional


class UserSearchResponse(BaseModel):
    id: str
    username: str
    full_name: Optional[str]

    class Config:
        from_attributes = True
