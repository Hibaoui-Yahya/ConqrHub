# Engineering

*Audience: Engineers working on the code day-to-day.*

Everything you need to clone, run, build, debug, test, and ship changes.

## Contents

- [`getting-started.md`](./getting-started.md) — Clone, install, configure `.env`, run dev mode, common pitfalls.
- [`repository-layout.md`](./repository-layout.md) — A guided tour of the monorepo: `apps/`, `packages/`, where each thing lives.
- [`database-and-migrations.md`](./database-and-migrations.md) — Kysely, migration commands, type codegen, repo pattern.
- [`queues-and-jobs.md`](./queues-and-jobs.md) — BullMQ queues, processors, job constants, retry strategy.
- [`testing.md`](./testing.md) — Jest unit + e2e, what's covered, how to add a test.
- [`adding-a-feature.md`](./adding-a-feature.md) — End-to-end recipe: backend module → migration → frontend feature → feature flag → audit event.

## Conventions

- **Path aliases** — `@/*` on the client, `@docmost/db/*` / `@docmost/transactional/*` / `@docmost/ee/*` on the server.
- **Lint** — `pnpm lint` (per app). ESLint with `--fix`.
- **Format** — `pnpm format` (per app). Prettier.
- **Commits** — Conventional Commit style (`feat:`, `fix:`, `chore:`, …) is used by recent history.
- **Branching** — feature branches, PR into `main`.

## Related

- For *what* to build (specs), see [`../prd/`](../prd/README.md).
- For *system design* context, see [`../architecture/`](../architecture/README.md).
- For *exact* APIs/flags, see [`../reference/`](../reference/README.md).
