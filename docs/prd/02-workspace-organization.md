# PRD 02 — Workspace & Organization

> **Source:** [`_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md), lines 68–162.

## Area overview

The **workspace** is the top-level container for everything: users, groups, spaces, settings, billing/license, audit. Every domain row in the system carries a `workspace_id`.

## Epic 2.1 — Workspace Management

### Feature 2.1.1 — Workspace Creation and Configuration

**Use case.** A company creates a dedicated knowledge workspace for all internal documentation.

**Key user stories.**
- As an organization owner, I want to create a workspace so my company can centralize documentation.
- As an admin, I want to configure workspace branding so the platform reflects our identity.
- As an admin, I want to define workspace-wide defaults so new spaces and users follow our governance model.

**Acceptance criteria.**
- Workspace can be created with name, slug, logo, default language.
- Admins can update general settings; settings persist and apply.
- Only owners/admins can access workspace-level config.
- Invalid or duplicate slugs are rejected.

**Functional requirements.**
- Create workspace · Edit name · Edit slug/domain · Upload logo
- Set default timezone · default language · default member role
- Toggle public sharing globally · Toggle AI features globally
- View workspace metadata

**UX/UI requirements.**
- Settings sidebar entry: General, Members, Security, AI, Billing/License, Audit, Retention.
- Destructive actions require confirmation.
- UI clearly indicates which settings are tier-locked.

**Technical notes.**
- Settings stored as structured JSON for flexible config.
- Permission checks via CASL.
- Cache safe-to-cache settings; never cache security-sensitive ones.

**Test cases.**
- Create with valid data.
- Reject missing required fields.
- Reject duplicate slug.
- Non-admin cannot edit workspace settings.
- Disabled features hidden / locked for users.

### Feature 2.1.2 — Workspace Health Dashboard

**Use case.** Admins and knowledge managers need to understand documentation health and risks.

**Key user stories.**
- As an admin, I want workspace activity to understand adoption.
- As a knowledge manager, I want outdated and unverified pages highlighted.
- As a security owner, I want public links and permission risks visible.

**Acceptance criteria.**
- Dashboard shows workspace-level metrics, permission-protected.
- Metrics separate content / users / search / AI / security.
- Auto-update or refreshable.

**Metrics.**
Total users · Active users · Total spaces · Total pages · Pages created/updated this month · Pages not updated recently · Pages without owners · Verified · Expired · Public links · Failed searches · AI questions asked · Storage usage · API key count · Pending reviews.

**Technical notes.**
- Calculated from events, audit logs, page metadata.
- Expensive metrics precomputed via background jobs.
- Use Redis/BullMQ for scheduled health calculations.

## Cross-references

- Architecture: [`../architecture/overview.md`](../architecture/overview.md)
- Admin runbooks: [`../admin/users-and-groups.md`](../admin/users-and-groups.md), [`../admin/settings-map.md`](../admin/settings-map.md)
- Reference: [`../reference/database-schema.md`](../reference/database-schema.md) (workspaces, workspace_invitations)
