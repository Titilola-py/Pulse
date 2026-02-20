"""
FastAPI main application entry point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import settings
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

# Only initialize DB if not using in-memory SQLite in testing
try:
    from app.db.session import close_db, init_db
except Exception as e:
    logger.warning("Could not import database functions: %s", e)
    init_db = None
    close_db = None

from app.admin.routes import router as admin_router
from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.users.routes import router as users_router
from app.websocket.routes import router as websocket_router


# Initialize lifespan context
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Application starting...")
    try:
        # Initialize database tables
        if init_db:
            init_db()  # Now synchronous
            logger.info("Database initialized successfully")
        else:
            logger.info("Database initialization skipped")
    except Exception as e:
        logger.error("Database initialization error: %s", e)

    yield

    # Shutdown
    logger.info("Application shutting down...")
    try:
        if close_db:
            close_db()  # Now synchronous
            logger.info("Database connection closed")
    except Exception as e:
        logger.error("Error closing database: %s", e)


# FastAPI application
app = FastAPI(
    title="Pulse Backend",
    description="Real-time chat and collaboration platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting setup (SlowAPI)
app.state.limiter = limiter

# Proxy headers middleware ensures request.client.host reflects the real client IP behind proxies.
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# SlowAPI middleware enforces per-route limits.
app.add_middleware(SlowAPIMiddleware)


# Return a consistent JSON response when rate limits are exceeded.
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


# routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_router)
app.include_router(websocket_router)
app.include_router(users_router)
app.include_router(admin_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Pulse Backend API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "debug": settings.debug,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
