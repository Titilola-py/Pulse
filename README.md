# Pulse

Real-time chat and collaboration platform with a FastAPI backend and a Vite + React frontend.

## Repository
- https://github.com/Titilola-py/Pulse.git

## Structure
- [Pulse-backend](https://github.com/Titilola-py/Pulse/tree/main/Pulse-backend) - FastAPI API and WebSocket server
- [Pulse-frontend](https://github.com/Titilola-py/Pulse/tree/main/Pulse-frontend) - Vite + React client

## Quick Start
Backend:
1. `cd Pulse-backend`
2. `python -m venv .venv`
3. `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`)
4. `pip install -r requirements.txt`
5. `cp .env.example .env`
6. `python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

Frontend:
1. `cd Pulse-frontend`
2. `npm install`
3. `npm run dev`

## Docs
- Backend README: [Pulse-backend/README.md](https://github.com/Titilola-py/Pulse/blob/main/Pulse-backend/README.md)
- WebSocket Quick Start: [Pulse-backend/QUICKSTART.md](https://github.com/Titilola-py/Pulse/blob/main/Pulse-backend/QUICKSTART.md)
- WebSocket Guide: [Pulse-backend/WEBSOCKET_GUIDE.md](https://github.com/Titilola-py/Pulse/blob/main/Pulse-backend/WEBSOCKET_GUIDE.md)
- Frontend README: [Pulse-frontend/README.md](https://github.com/Titilola-py/Pulse/blob/main/Pulse-frontend/README.md)

## Configuration Notes
- Frontend API base URL: `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).
- Frontend WebSocket base URL: `VITE_WS_BASE_URL` (defaults to `ws://localhost:8000`).
- Health check URL can be overridden with `HEALTH_URL` for `npm run health`.
- Backend database URL: `DATABASE_URL` (defaults to `sqlite:///./pulse.db`).
- Backend CORS: `CORS_ORIGINS`, `CORS_CREDENTIALS`, `CORS_METHODS`, `CORS_HEADERS`.
