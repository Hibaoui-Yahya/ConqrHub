# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

ConqrAI Wiki (v0.80.0) — a collaborative wiki and documentation platform. Monorepo with pnpm workspaces and Nx orchestration.

## Critical Rule: Never Break the ConqrHub ↔ ConqrFabric Connection

ConqrFabric uses ConqrHub's tools on behalf of users, through its adapter in `ConqFabric_repo/integrations/conqrhub/conqrhub_adapter/` (`catalogue.py`, `provider.py`, `delegation.py`, `identity.py`). **Every change to ConqrHub must leave that connection working.** Treat everything below as a public contract. Additive, backward-compatible changes are fine. Renaming, removing, or changing behavior requires updating Fabric's adapter in the same rollout.

**What Fabric calls.** `POST {CONQRHUB_BASE_URL}/api/delegation/<endpoint>` with the tool arguments as the JSON body, served by `SuiteDelegationController` (`apps/server/src/core/integration/delegation/`):

| Fabric capability | Endpoint | Scope |
|---|---|---|
| `space.list` / `space.read` | `spaces/list` / `spaces/read` | `space:read` |
| `space.create` / `space.update` | `spaces/create` / `spaces/update` | `space:create` / `space:update` |
| `page.search` | `pages/search` | `page:search` |
| `page.list` / `page.list_recent` / `page.read` | `pages/list` / `pages/recent` / `pages/read` | `page:read` |
| `page.breadcrumbs.read` / `page.history.read` | `pages/breadcrumbs` / `pages/history` | `page:read` |
| `page.create` / `page.update` | `pages/create` / `pages/update` | `page:create` / `page:update` |
| `comment.list` | `comments/list` | `comment:read` |
| `comment.create` / `comment.update` | `comments/create` / `comments/update` | `comment:create` / `comment:update` |

Keep these stable:

- **Routes, methods, and scope names** in the table above, plus the `delegation/{*path}` entry in `common/middlewares/domain-exempt-routes.ts`.
- **Request fields** (snake_case, validated in `delegation/dto/`): `space_id`, `page_id`, `parent_page_id`, `comment_id`, `query`, `limit`, `name`, `slug`, `description`, `title`, `content` (Markdown), `content_operation` (`replace` | `append` | `prepend`), `text`. Don't make optional fields required. Don't lower the `limit` maximums (50 for lists, 20 for `pages/search`, `pages/recent`, `pages/history`). Keep accepting a UUID, a page `slugId`, or a space `slug` wherever an id is taken.
- **Response shapes.** The `{ data, success, status }` envelope from the HTTP interceptor, and the fields inside `data` that Fabric's `RETURNS` declares (produced by `DelegatedAuthoringService`). Examples: list endpoints return `{ items: [...] }`, `pages/read` returns `id, title, content, slug_id, space_id, updated_at, content_truncated`, and `pages/history` items carry `id, title, author, created_at`. Adding fields is fine. Renaming or removing them is not.
- **Status codes.** Fabric maps 401 → auth required, 403 → permission denied, 400/422 → invalid arguments, 404 → not found, 429 → rate limited (retried), 5xx → provider unavailable (retried). A refusal must never surface as a 500.
- **Auth.** `Authorization: Bearer <service token>` (checked against `CONQR_DELEGATION_CLIENT_TOKENS`), plus an `X-Conqr-Delegation` header carrying a compact JWS. The JWS has `typ: CONQR-OBO`, `alg: EdDSA`, a `kid` header, and claims `sub`, `tid`, `aud`, `scope[]`, `iat`, `nbf`, `exp`, `act: "obo"`, `iss`, and `jti`. Fabric's TTL is at most 300s. `X-Conqr-Correlation-Id` equals the `jti`. The code that verifies this is `SuiteDelegationGuard`, `SuiteDelegationVerifierService`, and `suite-delegation-scope.ts`.
- **Identity format.** `conqr:person:oidc:<idp-key>:<subject>` and `conqr:org:oidc:<idp-key>:<organisation>`, resolved by `suite-identity.util.ts`, `oidc-identity-link.service.ts`, `auth-account.repo.ts`, and `suite-org-identity.repo.ts`. Audits go through `delegation-audit.repo.ts`. Migrations must not drop or rename the tables and columns these use (see the `suite-delegation-identity` migration).
- **Config.** `CONQR_SUITE_IDP_KEY` (must equal Fabric's `CONQRHUB_IDP_KEY`), `CONQR_DELEGATION_CLIENT_TOKENS`, `CONQRFABRIC_ASSERTION_PUBLIC_KEY_PEM`, `CONQRFABRIC_ASSERTION_KEY_ID`, `CONQRFABRIC_OBO_ISSUER` (`conqrfabric`), `CONQR_DELEGATION_AUDIENCE` (`conqrhub`), and `CONQR_DELEGATION_MAX_TTL_SECONDS`. Don't rename these or change their defaults.

Before finishing any change that touches these areas, or the shared code behind them (auth, CASL, page/space/comment services and repos, the response interceptor):

1. Run the delegation specs: `cd apps/server && pnpm run test -- delegation suite-delegation delegated-authoring suite-identity`.
2. Check the change against Fabric's `catalogue.py` (`OPERATIONS` and `RETURNS`) and `provider.py` (status mapping).
3. If a breaking change can't be avoided, stop and flag it to the user before making it.

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
