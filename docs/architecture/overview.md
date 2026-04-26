# System Overview

The 30,000-foot view. After this page you should be able to: name every process, draw the data plane, identify which folder owns which concept, and know where to look next.

## Monorepo

```
Conqrai_Wiki/
├── apps/
│   ├── client/            React 18 SPA (Vite)
│   └── server/            NestJS backend (Fastify)
├── packages/
│   ├── editor-ext/        Tiptap extensions, shared between client + collab server
│   └── ee/                Enterprise license stub (LICENSE only)
├── docker-compose.yml     Postgres + Redis for local dev
├── nx.json                Nx orchestration
└── pnpm-workspace.yaml    Workspaces
```

Tooling:

- **pnpm** workspaces
- **Nx** for orchestration
- **TypeScript** everywhere
- **Docker / Docker-Compose** for local infra

## Processes at runtime

A complete deployment runs **at minimum** these processes:

| Process | What it is | Default port | Where it lives |
|---|---|---|---|
| **API server** | NestJS (Fastify adapter) — REST + Socket.io + collab WebSocket | 3000 | `apps/server` |
| **Client SPA** | Vite-built static bundle served by the API server in production; standalone Vite dev server in development (proxies `/api`, `/socket.io`, `/collab`) | 5173 (dev) | `apps/client` |
| **PostgreSQL** | Primary data store (with `unaccent` extension for search) | 5432 | external |
| **Redis** | BullMQ queues, websocket adapter pub/sub, real-time signaling | 6379 | external |

Optional processes:

| Process | Purpose | Required for |
|---|---|---|
| **Collaboration server** | Standalone Hocuspocus process — same code as `apps/server`, run with `pnpm collab:dev` / `:prod`. Useful when scaling collab independently of the API. | High-concurrency real-time editing |
| **Typesense** | External search engine | Business-tier Typesense driver |
| **Gotenberg** | PDF rendering service | Business-tier PDF export |
| **S3-compatible store** | Attachment storage outside server filesystem | Production / multi-instance |
| **SMTP / Postmark** | Outbound email delivery | Notifications, invitations |

## Data plane

```
Client (React SPA)
  │
  ├─ HTTP/JSON ──────────► /api/*           (REST controllers)
  ├─ WebSocket ─────────► /socket.io        (presence, notifications, page tree updates)
  └─ WebSocket ─────────► /collab           (Hocuspocus / Yjs CRDT sync)
                                │
                                ▼
                        NestJS server (Fastify)
                                │
        ┌───────────────────────┼─────────────────────────┐
        ▼                       ▼                         ▼
   PostgreSQL              Redis (BullMQ)            Storage driver
   (Kysely ORM)            • email queue             local | S3 | Azure
                           • search-index queue
                           • notification queue
                           • audit queue
                           • file-task queue
                           • AI queue
                           • billing queue
                           • general queue
                           • history queue
                           • attachment queue
                                │
                                └────► Workers (in-process by default)
```

Important properties of this layout:

- **Single-binary deployment is supported.** The API server hosts REST, Socket.io, the collab WebSocket, and runs queue workers in-process. Smaller deployments don't need to split anything.
- **Horizontal scaling works** because Redis is the source of truth for real-time pub/sub (Socket.io adapter) and queues. Multiple API instances coordinate through Redis.
- **The collab WebSocket can be split out** to a dedicated process when needed (`pnpm collab:prod`).

## License tiers and where they live

The codebase is **dual-licensed**:

| Path | License | What's there |
|---|---|---|
| `apps/server/src/core/`, `apps/server/src/integrations/`, `apps/client/src/features/`, `packages/editor-ext/` | AGPL-3.0 | Core wiki — pages, spaces, comments, editor, search, real-time, etc. |
| `apps/server/src/ee/` | Commercial | **Git submodule** pointing at `github.com/docmost/ee`. Empty directory in OSS clones. |
| `apps/client/src/ee/` | Commercial | **Present** in the repo. Loaded only when the workspace's entitlements include the matching feature flag. |
| `packages/ee/` | Commercial | License stub. |

Backend EE features (AI, audit, billing, MFA, SSO providers, page verification, etc.) only run when the server can `require()` the EE submodule at boot. When it can't, the system **falls back to the free tier** and EE-flagged endpoints return 403 / "feature unavailable."

This is critical context: many things this documentation describes (page-level permissions, audit logs, AI Chat) require the EE submodule to be present at build/run time. See [`./enterprise-edition.md`](./enterprise-edition.md).

## Request lifecycle (typical authenticated REST call)

```
1. Client sends:   POST /api/pages/info  (cookie: authToken)
2. Fastify ingress:    cookie → JWT decoded by JwtAuthGuard
3. CASL ability:       built from user + workspace + space membership
4. Controller:         /core/page/page.controller → page.service
5. Service:            kysely query through page.repo (in /database/repos)
6. Permission check:   PageAccessService.validateCanView(...)
7. Side effects:       audit event onto AUDIT_QUEUE; index event onto SEARCH_QUEUE (when applicable)
8. Response:           JSON
```

Streaming endpoints (AI Chat / AI Search) use Server-Sent Events with the same auth path.

The collaboration WebSocket follows a different path — see [`./realtime-collaboration.md`](./realtime-collaboration.md).

## Where to read next

- Backend internals → [`./backend.md`](./backend.md)
- Frontend internals → [`./frontend.md`](./frontend.md)
- How EE actually loads → [`./enterprise-edition.md`](./enterprise-edition.md)
- How features get gated → [`./feature-gating.md`](./feature-gating.md)
- How to develop on this → [`../engineering/getting-started.md`](../engineering/getting-started.md)
