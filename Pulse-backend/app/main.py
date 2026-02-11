"""
FastAPI main application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter

# Only initialize DB if not using in-memory SQLite in testing
try:
    from app.db.session import init_db, close_db
except Exception as e:
    print(f"Warning: Could not import database functions: {e}")
    init_db = None
    close_db = None

from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.websocket.routes import router as websocket_router


# Initialize lifespan context
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Application starting...")
    try:
        # Initialize database tables
        if init_db:
            init_db()  # Now synchronous
            print("Database initialized successfully")
        else:
            print("Database initialization skipped")
    except Exception as e:
        print(f"Database initialization error: {e}")

    yield

    # Shutdown
    print("Application shutting down...")
    try:
        if close_db:
            close_db()  # Now synchronous
            print("Database connection closed")
    except Exception as e:
        print(f"Error closing database: {e}")


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
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_router)
app.include_router(websocket_router)


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
