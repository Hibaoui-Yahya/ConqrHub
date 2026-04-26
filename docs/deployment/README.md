# Deployment

*Audience: DevOps, IT, anyone responsible for running ConqrAI Wiki in production.*

How to deploy and operate ConqrAI Wiki — single-host, cloud, or air-gapped. All required and optional dependencies, and every environment variable.

## Contents

- [`self-hosted.md`](./self-hosted.md) — Docker / Docker-Compose, Postgres + Redis requirements, optional Typesense / Gotenberg / S3 / SMTP.
- [`cloud.md`](./cloud.md) — Cloud-mode specifics: Stripe billing, plan-based feature resolution, managed services.
- [`air-gapped.md`](./air-gapped.md) — Running without internet access, local AI providers, telemetry off, license validation.
- [`environment-variables.md`](./environment-variables.md) — Every supported env var, what it controls, defaults, examples.

## Required infrastructure (minimum)

- **Node.js** 18+
- **PostgreSQL** 14+ (with the `unaccent` extension for search)
- **Redis** 6+ (used for queues, real-time pub/sub, websocket adapter)

## Optional infrastructure

| Service | What it powers | Configuration |
|---|---|---|
| **Typesense** | Faster search with typo tolerance | `STORAGE_DRIVER`, Typesense env vars |
| **Gotenberg** | Server-side PDF export | `GOTENBERG_URL` |
| **S3-compatible storage** | Attachment storage outside the server filesystem | `STORAGE_DRIVER=s3`, S3 env vars |
| **SMTP / Postmark** | Outbound email (notifications, invites) | `MAIL_DRIVER` |

## Related

- Environment variables also documented in repo `.env.example`.
- For the EE license model, see [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md).
