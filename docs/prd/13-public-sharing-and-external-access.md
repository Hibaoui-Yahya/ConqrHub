# PRD 13 — Public Sharing & External Access

> **Source:** lines 2588–4429 (PA 13 main + continuation).

## Area overview

How content escapes the workspace boundary safely — per-page public links, space-level documentation portals, guest authenticated access, and the controls that govern all of it.

Admin runbook: [`../admin/public-sharing.md`](../admin/public-sharing.md).

## Product vision

Public sharing is **off by default** at the workspace level. Enabling it must be deliberate. Once enabled, controls let admins constrain what can be shared, with what protections, and for how long.

## Epic 13.1 — Public Page Sharing

### Feature 13.1.1 — Per-page public link

**User stories.**
- Share a single page with a customer or partner.
- Add a password for sensitive shares.
- Set expiration so the link auto-revokes.

**Acceptance criteria.**
- Authenticated writer can create a public link.
- Workspace policy can disable creation.
- Tokens are unguessable (sufficient entropy).
- Optional password and expiration enforced server-side.
- Revoking a link invalidates it immediately.

**Functional requirements.**
Create / regenerate / revoke link · Password protection · Expiration date · Allow / disallow indexing by search engines · Remove branding (Business+) · Track public views.

**Audit events.** `SHARE_CREATED`, `SHARE_DELETED`.

## Epic 13.2 — Space-Level Public Sharing

### Feature 13.2.1 — Documentation portal

**User stories.**
- Publish a whole space as a public docs site.
- Use a custom domain.
- Brand the public site with our colors and logo.

**Functional requirements.**
Public navigation (sidebar of pages) · Public search · Branding customization · SEO metadata · Public feedback form (planned) · Custom domain.

**Use cases.**
- Product documentation portals
- API docs
- Help center
- Client onboarding documentation

## Epic 13.3 — Guest and External Authenticated Access

### Feature 13.3.1 — Guest users

**User stories.**
- Invite a customer / contractor / auditor to a specific space without exposing the rest of the workspace.
- Track guest access via audit.

**Functional requirements.**
- Guest workspace role
- Per-space scoping of guests
- Guests cannot see other spaces
- Optional MFA / SSO enforcement for guests
- Guest session limits

## Epic 13.4 — External Sharing Governance

### Feature 13.4.1 — Workspace + space-level sharing controls

`Feature.SHARING_CONTROLS` (Business+).

**Functional requirements.**
- Disable public sharing workspace-wide
- Disable public sharing per space
- Restrict sharing to admins
- Restrict sharing to verified pages only (planned)
- Audit all public-sharing events

**Effect of disabling.**
- New `Create public link` actions fail.
- Existing share links are deleted (with warning + confirmation).
- Public space portals are taken offline.

## Epic 13.5 — Sharing Audit & Visibility

**Functional requirements.**
- All-shares list with filters (space, owner, expiration, last-viewed)
- Per-share view stats
- Audit trail of shares created / revoked / expired

## Cross-references

- Admin: [`../admin/public-sharing.md`](../admin/public-sharing.md)
- Permissions: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Audit events: [`../reference/audit-events.md`](../reference/audit-events.md)
- API: [`../reference/api.md`](../reference/api.md) (Sharing section)
- Verbatim source: [`../_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md), §13 (lines 2588–4547)
