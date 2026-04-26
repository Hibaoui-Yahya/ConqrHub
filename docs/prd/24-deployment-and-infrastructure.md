# PRD 24 — Deployment & Infrastructure

> **Source:** PA 24, lines 6128–6530 (and reprised at 8830+).

## Area overview

Self-hosted, cloud, and air-gapped deployments; standalone collab process; queue infrastructure; storage; database / migrations; observability; backup / restore; upgrade and release management.

## Epic 24.1 — Local Development Environment

Documented in [`../engineering/getting-started.md`](../engineering/getting-started.md).

**Functional requirements.**
- One-command bring-up of Postgres + Redis (Docker-Compose)
- `pnpm install` + `pnpm run dev` runs both apps
- Vite proxies `/api`, `/socket.io`, `/collab` to the backend
- Email driver `log` for dev (no real email sent)

## Epic 24.2 — Self-Hosted Deployment

See [`../deployment/self-hosted.md`](../deployment/self-hosted.md).

**Acceptance.**
- Single-host deployment works with Postgres + Redis
- Docker / Docker-Compose supported
- Multi-instance horizontal scaling supported (no sticky sessions needed)

## Epic 24.3 — Air-Gapped Deployment

`Feature` Business+. See [`../deployment/air-gapped.md`](../deployment/air-gapped.md).

**Functional requirements.**
- No outbound internet required
- Local AI provider (Ollama / OpenAI-compat)
- Internal SMTP relay
- Offline license validation
- Self-hosted Draw.io optional
- Telemetry off

## Epic 24.4 — Background Jobs & Queue Infrastructure

10 BullMQ queues, 26+ job constants. See [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md), [`../engineering/queues-and-jobs.md`](../engineering/queues-and-jobs.md).

**Acceptance.**
- Workers run in-process by default
- Can be split into dedicated worker processes
- Failed jobs retried with exponential backoff
- Stalled jobs detected via lock timeout

## Epic 24.5 — Storage & File Infrastructure

### Feature 24.5.1 — Storage drivers
`local` · `s3` · `azure`. Multi-instance requires `s3` or `azure`.

### Feature 24.5.2 — Attachment lifecycle
Upload → metadata stored → optional indexing → linked from page → optional cleanup on page delete.

## Epic 24.6 — Database & Migrations

See [`../engineering/database-and-migrations.md`](../engineering/database-and-migrations.md).

**Functional requirements.**
- Postgres 14+ with `unaccent`
- Kysely as type-safe builder
- Codegen produces `db.d.ts`
- Migration up/down/latest/codegen commands
- 43+ migrations at writing

## Epic 24.7 — Observability & System Health

**Health endpoints.**
- `GET /api/health` — aggregated Postgres + Redis health
- `GET /api/version` — build version

**Logging.**
- `LOG_HTTP=true` for request logging
- `DEBUG_DB=true` for SQL queries
- `DEBUG_MODE=true` for verbose logs

**Recommended adds.**
- Bull-Board for queue inspection
- APM (Datadog, OpenTelemetry, …)
- Audit log → SIEM tap (custom queue worker)

## Epic 24.8 — Backup, Restore & Disaster Recovery

**Postgres** is the only stateful service holding business data.
- Logical (`pg_dump`) or physical (WAL archive) backups
- Tested restore process
- RPO / RTO targets per deployment SLA

**Redis** is transient — losing it loses queued jobs and pending real-time messages, but no business data.

**Storage** — back up the bucket per cloud-provider best practice.

## Epic 24.9 — Upgrade & Release Management

**Functional requirements.**
- Pull new image → roll instances
- Migrations run on container boot
- Forward-compatible schema changes only
- Two-phase migrations for breaking schema changes
- Audit log + queue dashboard during rollout

## Cross-references

- Engineering: [`../engineering/getting-started.md`](../engineering/getting-started.md), [`../engineering/database-and-migrations.md`](../engineering/database-and-migrations.md), [`../engineering/queues-and-jobs.md`](../engineering/queues-and-jobs.md)
- Deployment: [`../deployment/self-hosted.md`](../deployment/self-hosted.md), [`../deployment/cloud.md`](../deployment/cloud.md), [`../deployment/air-gapped.md`](../deployment/air-gapped.md), [`../deployment/environment-variables.md`](../deployment/environment-variables.md)
- Architecture: [`../architecture/overview.md`](../architecture/overview.md)
