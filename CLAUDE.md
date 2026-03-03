# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**synthek** — Web app for construction site coordination assisted by AI. Experts upload documents (PDF, Word, Excel), an AI (Claude) detects inconsistencies between them and fires alerts. Experts can also ask regulatory questions in natural language.

## Commands

### Backend (`synthek/backend/`)
```bash
npm run dev          # Start with --watch (auto-restart)
npm start            # Production
npm run db:migrate   # Run Prisma migrations (requires DATABASE_URL)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:studio    # Open Prisma Studio GUI
```

### Frontend (`synthek/frontend/`)
```bash
npm run dev     # Vite dev server on port 5173
npm run build   # Production build
npm run lint    # ESLint
```

### Database
- PostgreSQL 17 via Homebrew: `brew services start postgresql@17`
- Local DB: `moeia`, user: `pat`, no password, port 5432
- Prisma 7: connection URL goes in `prisma.config.ts` (not in `schema.prisma`)
- Prisma 7 requires a driver adapter — use `@prisma/adapter-pg` in `src/lib/prisma.js`

### Create a test user
```bash
cd synthek/backend
node -e "
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
bcrypt.hash('password123', 10).then(hash =>
  prisma.user.create({ data: { nom: 'Nom', email: 'email@example.com', password: hash, role: 'admin' } })
).then(u => { console.log('Created:', u.email); prisma.\$disconnect() })
"
```

## Architecture

### Backend (`src/`)
- `server.js` → `src/app.js` — Express entry point
- `src/lib/prisma.js` — Prisma singleton with PrismaPg adapter
- `src/middleware/auth.js` — JWT verification (`Authorization: Bearer <token>`)
- `src/routes/` — auth, projets, documents, alertes, ia
- `src/services/extractText.js` — PDF/DOCX/XLSX text extraction (pdf-parse, mammoth, xlsx)
- `src/services/ia.js` — Claude API calls: `analyserProjet()` detects inconsistencies across all project documents, `questionIA()` answers natural language questions

### Frontend (`src/`)
- `services/api.js` — Axios instance with JWT interceptor + 401 redirect
- `context/AuthContext.jsx` — Auth state (user, login, logout) via localStorage
- Pages: Login → Dashboard → Projet → Upload / Chat / Historique

### Key data model
- `User.role` = global role (`admin` / `expert` / `moa`)
- `ProjetUser.role` = role within a specific project
- Only `admin` global role can delete projects
- `Alerte` links to multiple `Document` via `AlerteDocument` join table
- After each document upload, `analyserProjet()` runs in background (non-blocking)

### AI logic
- On upload: extract text → send all project documents to Claude → create `Alerte` records for inconsistencies
- Chat: send question + all project document texts to Claude → save to `MessageIA`
- Model used: `claude-opus-4-6`

## Environment variables (backend `.env`)
```
DATABASE_URL=postgresql://pat@localhost:5432/moeia
JWT_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
UPLOAD_DIR=./uploads
```
