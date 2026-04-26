# Audit Logs

> **EE-only.** Audit infrastructure (interceptor, service, migrations) ships in OSS, but the admin UI and the full event coverage are in the EE submodule. To enable, build with the EE submodule pulled.

`Feature.AUDIT_LOGS` (Enterprise, self-hosted). Every sensitive action in the workspace is recorded.

For the complete event catalogue, see [`../reference/audit-events.md`](../reference/audit-events.md).

## Where it lives

**Settings → Audit Log.**

Visible to **owners** on **self-hosted** workspaces. Cloud workspaces don't currently surface the audit log through this UI (the data is captured but the surfacing is policy-controlled).

## What's tracked (22 categories)

A high-level summary — full list in the reference doc:

- **Workspace** — created, updated, invitation lifecycle
- **User** — created, deleted, login, logout, role change, password reset, deactivation
- **API Keys** — created, updated, deleted
- **Space** — created, updated, deleted, member changes
- **Group** — created, updated, deleted, member changes
- **Comments** — created, updated, deleted, resolved, reopened
- **Pages** — created, trashed, deleted, restored, moved, duplicated
- **Page Permissions** — restricted, unrestricted, permissions added/removed
- **Page Verification** — created, updated, removed, verified, approval requested/rejected, marked obsolete
- **Sharing** — share created, deleted
- **Import / Export** — page imported / exported, space exported
- **SSO** — provider created / updated / deleted
- **MFA** — enabled / disabled / backup-code generated
- **License** — activated / removed
- **Attachments** — uploaded

## Reading an audit row

```
event:        PAGE_RESTRICTED
actor:        alice@example.com (user)
resource:     page "Q4 Roadmap" (page-id)
space:        "Product"
when:         2026-04-26 14:32:11 UTC
ip:           203.0.113.42
changes:
  before:     { restricted: false }
  after:      { restricted: true, scope: "specific" }
metadata:     { added_users: ["bob@example.com"] }
```

The `changes` field captures *what* changed. The `metadata` field captures contextual extras (recipient lists, comment IDs, etc.).

## Filtering

The audit log supports filtering by:

- **Event type** — pick from the 22 categories or specific events
- **Actor** — by user, system, or API key
- **Date range** — start / end
- **Space** — events scoped to a particular space
- **Resource ID** — chase a single page or user across all events

For a forensic investigation, combine: *"all PAGE_RESTRICTED events on space X by user Y in the last 30 days."*

## Retention

Configurable per workspace.

- **Default:** indefinite (no auto-cleanup).
- **Settings → Audit Log → Retention** — set a number + unit (days / months / years).
- The `AUDIT_CLEANUP` job on `AUDIT_QUEUE` deletes rows past the retention window once per day.

Audit-log retention is a separate setting from **trash retention** (which deletes old trashed pages). See [`./retention.md`](./retention.md).

## Exporting (planned)

Audit-log export to CSV / JSON is on the roadmap. Today, you can paginate the API:

```
POST /audit
  body: { cursor, limit, eventType, actorId, spaceId, dateFrom, dateTo }
```

For long-term archival (regulated industries), consider a queue worker that pushes events to your SIEM in real time. The audit pipeline is queue-based, so adding a SIEM tap is straightforward.

## Common runs

### Compliance check: who accessed page X?

The audit log records *changes* and *creation events*, not reads. **Read-access** auditing is not currently captured — most regulated frameworks accept this distinction (mutation auditing is the bar). If you need read-tracking, that's a custom requirement.

### Investigation: who deleted this page?

`PAGE_TRASHED` and `PAGE_DELETED` carry actor and resource IDs.

### Compliance check: SSO setting drift?

Filter by `SSO_PROVIDER_*` events.

### Off-boarding: anomaly detection

Filter by deactivated user as actor in the 30 days before deactivation. Look for unusual creates / shares / exports.

## API

```
POST  /audit                 List events (paginated, filterable)
POST  /audit/retention       Get retention policy
POST  /audit/retention/update  Update retention
```

## Related

- Full event catalogue: [`../reference/audit-events.md`](../reference/audit-events.md)
- Retention model: [`./retention.md`](./retention.md)
- Architecture: [`../architecture/backend.md`](../architecture/backend.md) (audit integration)
