# PRD 25 — Non-Functional Requirements

> **Source:** PA 25, lines 10007–10252.

## Area overview

Cross-cutting requirements that don't fit a single feature: security posture, performance targets, reliability / resilience, accessibility.

## Epic 25.1 — Security Requirements

- **Authentication** — JWT cookies (HttpOnly, Secure, SameSite=Lax); SSO; MFA enforceable.
- **Authorization** — server-side first; permission filter at retrieval time, not post-filter.
- **Tenant isolation** — every query scoped by `workspace_id`.
- **Secrets** — `APP_SECRET` ≥ 32 chars; license public key for self-hosted; Stripe webhook secret for cloud.
- **Cookies + headers** — `HttpOnly`, `Secure`, `SameSite=Lax`. CSP, HSTS, X-Frame-Options recommended at the proxy.
- **Rate limiting** — `throttle` integration with per-route guards.
- **Input validation** — Zod / class-validator on all DTOs.
- **Audit** — every sensitive change logged.
- **Pen testing** — annual third-party assessment recommended for Enterprise customers.

## Epic 25.2 — Performance Requirements

### Latency targets

| Surface | Target (P95) |
|---|---|
| Page load (cached) | < 200 ms |
| Page editor open | < 1 s |
| Save / autosave round-trip | < 500 ms |
| Search query | < 200 ms (PG), < 100 ms (Typesense) |
| AI Search first token | < 2 s |
| AI Chat first token | < 2 s |
| Public-share page render | < 500 ms |

### Scale targets

| Dimension | Target |
|---|---|
| Workspaces per cluster | 10,000+ |
| Pages per workspace | 1,000,000+ |
| Concurrent collaborators per page | 50+ |
| Queue throughput | 1,000 jobs/sec sustained |

## Epic 25.3 — Reliability & Resilience

- **Availability target** — 99.9% (Cloud); self-hosted as good as the operator
- **Graceful degradation** — Redis down → real-time stops, REST works
- **Circuit breakers** — for external AI providers
- **Idempotent jobs** — see [`../engineering/queues-and-jobs.md`](../engineering/queues-and-jobs.md)
- **Health checks** — Kubernetes-style liveness + readiness on `/api/health`
- **Backups** — automated, tested restore

## Epic 25.4 — Accessibility

WCAG 2.1 AA target.

- Keyboard navigability throughout
- Screen-reader compatibility on the editor + page tree + comments
- Sufficient color contrast (Mantine theme primitives meet AA)
- Reduced-motion respected
- Captions on video embeds
- Alt text on images

## Epic 25.5 — Internationalization

- UI strings externalized (react-i18next)
- Right-to-left layout (planned)
- Locale-aware date / time formatting
- Crowdin pipeline for community translations

## Epic 25.6 — Privacy

- GDPR-respecting user deletion
- Data export (planned full workspace export)
- Per-region data residency (cloud roadmap)
- AI provider routing for sensitive workspaces

## Cross-references

- Architecture: [`../architecture/overview.md`](../architecture/overview.md)
- Permissions: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Deployment: [`../deployment/`](../deployment/README.md)
