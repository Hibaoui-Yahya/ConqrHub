# Environment Variables

Authoritative list of every environment variable ConqrAI Wiki reads. The shipped `.env.example` is the source of truth for the OSS surface; this page adds the EE / cloud variables.

## Core

| Var | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public base URL — used in email links, public-share URLs, OAuth callbacks |
| `PORT` | `3000` | API server listen port |
| `APP_SECRET` | *(required)* | Min 32 chars. Signs JWT cookies, license signatures, share tokens. Generate with `openssl rand -hex 32`. |
| `JWT_TOKEN_EXPIRES_IN` | `90d` | JWT lifetime (Express `ms`-style or seconds) |

## Data plane

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string. Standard `postgresql://...` URL. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection — queues + WebSocket adapter |

## Storage

| Var | Default | Purpose |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` \| `s3` \| `azure` |
| `FILE_UPLOAD_SIZE_LIMIT` | `50mb` | Max upload size |

### S3 driver
| Var | Purpose |
|---|---|
| `AWS_S3_ACCESS_KEY_ID` | Access key |
| `AWS_S3_SECRET_ACCESS_KEY` | Secret |
| `AWS_S3_REGION` | Region |
| `AWS_S3_BUCKET` | Bucket name |
| `AWS_S3_ENDPOINT` | Custom endpoint for S3-compatible providers (Cloudflare R2, MinIO, …) |
| `AWS_S3_FORCE_PATH_STYLE` | `true` for MinIO-style hosts |

### Azure driver
Variables follow the standard Azure SDK: `AZURE_STORAGE_*`. (Wired through the Azure storage driver.)

## Email

| Var | Default | Purpose |
|---|---|---|
| `MAIL_DRIVER` | `smtp` | `smtp` \| `postmark` \| `log` |
| `MAIL_FROM_ADDRESS` | — | From address |
| `MAIL_FROM_NAME` | — | Display name |

### SMTP
| Var | Purpose |
|---|---|
| `SMTP_HOST` | Host |
| `SMTP_PORT` | Port (587 / 465 / 25) |
| `SMTP_USERNAME` | Username |
| `SMTP_PASSWORD` | Password |
| `SMTP_SECURE` | `true` for SSL on connect |
| `SMTP_IGNORETLS` | `true` to allow plain SMTP (dev only) |

### Postmark
| Var | Purpose |
|---|---|
| `POSTMARK_TOKEN` | Postmark server token |

### Log driver
No additional config. Emails are written to stdout — useful for development and tests.

## External services (optional)

| Var | Purpose |
|---|---|
| `DRAWIO_URL` | Custom Draw.io server (defaults to public Draw.io) |
| `GOTENBERG_URL` | Required for `Feature.PDF_EXPORT` (Business+) |
| `TYPESENSE_URL` | Required for the Typesense search driver (Business+) |
| `TYPESENSE_API_KEY` | Typesense admin/search key |

## Telemetry

| Var | Default | Purpose |
|---|---|---|
| `DISABLE_TELEMETRY` | `false` | Set to `true` to disable anonymous usage telemetry |

## Debug / logging

| Var | Default | Purpose |
|---|---|---|
| `DEBUG_MODE` | `false` | Enable verbose logging in production |
| `DEBUG_DB` | `false` | Log every SQL query (very noisy) |
| `LOG_HTTP` | `false` | Log every HTTP request |

## Cloud / billing (cloud-mode only)

| Var | Purpose |
|---|---|
| `CLOUD` | `true` puts the server in cloud mode (plan-based feature resolution, Stripe billing) |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Public key (front-end) |

## License (self-hosted EE)

| Var | Purpose |
|---|---|
| `LICENSE_PUBLIC_KEY` | Public key used to verify license signatures |

## AI providers (when `Feature.AI` enabled)

Provider config can be set via env vars or workspace settings. Env vars set the **default** for new workspaces.

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI |
| `OPENAI_API_URL` | OpenAI-compatible endpoint (Azure OpenAI, vLLM, LiteLLM, …) |
| `GEMINI_API_KEY` | Google Gemini |
| `OLLAMA_API_URL` | Local Ollama instance — recommended for air-gapped (defaults to `http://localhost:11434`) |

## SCIM (`Feature.SCIM`)

| Var | Purpose |
|---|---|
| `SCIM_BASE_URL` | The SCIM endpoint your IdP will hit (usually `https://<host>/api/scim/v2`) |
| `SCIM_BEARER_TOKEN` | Token shared with the IdP |

## Hocuspocus / collaboration

| Var | Purpose |
|---|---|
| `COLLAB_PORT` | Port for standalone collab server (when running `pnpm collab:dev` / `:prod`) |

## Server tuning

| Var | Purpose |
|---|---|
| `NODE_OPTIONS` | Standard Node options (`--max-old-space-size=...` for memory) |
| `BULL_PREFIX` | Prefix for BullMQ keys in Redis (lets you share Redis with other apps) |

## Dev-only

| Var | Purpose |
|---|---|
| `DEV_AUTO_LOGIN_EMAIL` | If set, auto-logs in on dev — for fast iteration |

---

## Setting variables

Local: `cp .env.example .env` and edit. Docker: pass via `-e` or compose `environment:`. Production: standard 12-factor config — env vars from the orchestrator.

## Checking what's set at runtime

Look at `apps/server/src/integrations/environment/` — the `EnvironmentService` is where every var is read. If you need to know whether a var has effect, that's the one place to grep.
