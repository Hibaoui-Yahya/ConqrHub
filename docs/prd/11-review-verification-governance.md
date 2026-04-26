# PRD 11 — Review, Verification & Governance

> **Source:** lines 1092–1171.

## Area overview

`Feature.PAGE_VERIFICATION` (Enterprise). Two modes: **Expiring** (re-verify on a cadence) and **QMS** (formal approval). Admin runbook: [`../admin/verification-policies.md`](../admin/verification-policies.md).

## Epic 11.1 — Page Verification

### Feature 11.1.1 — Expiring verification

**User stories.**
- As a knowledge manager, I want pages to expire so re-review is forced.
- As a verifier, I want notifications before expiration so I can review on time.
- As a reader, I want a status indicator so I know if a page is current.

**Acceptance criteria.**
- Verification window configurable in days/weeks/months/years.
- Pre-expiration notification.
- Status transitions: `verified → expiring → expired`.
- Verifiers can re-verify.

**Functional requirements.**
Set up verification (period / fixed / indefinite) · Choose verifiers (one designated primary) · Pre-expiration notification · Mark verified · Mark obsolete.

**Status flow.**
```
verified → expiring → expired → (re-verify) → verified
                                → (mark obsolete) → obsolete
```

### Feature 11.1.2 — QMS approval

**User stories.**
- As an author, I submit a page for approval.
- As a verifier, I approve or reject with a reason.
- As an admin, I want a paper-trail of approvals for compliance.

**Acceptance criteria.**
- Submit-for-approval workflow.
- Verifier approves or rejects.
- Rejection requires comment.
- Approved pages become verified.
- Pages can later expire (combined modes).

**Functional requirements.**
Submit for approval · Verifier reviews · Approve / reject (with comment) · Mark obsolete · Notifications throughout.

**Status flow.**
```
draft → in_approval → approved/rejected → verified → expiring → expired
                                                    → obsolete
```

### Feature 11.1.3 — Verification dashboard

**Settings → Verified Pages.** Lists pages with verification, filterable by status. Bulk actions: re-verify, mark obsolete, export list.

## Notifications

- `PAGE_VERIFICATION_EXPIRING`
- `PAGE_VERIFICATION_EXPIRED`
- `PAGE_VERIFIED`
- `PAGE_APPROVAL_REQUESTED`
- `PAGE_APPROVAL_REJECTED`

Email templates: `verification-expiring`, `verification-expired`, `approval-requested`, `approval-rejected`.

## Audit events

`PAGE_VERIFICATION_CREATED · _UPDATED · _REMOVED · PAGE_VERIFIED · PAGE_APPROVAL_REQUESTED · PAGE_APPROVAL_REJECTED · PAGE_MARKED_OBSOLETE`.

See [`../reference/audit-events.md`](../reference/audit-events.md).

## Cross-references

- Architecture / queue jobs: [`../architecture/backend.md`](../architecture/backend.md), [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md)
- Status enum: [`../reference/status-codes.md`](../reference/status-codes.md)
- Admin runbook: [`../admin/verification-policies.md`](../admin/verification-policies.md)
- Documentation Health (depends on verification): [`./21-documentation-health.md`](./21-documentation-health.md)
