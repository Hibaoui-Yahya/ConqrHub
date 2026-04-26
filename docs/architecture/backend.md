# Backend Architecture

NestJS application running on Fastify, persisting through Postgres (Kysely) and Redis (BullMQ). One module per domain. EE features dynamically loaded.

## Stack

- **NestJS** — module / controller / service / DI
- **Fastify adapter** — bound in `apps/server/src/main.ts`
- **Kysely** — type-safe SQL builder; types auto-generated to `apps/server/src/database/types/db.d.ts`
- **PostgreSQL** — primary store (with `unaccent` extension)
- **Redis** — queue broker, pub/sub, websocket adapter
- **BullMQ** — background jobs
- **Passport** — authentication strategies
- **CASL** — authorization rules
- **Hocuspocus** — real-time collab (Yjs)
- **Socket.io** — general real-time (presence, notifications, page-tree updates)
- **Zod / class-validator** — DTO validation

## Top-level layout

```
apps/server/src/
├── main.ts                  Bootstrap — Fastify, multipart, cookie, websocket adapter
├── app.module.ts            Root module — imports core, integrations, EE (dynamic), ws, collab
├── app.controller.ts        Health / version endpoints
├── common/                  Shared: features.ts, decorators, guards, dtos
├── core/                    Domain modules (one per business concept)
├── integrations/            Side-channel infrastructure (mail, queue, storage, audit, …)
├── database/                Kysely setup, migrations, repos, types
├── collaboration/           Hocuspocus server + extensions
├── ws/                      Socket.io gateway
└── ee/                      Empty submodule directory in OSS — see enterprise-edition.md
```

## Core domain modules (`apps/server/src/core/`)

