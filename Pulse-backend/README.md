# Pulse Backend

Real-time chat and collaboration API built with FastAPI.

## Repository
- https://github.com/Titilola-py/Pulse.git

## Quick Links
- [Quick Start](QUICKSTART.md)
- [WebSocket Guide](WEBSOCKET_GUIDE.md)
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md)

## Requirements
- Python 3.10+
- PostgreSQL (recommended for production)
- Redis (optional, for scaling)

## Setup
1. Clone the repository and enter the backend folder:

```bash
git clone <repository-url>
cd Pulse-backend
```

2. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Create a local env file:

```bash
cp .env.example .env
```

5. Update values in `.env` as needed.

## Run

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Alternative:

```bash
python app/main.py
```

## Endpoints
- Base API: http://localhost:8000
- Health check: http://localhost:8000/health
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- WebSocket: ws://localhost:8000/api/chat/ws/{conversation_id}?token={jwt}

## Configuration
Settings are loaded from `.env` via `app/core/config.py`.

Key values used by the app:
- `APP_NAME`
- `APP_VERSION`
- `DEBUG`
- `SECRET_KEY`
- `ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `DATABASE_ECHO`
- `DATABASE_POOL_SIZE`
- `DATABASE_MAX_OVERFLOW`
- `DATABASE_POOL_RECYCLE`
- `DATABASE_POOL_PRE_PING`

Database URL is currently fixed in `app/db/session.py` as `sqlite:///./pulse.db`. To use PostgreSQL, update the `DATABASE_URL` constant in that file.

CORS origins are currently hard-coded in `app/main.py` to `http://localhost:3000` and `http://localhost:5173`. Update that list if your frontend runs elsewhere.

## Project Structure

```
app/
|-- main.py                # FastAPI application entry point
|-- core/
|   |-- config.py          # Configuration settings
|   `-- security.py        # JWT, password hashing, authentication
|-- db/
|   |-- base.py            # SQLAlchemy base class
|   `-- session.py         # Database session management
|-- models/                # SQLAlchemy ORM models
|-- schemas/               # Pydantic request/response schemas
|-- auth/                  # Authentication routes and logic
|-- chat/                  # Chat and messaging routes and logic
|-- websocket/             # WebSocket connection management
`-- services/              # Business logic services
```

## WebSocket Guide
For a step by step chat flow and protocol details, see:
- [QUICKSTART.md](QUICKSTART.md)
- [WEBSOCKET_GUIDE.md](WEBSOCKET_GUIDE.md)
