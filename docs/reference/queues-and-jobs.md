# Queues & Jobs Reference

Background work runs on **BullMQ** (Redis-backed). Queue names and job constants are defined in `apps/server/src/integrations/queue/constants/queue.constants.ts`. Processors live alongside their feature module.

## Queues

| Queue | Purpose |
|---|---|
| `EMAIL_QUEUE` | Outbound email — invitation, notifications, password reset, page-update digest, …|
| `ATTACHMENT_QUEUE` | Attachment processing (resize, text extraction for indexing) |
| `GENERAL_QUEUE` | Mixed-bag long-running tasks: PDF export, verification reminders, reconciliation |
| `BILLING_QUEUE` | Stripe webhook handling, seat-count sync, trial-ended events (cloud) |
| `FILE_TASK_QUEUE` | Large file workflows — bulk imports (Notion / Confluence ZIP) |
| `SEARCH_QUEUE` | Index pages and comments into the search backend |
| `AI_QUEUE` | AI generation, embedding indexing |
| `HISTORY_QUEUE` | Page-history snapshot persistence |
| `NOTIFICATION_QUEUE` | In-app + email notification delivery |
| `AUDIT_QUEUE` | Audit-event persistence and retention cleanup |

Total: **10 queues**.

## Jobs (selected)

> The catalogue below lists the named job constants the codebase uses. Each constant is a string passed to `queue.add(JOB_NAME, payload)` and matched in the corresponding processor.

### Email (`EMAIL_QUEUE`)
- `SEND_EMAIL` — generic send
- `WELCOME_EMAIL` — first-login email
- `FIRST_PAYMENT_EMAIL` — Stripe upgrade trigger

### Pages
- `PAGE_CREATED`
- `PAGE_CONTENT_UPDATED`
- `PAGE_MOVED_TO_SPACE`
- `PAGE_DELETED`
- `PAGE_HISTORY` (on `HISTORY_QUEUE`) — write a snapshot row

### Search (`SEARCH_QUEUE`)
- `SEARCH_INDEX_PAGE` — re-index a single page
- `SEARCH_INDEX_COMMENT` — re-index a comment
- `SEARCH_REMOVE_PAGE` — drop from index on delete

### Notifications (`NOTIFICATION_QUEUE`)
- `COMMENT_NOTIFICATION` — new comment / reply
- `PAGE_MENTION_NOTIFICATION` — `@user` in a page
- `PAGE_UPDATE_DIGEST` — periodic digest of changes to watched pages

### Billing (`BILLING_QUEUE`)
- `STRIPE_SEATS_SYNC` — bring local seat count in line with Stripe
- `TRIAL_ENDED` — convert or downgrade

### File tasks (`FILE_TASK_QUEUE`)
- `IMPORT_TASK` — process a queued bulk-import job (Confluence / Notion ZIP)

### Audit (`AUDIT_QUEUE`)
- `AUDIT_LOG` — persist an event row
- `AUDIT_CLEANUP` — delete rows past retention

### General (`GENERAL_QUEUE`)
- `PDF_EXPORT_TASK` — render a page / space to PDF via Gotenberg
- `PDF_EXPORT_CLEANUP` — delete temporary PDF artifacts
- `PAGE_VERIFICATION_EXPIRING` — pre-expiration notification
- `PAGE_VERIFICATION_EXPIRED` — post-expiration handling (status transition)
- `VERIFICATION_RECONCILE` — periodic reconciliation of verification states

### AI (`AI_QUEUE`)
- AI work units for indexing and generation tasks (specific names live in EE).

---

## Operational notes

- **Defaults:** BullMQ runs workers in the same process as the API by default. Heavy deployments separate them.
- **Retries:** Defaults are 3 attempts with exponential backoff. Per-job overrides exist where appropriate (PDF export and email are aggressive about retries; audit logging is not — it's append-only and a single failure should not snowball).
- **Idempotency:** Search-index jobs are idempotent (overwrite). Email jobs are best-effort; the system does not guarantee exactly-once delivery.
- **Observability:** Failed jobs are visible via Bull dashboards (Bull-Board, etc.) when wired up. Recommended for production.

For the audit-event constants, see [`./audit-events.md`](./audit-events.md).
For the notification types, see [`./notification-events.md`](./notification-events.md).