One folder per business domain. Standard layout per module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`.

| Module | Purpose |
|---|---|
| `attachment` | File uploads, attachment metadata, downloads |
| `auth` | Login, signup, JWT issuance, password reset, refresh |
| `casl` | Ability factory — workspace + space CASL rules |
| `comment` | Page comments (inline and page-level), threads |
| `favorite` | User favorites / bookmarks |
| `group` | User groups, group membership |
| `notification` | In-app notifications + email triggers |
| `page` | Page CRUD, hierarchy, statuses, content updates |
| `search` | Full-text search service, indexing hooks |
| `session` | User session tracking |
| `share` | Public sharing of pages and spaces |
| `space` | Space CRUD, members, permissions, settings |
| `user` | User profile, MFA flag, deactivation |
| `watcher` | Page watchers (subscribe to page changes) |
| `workspace` | Workspace settings, branding, defaults |

## Integrations (`apps/server/src/integrations/`)

Side-channel infrastructure that's not core domain logic:

| Folder | Purpose |
|---|---|
| `audit` | Audit-event service, retention cleanup |
| `environment` | `EnvironmentService`, env-var validation, domain helpers |
| `export` | Page / space export to MD, HTML, PDF (PDF via Gotenberg) |
| `health` | Postgres + Redis health checks |
| `import` | Markdown / HTML / Notion / Confluence / DOCX importers (DOCX is EE) |
| `mail` | Drivers — SMTP, Postmark, log driver — plus rendering |
| `queue` | BullMQ module, queue constants, processors |
| `redis` | Redis connection setup |
| `security` | `robots.txt` and version endpoints |
| `static` | Serves the built React SPA in production |
| `storage` | Drivers — local disk, S3-compatible, Azure |
| `telemetry` | Anonymous analytics |
| `throttle` | Rate-limit guards |
| `transactional` | React-email templates rendered at runtime |

## Path aliases

Defined in `tsconfig.json`:

| Alias | Maps to | Used for |
|---|---|---|
| `@docmost/db/*` | `apps/server/src/database/*` | Importing types and repos |
| `@docmost/transactional/*` | `apps/server/src/integrations/transactional/*` | React-email templates |
| `@docmost/ee/*` | `apps/server/src/ee/*` | EE submodule — fails gracefully when missing |

The aliases are intentional: `@docmost/*` lets EE code import the same way regardless of whether it's loaded from the submodule path or an alternative location.

## Module wiring (the EE pattern)

The root module (`app.module.ts`) imports a *promise* for the EE module — it's loaded with `ModuleRef.create()` only if the submodule resolves. If it doesn't, the rest of the app comes up in **free tier** and EE-flagged controllers throw `ForbiddenException` for paid features.

This means:

- **OSS clones boot.** The empty `apps/server/src/ee/` directory does not break anything.
- **Paid clones add the submodule.** Either by `git submodule update --init` (if you have access) or by mounting the EE bundle at the right path.
- **Tests can run with `ee=undefined`.** The free-tier path is the default test surface.

For the full pattern, see [`./enterprise-edition.md`](./enterprise-edition.md).

## Authentication

Implemented in `core/auth/`. Strategies in `core/auth/strategies/`:

| Strategy | Tier | Notes |
|---|---|---|
| **JWT** | Free | Cookie-based session token + Bearer auth for the same secret |
| **API key** | Business+ | Bearer token; key managed by EE module |
| **Google OAuth** | Business+ | EE strategy |
| **SAML 2.0** | Business+ | EE strategy |
| **OIDC** | Business+ | EE strategy |
| **LDAP** | Business+ | EE strategy |

The OSS repo only ships the JWT strategy. The remaining strategies live in the EE submodule but the **schema** (DB columns for SAML / OIDC / LDAP provider config) is in the OSS migrations — so you can see the field set without access to the EE code.

## Authorization

Two layers:

1. **CASL ability** — built per request from `user + workspace + memberships`. Rules in `core/casl/`. Used by guards on controllers.
2. **Service-level checks** — for finer-grained logic, services call into `PageAccessService.validateCanView / canEdit / canComment`. These respect page-level restrictions on top of space rules.

Permission resolution order is: **explicit page restriction > inherited page restriction > space role > workspace role**. Full description in [`./permissions-model.md`](./permissions-model.md).

## Background jobs (BullMQ)

10 queues, 26+ job constants. Defined in `apps/server/src/integrations/queue/constants/queue.constants.ts`.

| Queue | Examples |
|---|---|
| `EMAIL_QUEUE` | `SEND_EMAIL`, `WELCOME_EMAIL`, `FIRST_PAYMENT_EMAIL` |
| `ATTACHMENT_QUEUE` | Attachment processing |
| `GENERAL_QUEUE` | `PDF_EXPORT_TASK`, `PAGE_VERIFICATION_EXPIRING`, `VERIFICATION_RECONCILE` |
| `BILLING_QUEUE` | Stripe webhooks |
| `FILE_TASK_QUEUE` | `IMPORT_TASK` |
| `SEARCH_QUEUE` | `SEARCH_INDEX_PAGE`, `SEARCH_INDEX_COMMENT`, `SEARCH_REMOVE_PAGE` |
| `AI_QUEUE` | AI generation, embedding indexing |
| `HISTORY_QUEUE` | `PAGE_HISTORY` snapshots |
| `NOTIFICATION_QUEUE` | `COMMENT_NOTIFICATION`, `PAGE_MENTION_NOTIFICATION`, `PAGE_UPDATE_DIGEST` |
| `AUDIT_QUEUE` | `AUDIT_LOG`, `AUDIT_CLEANUP` |

Full reference: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md).

## Database & migrations

- **ORM:** Kysely (not an ORM in the classic sense — type-safe SQL builder).
- **Migrations:** `apps/server/src/database/migrations/`. Filenames are timestamped: `YYYYMMDDTHHMMSS-name.ts`.
- **Codegen:** After a migration, run `pnpm migration:codegen` to refresh `database/types/db.d.ts`.
- **Repos:** Encapsulate query logic per table in `database/repos/`.
- **43 migrations** at the time of writing. Most recent ones include `page-verifications`, `templates`, `ai-chat`, `favorites`, `file_tasks`.

See [`../engineering/database-and-migrations.md`](../engineering/database-and-migrations.md) for daily operations.

## Email

`integrations/mail/` provides:

- **Drivers:** `smtp`, `postmark`, `log` (no-op for dev)
- **Templates:** `integrations/transactional/emails/` — 15 React (TSX) templates rendered with `@react-email/render`. Includes invitation, comment notifications, password reset, page-update digest, verification expiring/expired, approval requested/rejected.
- **Preview:** `pnpm email:dev` runs the React-email preview server on `:5019`.

## Real-time

Two distinct websockets:

- **Hocuspocus** at `/collab` — Yjs CRDT document sync. Code in `apps/server/src/collaboration/`. Detail in [`./realtime-collaboration.md`](./realtime-collaboration.md).
- **Socket.io** at `/socket.io` — presence, notifications, page-tree updates. Code in `apps/server/src/ws/`. Uses Redis adapter for multi-instance pub/sub.

Both can run in the same process as the API or be split.

## What you don't find in this codebase

If you're cross-referencing the docs and looking for something that *should* be there:

- **`apps/server/src/ee/` is empty in this clone** — that's expected; it's a private git submodule.
- **No telemetry sink configured by default** — `integrations/telemetry/` has the hooks but no destination unless you wire one.
- **No multi-region story.** The codebase is single-cluster; multi-region is a deployment concern, not a code concern.

For the frontend half of the architecture, see [`./frontend.md`](./frontend.md).
