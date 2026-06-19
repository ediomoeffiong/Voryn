# Voryn

Voryn is split into a React frontend and a functional API backend.

## Structure

- `frontend/` - Vite, React, React Router, and the premium visual discovery UI.
- `backend/` - Express API with event, city, organizer, search, and health endpoints.
- `backend/prisma/schema.prisma` - production-ready PostgreSQL schema for the future database layer.

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000`

Useful API checks:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/search?q=lagos&mode=local
curl http://localhost:4000/api/events/global-ai-summit-2026
```
