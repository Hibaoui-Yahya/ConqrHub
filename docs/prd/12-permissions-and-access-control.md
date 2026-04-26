# PRD 12 — Permissions and Access Control

> **Source:** lines 1172–2587 (the largest PRD area). Architectural overview: [`../architecture/permissions-model.md`](../architecture/permissions-model.md).

## Area overview

Permissions are arguably the most important system in the product — they protect everything else. The model is **layered**:

```
Workspace role  →  Space permissions  →  Page restriction  →  Feature gates
```

A user's effective access is the resolution of all four layers.

## Product vision

The permission system must be:
- **Secure by default** — the burden is on opening up, not locking down.
- **Server-side authoritative** — the frontend never gates the backend.
- **Inheritable** — the parent's policy applies unless the child overrides.
- **Explainable** — users can see *why* they have access (or don't).
- **Least privilege** — defaults grant the minimum.
- **Audit-everything-sensitive** — every change to policy is recorded.
- **Permission-aware AI** — search, AI Search, AI Chat, MCP all respect access.

## Access control layers

### Layer 1 — Workspace role
`Owner` · `Admin` · `Member` · `Guest`. Carried on every membership row.

### Layer 2 — Space permission
Direct user-on-space role + group-on-space role: `Admin` · `Writer` · `Reader`.

### Layer 3 — Page-level permission *(`Feature.PAGE_PERMISSIONS`, Enterprise)*
A page can be **restricted**: explicit allow-list of users / groups with `reader` / `writer` roles. Inherited to children unless broken.

### Layer 4 — Feature-specific gate
"Public sharing allowed?" "AI usable?" "Templates creatable by non-admins?" Each is a per-workspace or per-space toggle.

### Layer 5 — Public + external access
Anonymous public-share access via tokens, with optional password / expiration.

## Epics

### 12.5 — Workspace Roles

**Functional requirements.**
- Assign / change roles on workspace members
- Owner can transfer ownership
- Audit all role changes

### 12.6 — Groups

**Functional requirements.**
- Create / rename / delete groups
- Add / remove members
- Sync from SCIM (`Feature.SCIM`, Enterprise)
- Assign groups to spaces with a role

### 12.7 — Space-Level Permissions

**Functional requirements.**
- Add / remove members and groups
- Change role
- Default access level for the space
- Audit changes

### 12.8 — Page-Level Permissions *(Enterprise)*

**Features.** Page restriction · access explanation · inheritance / break-inheritance.

**Functional requirements.**
- Restrict / unrestrict page
- Add / remove user permission
- Add / remove group permission
- Set role: reader / writer
- Inherit from parent · break inheritance
- Show access explanation

**Use cases.**
- Confidential HR page inside HR space
- Private roadmap inside Product space
- Client-specific page inside shared project space
- Security-incident page restricted to security team

### 12.9 — Content Action Permissions

Granular rights for create / read / update / delete / move / duplicate / share / export per resource type.

### 12.10 — Feature-Specific Access Control

- AI permission control (per workspace, per space)
- Export permission control (admins / writers / restricted)
- Template creation control

### 12.11 — Public Sharing Permissions

`Feature.SHARING_CONTROLS` (Business+). See [`./13-public-sharing-and-external-access.md`](./13-public-sharing-and-external-access.md).

### 12.12 — Guest and External Access

**Functional requirements.**
- Guest user role
- Guest scoped to specific spaces
- Cannot see the rest of the workspace
- Optional password protection on shares

### 12.13 — Access Requests *(planned)*

- User without access can request access from page or space
- Request notifies space admins
- Admin approves with role; or denies with reason
- Audit trail

### 12.14 — API and Automation Permissions

- API key access control (user-level + workspace-level)
- MCP tool permissions inherited from API key's user

### 12.15 — Permission-Aware Search, AI, Export and Notifications

The non-negotiable invariants — search results, AI retrieval, exports, and notifications **never** include resources the requester can't see.

### 12.16 — Audit and Compliance for Permissions

Every permission change emits an audit event. See [`../reference/audit-events.md`](../reference/audit-events.md).

### 12.17 — Permission Administration UX

A central access management console:

- "Who has access to this page?" with reasoning
- "What can this user access?" cross-resource view
- Bulk permission operations
- Permission diff and history

## Permission Matrix (cross-reference)

The full matrix lives at [`../reference/permission-matrix.md`](../reference/permission-matrix.md). Quick reminders:

- **Workspace Owner / Admin** retain access regardless of page restriction.
- **Space role** is the **highest** of direct + group + workspace-level.
- **Page restriction** overrides space role for restricted pages.
- **Feature gates** apply on top of any role.

## Technical architecture notes

### Authorization services

- `PageAccessService.validateCanView(page, user)`
- `PageAccessService.validateCanEdit(page, user)`
- `PageAccessService.validateCanComment(page, user)`
- `SpaceMemberService.resolveRole(spaceId, user)` — highest of direct + group
- `LicenseCheckService.hasFeature(workspaceLicenseKey, Feature.X)`

### Permission resolution order
```
1. Feature flag check
2. Workspace role
3. Page restriction (explicit / inherited)
4. Space role (if no page restriction)
5. Per-action gate
6. Audit if sensitive
```

### Database concepts

`page_access` (one row per restricted page) + `page_permissions` (rows per user/group with role) + inheritance via `inherits_from`.

### Security requirements

- Server-side authorization first — frontend can't be trusted.
- Permission filter applied at retrieval, not post-filter.
- Permission changes invalidate any in-flight collaboration sessions.

## Test coverage (security-critical)

- Unit tests for every `PageAccessService` method.
- Integration tests with real DB rows for inheritance + group-via-space.
- E2E tests asserting that 401/403 paths are exercised.
- Property tests where feasible (random ACL configurations should never violate invariants).

## MVP recommended scope

**MVP**
- Workspace roles · Space roles · Groups · Inviting

**Business**
- All MVP + SSO + MFA + API keys + viewer comments + sharing controls

**Enterprise**
- All Business + page-level permissions + access explanation + audit + retention

## Cross-references

- Architecture: [`../architecture/permissions-model.md`](../architecture/permissions-model.md)
- Permission matrix: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
- Audit events: [`../reference/audit-events.md`](../reference/audit-events.md)
- Verbatim source: [`../_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md), §12 (lines 1172–2587)
