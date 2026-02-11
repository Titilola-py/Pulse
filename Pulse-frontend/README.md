# Pulse Frontend

Vite + React + TypeScript client with routing and an API client scaffold.

## Repository
- https://github.com/Titilola-py/Pulse.git

## Quick Start
1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

## Build and Preview

```bash
npm run build
npm run preview
```

## Scripts
- `npm run dev` - start the Vite dev server
- `npm run build` - typecheck and build for production
- `npm run preview` - preview the production build locally
- `npm run health` - call the backend health endpoint

## Configuration
- `VITE_API_BASE_URL` sets the REST API base URL (defaults to `http://localhost:8000`).
- `VITE_WS_BASE_URL` sets the WebSocket base URL (defaults to `ws://localhost:8000`).
- The health check script reads `HEALTH_URL` and defaults to `http://127.0.0.1:8000/health`.

## Project Structure

```
src/
|-- api/         # Axios instance and API calls
|-- components/  # Reusable UI components
|-- pages/       # Route level pages
|-- types/       # Shared TypeScript types
`-- utils/       # Helper functions
```

## Backend Integration
The backend runs at `http://localhost:8000` by default. If you change it, update `src/api/client.ts`.
