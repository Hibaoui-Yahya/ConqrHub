# PRD 15 — Audit and Compliance

> **Source:** PA 15, lines 4906–5087. Admin runbook: [`../admin/audit-logs.md`](../admin/audit-logs.md), [`../admin/retention.md`](../admin/retention.md).

## Area overview

Three subsystems: **audit logs**, **retention controls**, and the **admin console** that surfaces both.

## Epic 15.1 — Audit Logs

`Feature.AUDIT_LOGS` (Enterprise).

### Feature 15.1.1 — Comprehensive audit trail

**User stories.**
- As a compliance officer, I want every sensitive action logged.
- As a security lead, I want filterable forensic queries.
- As an owner, I want anomaly visibility.

**Acceptance criteria.**
- Every covered action emits an audit row.
- Rows cannot be edited or deleted (except via retention).
- Filters by event, actor, date, space, resource.
- Owner-only access on self-hosted.

**Tracked categories (22).**
Workspace · User · API Keys · Space · Group · Comments · Pages · Page Permissions · Page Verification · Shares · Import/Export · SSO · MFA · License · Attachments. Full list: [`../reference/audit-events.md`](../reference/audit-events.md).

**Row shape.**
```ts
interface IAuditLog {
  id: string;
  workspaceId: string;
  actorId?: string;
  actorType: 'user' | 'system' | 'api_key';
  event: string;
  resourceType: string;
  resourceId?: string;
  spaceId?: string;
  changes?: { before?: any; after?: any };
  metadata?: any;
  ipAddress?: string;
  createdAt: string;
}
```

**Filters.**
- By event type (or category)
- By actor
- By date range (start / end)
- By space
- By resource ID

## Epic 15.2 — Retention Controls

`Feature.RETENTION` (Enterprise).

### Feature 15.2.1 — Configurable retention windows

**Functional requirements.**
- Trash retention (days / months / years)
- Audit-log retention (days / months / years)
- AI chat retention (planned)
- Attachment retention (planned)
- Export retention (fixed internal cleanup)
- Legal hold (planned)

**Mechanism.**
- `AUDIT_CLEANUP` job on `AUDIT_QUEUE` (audit log)
- Daily cleanup job on `GENERAL_QUEUE` (trash)
- Cleanup is logged but not per-row audited (high volume)

## Epic 15.3 — Admin Console

A single place to monitor compliance posture:
- Pending verifications
- Stale audit-event categories (e.g. no SSO changes in 90 days as a healthy signal)
- Pending invitations
- High-risk shares (no expiration, no password)
- API keys without expiration
- Recent privilege escalations

(Some of this lives in Settings → Audit Log; the consolidated console is a planned roadmap item.)

## Cross-references

- Reference: [`../reference/audit-events.md`](../reference/audit-events.md)
- Admin: [`../admin/audit-logs.md`](../admin/audit-logs.md), [`../admin/retention.md`](../admin/retention.md)
- Queues: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md)
