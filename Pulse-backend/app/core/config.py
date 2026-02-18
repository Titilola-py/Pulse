"""Application configuration settings."""

from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Application
    app_name: str = "Pulse Backend"
    app_version: str = "1.0.0"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./pulse.db"
    database_echo: bool = False
    database_pool_size: int = 20
    database_max_overflow: int = 0
    database_pool_recycle: int = 3600
    database_pool_pre_ping: bool = True

    # JWT
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_expiry: int = 3600

    # Password reset + email provider
    reset_token_expiry_minutes: int = 30
    frontend_url: str = "https://pulse-frontend-2w43.onrender.com"
    resend_api_key: Optional[str] = None
    email_from: str = "onboarding@resend.dev"

    # CORS
    cors_origins: List[str] = ["*"]
    cors_credentials: bool = True
    cors_methods: List[str] = ["*"]
    cors_headers: List[str] = ["*"]

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    class Config:
        case_sensitive = False
        extra = "allow"
        env_file = ".env"


settings = Settings()
