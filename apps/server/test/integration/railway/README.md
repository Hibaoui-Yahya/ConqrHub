# Railway security-lab harness (ConqrHub, Phase 0C)

Runs the real HTTP + PostgreSQL + Redis integration suite in `apps/server/test/integration`
(F27 MCP token audience, F28 suite-IdP client secret + throttle, F29 logout revocation) inside a
Linux container built by Railway from an exact commit. GitHub is used for review only; nothing in
this directory is a GitHub Actions workflow.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Test image: `node:22-slim` + `pnpm@10.4.0` (the production pins), dependency layer first (cached), frozen install, builds `@docmost/editor-ext` and `@conqr/conqrplan-core`, runs the script below. Never a production image. |
| `run-security-tests.sh` | Guards (refuses to run outside `conqr-security-lab` / `security-lab`, refuses non-private DB/Redis hosts), waits for Redis, runs `migration:latest` on the throwaway database, runs `pnpm run test:integration`, scans the captured Jest output for minted tokens, writes `test/integration/result.json`, exits with the Jest exit code. |
| `.gitattributes` | Forces LF for this directory (Windows checkouts use `core.autocrlf`). |

## Isolation model

- Dedicated Railway project `conqr-security-lab`, environment `security-lab`, created empty (never
  duplicated from another environment). Services: `postgres-test` (`pgvector/pgvector:pg18`, the
  image `docker-compose.yml` uses), `redis-test` (`redis:8`), `hub-security-test` (this image).
- No public domains. The runner only accepts `*.railway.internal` hosts for `DATABASE_URL` and
  `REDIS_URL`.
- Synthetic configuration only: a freshly generated random `APP_SECRET`, `APP_URL=http://hub.test`,
  `MAIL_DRIVER=smtp` pointed at an unreachable local port, `STORAGE_DRIVER=local`, `DISABLE_TELEMETRY=true`, `NODE_ENV=test`. No
  production variable, database, Redis, bucket, mail credential, OIDC client or domain is ever
  referenced. `SUITE_IDP_CLIENTS` is set by the F28 spec itself with test-only values.

## Service variables (`hub-security-test`)

| Variable | Value |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `apps/server/test/integration/railway/Dockerfile` |
| `DATABASE_URL` | reference to the `postgres-test` private URL |
| `REDIS_URL` | reference to the `redis-test` private URL |
| `APP_URL` | `http://hub.test` |
| `APP_SECRET` | random test value generated for the lab (never reused, never printed) |
| `STORAGE_DRIVER`, `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `DISABLE_TELEMETRY`, `NODE_ENV` | `local`, `smtp`, `127.0.0.1`, `2525` (nothing listens; `log` is not an accepted driver), `true`, `test` |
| `HARNESS_GIT_SHA` | the exact commit being deployed (set before each `railway up`) |
| `HOLD_SECONDS` | optional; keeps the container alive after the run so `result.json` can be read over `railway ssh` |
| `RUN_UNIT_SPECS` | optional; space-separated Jest path patterns run with `pnpm exec jest --ci` before the integration suite (exit code reported as `unit_exit`) |

Restart policy for the service must be `NEVER` (a finished test run is not a crash to retry).

## Per-deployment procedure

1. `git status --porcelain` empty; record `git rev-parse HEAD`.
2. `railway status --json` — abort unless project `conqr-security-lab`, environment `security-lab`.
3. `railway variable set HARNESS_GIT_SHA=<sha> --service hub-security-test --environment security-lab --skip-deploys`
4. `railway up --ci --service hub-security-test --environment security-lab` from the repository root.
5. `railway deployment list --service hub-security-test --environment security-lab --json` — record the deployment id and status.
6. `railway logs <deployment-id> --deployment --service hub-security-test --environment security-lab --lines 5000` — capture; redact before publishing.
7. Read the `HARNESS_RESULT jest_exit=<n> leak_scan=<pass|fail>` line. `jest_exit=0` on a
   `railway-verify/<finding>` branch is the gate; a non-zero exit on `main` is the expected
   regression demonstration.

## Jest configuration notes

- `moduleFileExtensions` includes `tsx` (the transactional e-mails are `.tsx`).
- ESM-only runtime dependencies (`openid-client`, `oauth4webapi`, `jose`, `marked`, `happy-dom`, `@sindresorhus/slugify`, …) are transformed to CommonJS by ts-jest via `transformIgnorePatterns` with a dedicated `tsconfig.json` (`allowJs`). The production build runs them natively (Node 22 `require(esm)`); Jest's CommonJS runtime cannot.
- `image-dimensions` is mapped to the same stub the unit suite uses (ESM-only, unrelated to authentication). No product module is mocked.

## Local equivalent (no Railway)

With a local PostgreSQL (pgvector) and Redis: set the variables above (`DATABASE_URL`/`REDIS_URL`
pointing at them), then from `apps/server`: `pnpm run migration:latest && pnpm run test:integration`.
