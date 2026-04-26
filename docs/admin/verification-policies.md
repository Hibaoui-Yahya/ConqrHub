# Page Verification Policies

> **EE-only.** The `page_verifications` table ships in OSS, but the verification workflow (notifications, expiry jobs, QMS approval, admin UI) is implemented in the EE submodule. To enable, build with the EE submodule pulled.

`Feature.PAGE_VERIFICATION` (Enterprise). Two modes — **expiring verification** and **QMS approval** — pick per page or per workspace policy.

## Why verify pages

Some content has a half-life — a runbook from 2022 may be actively wrong by 2026. Verification gives you a way to:

- Mark pages as "currently trustworthy" — `verified` status.
- Make verification expire on a cadence — forces re-review.
- Require formal approval for regulated content — QMS workflow.
- Surface stale and unreviewed content for cleanup.

## Mode 1 — Expiring verification

A page is verified for a window. Before the window closes, designated verifiers are notified. After it closes, the page transitions to `expired` and (typically) shows a banner to readers.

### Flow

```
Page authored → Set up verification (period or fixed date)
   → Verifier reviews → Mark verified
      → Time passes → status: verifying
      → Pre-expiration warning → notification
      → Expiration date → status: expired → notification
      → Verifier re-reviews → status: verified again
```

### Periods

`period` — re-verify every N units (days / weeks / months / years) from last verification. Common: 90 days for runbooks, 1 year for policies.

`fixed` — re-verify by a specific date. Common: regulatory pages tied to a known review date.

`indefinite` — set initially, no auto-expiration. The verifier can manually mark obsolete or update.

### Use cases

- Production-deployment runbooks
- Security policies
- HR policies
- Compliance procedures
- Customer-facing API docs

## Mode 2 — QMS approval

Quality Management System workflow. The author **submits** the page; a designated **verifier** reviews and approves or rejects. Rejection captures a reason. Approved pages are `verified`.

### Flow

```
Author drafts → submit-for-approval → status: in_approval
                                        → notification to verifiers
   verifier approves → status: verified (and optionally also expiring after N units)
   verifier rejects  → status: rejected (with rejection_comment)
                       → notification to author
```

### Use cases

- Aerospace / automotive engineering documentation
- Regulated industries (FDA, ISO 9001, ISO 13485)
- Customer contracts / SOWs
- Anything where a wrong-but-approved doc has real consequences

## Setting up

### Per-page

1. Open the page → menu → **Verification → Set up**.
2. Choose mode: **Expiring** or **QMS**.
3. For Expiring: set period or fixed date.
4. Add **verifiers** — users who can verify / approve. One can be designated **primary**.
5. Save.

Audit events: `PAGE_VERIFICATION_CREATED`, `_UPDATED`, `_REMOVED`.

### Workspace policy

**Settings → Verified Pages → Default policy** (admins / knowledge managers).

- Default expiration period for new verified pages
- Default verifiers (or default rule: "page owner + space admins")
- Pre-expiration warning lead time

## Status reference

For the full enum, see [`../reference/status-codes.md`](../reference/status-codes.md). Key states:

- `none` — verification not set up
- `in_approval` — submitted, awaiting verifier
- `verified` — currently valid
- `expiring` — within warning window
- `expired` — past due, needs re-verification
- `rejected` — QMS rejected, has comment
- `obsolete` — explicitly marked out of date

## Notifications

| Event | Recipients |
|---|---|
| Approval requested | Verifiers |
| Approval approved | Author |
| Approval rejected | Author (with comment) |
| Verification expiring | Verifiers + page owner |
| Verification expired | Verifiers + page owner |

Templates live in `apps/server/src/integrations/transactional/emails/`.

## Reading a verified page

When `Feature.PAGE_VERIFICATION` is active, viewers see a status badge:

- **Green "Verified"** — within the window.
- **Yellow "Verifying"** — pre-expiration warning.
- **Red "Expired"** — past the window. Banner urges re-verification.
- **Grey "Obsolete"** — marked obsolete.

Outdated pages are *not* automatically hidden from search; they're surfaced with a warning. (A future setting will allow hiding.)

## Bulk operations

**Settings → Verified Pages** lists every page with a verification record. Filter by status, space, verifier. From here:

- Bulk re-verify (admin override)
- Bulk mark obsolete
- Export the verified-pages list

## Best practices

- **Start with critical content** — runbooks, security policies, top customer-facing docs.
- **Don't verify everything** — verification debt is real. Each verified page is a recurring obligation.
- **Use Expiring for "still current?" reviews** and **QMS for "approve before publishing"**.
- **Designate primary verifiers** — single point of accountability.
- **Watch the dashboard weekly** — the cost of expired-and-ignored pages compounds.

## Permissions

- Setting up / removing verification: Space admin (or workspace admin).
- Verifying / approving: only the designated verifiers (or workspace admins as override).
- Rejecting: only the designated verifiers.
- Mark obsolete: space admin.

Audit events for all of the above. See [`../reference/audit-events.md`](../reference/audit-events.md).

## Related

- Status codes: [`../reference/status-codes.md`](../reference/status-codes.md)
- Architecture (queue jobs that drive expiration): [`../architecture/backend.md`](../architecture/backend.md)
- PRD: [`../prd/11-review-verification-governance.md`](../prd/11-review-verification-governance.md)
