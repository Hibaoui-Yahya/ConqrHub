# Retention Policies

> **EE-only.** Retention enforcement (BullMQ jobs and admin UI) is implemented in the EE submodule. To enable, build with the EE submodule pulled.

`Feature.RETENTION` (Enterprise). Automatic deletion of stale data after a configurable window.

## What can be retained / auto-deleted

| Data | Setting | Default |
|---|---|---|
| **Trashed pages** | Trash retention | Indefinite (manual purge only) |
| **Audit-log rows** | Audit retention | Indefinite |
| **AI chat history** | (planned) | — |
| **Attachments orphaned from deleted pages** | (planned) | — |
| **Export artifacts** | Internal cleanup | After download window (fixed) |

## Trash retention

**Settings → Security & SSO → Trash retention** (when `Feature.RETENTION` is active).

- Set a number + unit: days, months, or years.
- The `GENERAL_QUEUE` runs a daily cleanup that hard-deletes pages whose `deleted_at` is past the window.
- Children of trashed parents are deleted with them.
- **Restoring** is impossible after hard delete — the data is gone.

Audit event: page hard deletion is not recorded individually (high volume); the cleanup job logs an aggregate.

## Audit-log retention

**Settings → Audit Log → Retention** (when `Feature.AUDIT_LOGS` is active).

- Same shape: number + unit.
- The `AUDIT_CLEANUP` job runs daily.
- For regulated workloads, set a long window (e.g. 7 years) — match your compliance framework.

## Why retention matters

Three reasons organizations care:

1. **Compliance.** Some frameworks require "no more than necessary" retention.
2. **Forensics.** Other frameworks require *minimum* retention.
3. **Storage cost.** Audit logs and trash grow without bound otherwise.

The product gives you the levers; the right values depend on your compliance posture.

## Recommended defaults by industry

| Posture | Trash | Audit |
|---|---|---|
| **Lean / startup** | 90 days | 1 year |
| **Standard SaaS** | 1 year | 2 years |
| **Regulated (SOX, ISO 27001)** | 2 years | 7 years |
| **Highly regulated (HIPAA, PCI)** | Per legal | 7+ years |
| **Legal hold in effect** | Indefinite | Indefinite |

## Legal hold (planned)

A flag on a page or audit row that **overrides** retention. Coming on the roadmap. Today, the workaround is to leave retention `indefinite` for the period of the hold and tighten it again afterward.

## Operational notes

- **Cleanup is asynchronous.** Setting the retention window doesn't immediately delete; it takes effect on the next daily run.
- **Cleanup is logged.** The job logs counts at start and end; failures alert via standard queue alerting.
- **Retention is per-workspace.** Different workspaces in cloud get different windows.

## Related

- Audit-log day-to-day: [`./audit-logs.md`](./audit-logs.md)
- Queue-based cleanup mechanics: [`../engineering/queues-and-jobs.md`](../engineering/queues-and-jobs.md)
- Architectural context: [`../architecture/backend.md`](../architecture/backend.md)
