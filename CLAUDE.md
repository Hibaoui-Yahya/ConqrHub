# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Docmost (v0.80.0) — an open-source collaborative wiki and documentation platform. Monorepo with pnpm workspaces and Nx orchestration.

## Commands

```bash
# Install dependencies
pnpm install

# Infrastructure (PostgreSQL + Redis required)
docker-compose up -d db redis

# Configure environment
cp .env.example .env   # then edit .env

# Development (both frontend + backend)
pnpm run dev

# Individual apps
pnpm run client:dev      # Vite dev server at :5173, proxies /api to backend
pnpm run server:dev      # NestJS backend at :3000 (watch mode)

# Build
pnpm run build           # All apps (Nx)
pnpm run client:build    # Frontend only
pnpm run server:build    # Backend only (nest build)

# Server tests
cd apps/server
pnpm run test            # Jest unit tests (*.spec.ts)
pnpm run test:watch      # Watch mode
pnpm run test:e2e        # E2E tests (supertest)

# Lint & format
cd apps/server && pnpm run lint      # ESLint with --fix
cd apps/client && pnpm run lint      # ESLint
cd apps/server && pnpm run format    # Prettier (src + test)
cd apps/client && pnpm run format    # Prettier (src)

# Database migrations (run from apps/server)
pnpm run migration:create    # Create new migration
pnpm run migration:up        # Run next pending migration
pnpm run migration:latest    # Run all pending migrations
pnpm run migration:down      # Rollback last migration
pnpm run migration:codegen   # Regenerate DB types from schema

# Email template preview
pnpm run email:dev           # Preview at :5019

# Collaboration server (standalone)
pnpm run collab:dev
```

## Architecture

### Monorepo Layout

- **`apps/client`** — React 18 SPA (Vite, Mantine UI, React Router v7)
- **`apps/server`** — NestJS backend (Fastify adapter, PostgreSQL via Kysely, Redis)
- **`packages/editor-ext`** — Custom Tiptap editor extensions (shared between client/server)
- **`packages/ee`** — Enterprise Edition (separate license, loaded dynamically)

### Frontend (`apps/client/src`)

- **Feature-based organization** under `features/` — each feature has its own `atoms/`, `hooks/`, `queries/`, `services/`, `types/`, `components/`
- **State**: Jotai atoms for global/UI state, TanStack Query for server state
- **Routing**: React Router v7, routes defined in `App.tsx`
- **Path alias**: `@/*` → `./src/*`
- **Key routes**: `/s/:spaceSlug/p/:pageSlug` (page editor), `/settings/*`, `/share/:shareId/p/:pageSlug`

### Backend (`apps/server/src`)

- **NestJS modules** in `core/` — one module per domain (page, space, user, auth, comment, etc.)
- **Repository pattern** in `database/repos/` — Kysely-based data access
- **Path aliases**: `@docmost/db/*`, `@docmost/transactional/*`, `@docmost/ee/*`
- **Integrations** in `integrations/` — storage (S3/local), mail (SMTP/Postmark), queue (BullMQ), search (Typesense + BM25), export (Gotenberg PDF)
- **Auth**: JWT (cookies) + Passport strategies (Google OAuth, SAML, OIDC) + TOTP MFA
- **Authorization**: CASL permission rules in `core/casl/`
- **Guards**: `JwtAuthGuard` for protected routes, CASL-based permission guards

### Real-time Collaboration

- **Hocuspocus** server (Yjs CRDT) for document sync at `/collab` WebSocket endpoint
- **Socket.io** at `/socket.io` for general real-time events (notifications, presence)
- Collaboration code in `collaboration/` with extensions for auth, persistence, logging
- Can run as standalone process (`collab:dev` / `collab:prod`)

### Enterprise Edition

Enterprise modules in `apps/server/src/ee/`, `apps/client/src/ee/`, and `packages/ee/` are AGPL-excluded and loaded dynamically at runtime. Cloud vs self-hosted mode controlled by `CLOUD` env var.

### API Client

Frontend uses an Axios wrapper at `lib/api-client.ts` — base URL `/api`, auto-redirects to `/login` on 401. Vite dev server proxies `/api`, `/socket.io`, and `/collab` to the backend.

### Database

PostgreSQL with Kysely (type-safe query builder). Migrations in `apps/server/src/database/migrations/`. After schema changes, run `migration:codegen` to regenerate types in `database/types/db.d.ts`.

## Key Environment Variables

`APP_URL`, `APP_SECRET` (min 32 chars), `DATABASE_URL`, `REDIS_URL`, `STORAGE_DRIVER` (local|s3), `MAIL_DRIVER` (smtp|postmark). See `.env.example` for full list.

## License

Core is AGPL-3.0. Files under `apps/server/src/ee/`, `apps/client/src/ee/`, and `packages/ee/` are enterprise-licensed.
