# Getting started

From clone to running app in 10 minutes.

## Prerequisites

- **Node.js 18+** (the repo uses ES2022 features and modern TS)
- **pnpm** (the monorepo is configured for pnpm; npm and yarn are not supported)
- **Docker + Docker-Compose** (for Postgres and Redis)
- **Git**

Verify:

```bash
node -v        # should be ≥ 18
pnpm -v
docker -v
```

## Clone

```bash
git clone https://github.com/<your-fork>/conqrai-wiki.git
cd conqrai-wiki
```

The repo references a private EE submodule at `apps/server/src/ee/`. If you don't have access, that's fine — the directory will be empty and the app will boot in **free tier**. See [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md).

## Install dependencies

```bash
pnpm install
```

## Bring up infrastructure

Postgres + Redis via the included compose file:

```bash
docker-compose up -d db redis
```

This brings up:
- **PostgreSQL** on `:5432` (database `docmost`, user `docmost`)
- **Redis** on `:6379`

Optionally also:
- `typesense` for the Business-tier Typesense driver
- `gotenberg` for PDF export

## Configure environment

```bash
cp .env.example .env
```

Open `.env` and at minimum set:

| Var | Why |
|---|---|
| `APP_URL` | Public URL — for links in emails |
| `APP_SECRET` | ≥ 32 chars; signs JWTs and license verifications |
| `DATABASE_URL` | Defaults to the Docker compose Postgres |
| `REDIS_URL` | Defaults to the Docker compose Redis |
| `STORAGE_DRIVER` | `local` for development |
| `MAIL_DRIVER` | `log` for development (no real email sent) |

For the full set, see [`../deployment/environment-variables.md`](../deployment/environment-variables.md).

## Run migrations

```bash
cd apps/server
pnpm migration:latest
cd ../..
```

## Start dev servers

In one terminal:

```bash
pnpm run dev
```

This starts the **frontend** at `http://localhost:5173` and the **backend** at `http://localhost:3000` in watch mode. The Vite dev server proxies `/api`, `/socket.io`, and `/collab` to the backend, so you can browse to `http://localhost:5173`.

If you prefer them separately:

```bash
pnpm run client:dev      # frontend only
pnpm run server:dev      # backend only
```

## Create your first workspace

Visit `http://localhost:5173`, sign up, and you have a workspace. The first user becomes Owner.

## Common pitfalls

| Symptom | Cause / fix |
|---|---|
| `unaccent` extension errors on first migration | Run `CREATE EXTENSION IF NOT EXISTS unaccent;` against your Postgres database. The compose file does this automatically; bare-metal Postgres needs it manually. |
| `EE module not loaded` log on startup | Expected if you don't have access to the submodule. The app runs in free tier. |
| Email codes not delivered | `MAIL_DRIVER=log` writes to console; switch to `smtp` or `postmark` and configure credentials to actually send. |
| Vite errors about `/api` 404 | Server isn't running on port 3000, or your `.env` doesn't match. Check both processes. |
| Hocuspocus says auth failed | `APP_SECRET` differs between when the cookie was issued and now. Clear cookies and re-login. |

## Next steps

- Tour the repo: [`./repository-layout.md`](./repository-layout.md)
- Run the test suite: [`./testing.md`](./testing.md)
- Add a feature end-to-end: [`./adding-a-feature.md`](./adding-a-feature.md)
- Database workflow: [`./database-and-migrations.md`](./database-and-migrations.md)
