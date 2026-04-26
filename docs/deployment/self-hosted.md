# Self-hosted deployment

Run ConqrAI Wiki on your own infrastructure. Supported in all tiers (Community, Business, Enterprise).

## Architecture recap

A minimal deployment is **one container** plus Postgres and Redis. See [`../architecture/overview.md`](../architecture/overview.md) for the data plane.

## Prerequisites

| Component | Version | Notes |
|---|---|---|
| **Node.js** | 18+ | If running outside Docker |
| **PostgreSQL** | 14+ | With `unaccent` extension enabled |
| **Redis** | 6+ | Persistent or transient — used for queues and pub/sub |
| **Docker / Docker-Compose** | latest | Recommended deployment surface |

Optional:

| Component | When to add |
|---|---|
| **Gotenberg** | If you want server-side PDF export (Business+, requires `Feature.PDF_EXPORT`) |
| **Typesense** | For the Business-tier search driver |
| **S3-compatible storage** | For multi-instance deployments — local-disk storage doesn't share between replicas |
| **SMTP / Postmark** | For real email delivery |

## Quick start (Docker-Compose)

The repository includes `docker-compose.yml` for development (uses the legacy upstream image `docmost/docmost:latest` until a ConqrAI-branded image is published). For production, derive your own — build the image locally (see [Building the image](#building-the-image)) or pin the upstream tag:

```yaml
services:
  app:
    image: conqrai-wiki:latest   # locally built; or use docmost/docmost:latest
    ports:
      - "3000:3000"
    environment:
      APP_URL: https://wiki.example.com
      APP_SECRET: ${APP_SECRET}
      DATABASE_URL: postgresql://wiki:${DB_PASSWORD}@db:5432/wiki
      REDIS_URL: redis://redis:6379
      STORAGE_DRIVER: s3
      AWS_S3_BUCKET: wiki-attachments
      # ... see environment-variables.md
    depends_on: [db, redis]

  db:
    image: postgres:18
    environment:
      POSTGRES_USER: wiki
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: wiki
    volumes:
      - db-data:/var/lib/postgresql/data
    command: postgres -c shared_preload_libraries='unaccent'

  redis:
    image: redis:8
    command: redis-server --appendonly yes --maxmemory-policy noeviction
    volumes:
      - redis-data:/data

volumes:
  db-data:
  redis-data:
```

## Building the image

```bash
docker build -t conqrai-wiki:latest .
```

The repo includes a multi-stage `Dockerfile`. By default it builds the OSS bundle. If you have access to the EE submodule, set up your build pipeline to pull it before `docker build`.

## Running migrations

The container runs migrations on boot by default. To run them manually:

```bash
docker exec -it <container> pnpm --filter server migration:latest
```

## Reverse proxy

Place a TLS-terminating reverse proxy in front (Nginx, Caddy, Traefik, ALB, …). Required:

- WebSocket upgrade for `/socket.io` and `/collab`
- Long timeouts for SSE (`/api/ai/answers`, `/api/ai/chats/send`) — at least 60s, preferably no timeout

Sample Nginx snippet:

```nginx
location / {
    proxy_pass http://wiki:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;       # important for SSE
    proxy_read_timeout 600s;   # SSE / long collab connections
}
```

## Multi-instance scaling

The app scales horizontally **without sticky sessions**:

- Postgres handles the data layer.
- Redis handles real-time pub/sub (Socket.io adapter) and queues (BullMQ).
- Hocuspocus's Redis-sync extension fans out collaboration updates across instances.

To split out the collab process specifically:

```bash
pnpm run collab:prod   # starts Hocuspocus only, on COLLAB_PORT
```

Direct your reverse proxy to send `/collab` to the dedicated collab process.

## Storage

| Driver | When |
|---|---|
| `local` | Single-instance dev / small deployments |
| `s3` | Production / multi-instance |
| `azure` | Azure-hosted deployments |

Multi-instance must use `s3` or `azure` — local-disk attachments don't share across replicas.

## Email

Set `MAIL_DRIVER`. For dev: `log` writes to stdout. For staging: a dedicated test mailbox via SMTP. For production: `smtp` or `postmark`.

## Backups

- **Postgres** is the only stateful service that holds business data. Use logical (`pg_dump`) or physical (WAL archive) backups.
- **Redis** is transient — losing it loses queued jobs and pending real-time messages, but no data. Persistence (`AOF`) is recommended but not required.
- **Storage** — back up your S3 bucket / Azure container per cloud-provider best practice.

A point-in-time restore should target Postgres only.

## Upgrades

- **Pull** the new image.
- **Run migrations** (`migration:latest`) — the container does this on boot but you can run it ahead of cutover for big migrations.
- **Roll** instances. Stateless, so a rolling update works.
- **Watch** the audit log and queue dashboard during the rollout.

## Air-gapped considerations

If your environment has no outbound internet, see [`./air-gapped.md`](./air-gapped.md). In short:

- Use Ollama or a local OpenAI-compatible endpoint for AI.
- Use the `log` mail driver or an internal SMTP relay.
- License validation works offline.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| 500 on every request | App startup failed — check container logs for missing env vars |
| Auth works but real-time doesn't | Reverse proxy not upgrading WebSockets |
| AI Search streams cut off | SSE timeout — increase `proxy_read_timeout` |
| Migrations didn't run | `unaccent` extension missing on Postgres |
| EE features missing | EE submodule not in image; rebuild with submodule pulled |

## Related

- Cloud-mode (managed) deployment: [`./cloud.md`](./cloud.md)
- Air-gapped deployment: [`./air-gapped.md`](./air-gapped.md)
- All env vars: [`./environment-variables.md`](./environment-variables.md)
