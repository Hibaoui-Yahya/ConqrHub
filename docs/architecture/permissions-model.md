# Permissions Model

Authorization in ConqrAI Wiki is **layered**: a user's effective access to a resource is the most-restrictive resolution across four layers.

```
Layer 1: Workspace role          (Owner / Admin / Member / Guest)
   │
   ▼
Layer 2: Space permissions       (Admin / Writer / Reader, via direct or group membership)
   │
   ▼
Layer 3: Page permissions        (per-page restriction with explicit user/group roles; inherited)
   │
   ▼
Layer 4: Feature-specific gates  (commenting allowed, AI allowed, exports allowed, …)
```

The principles, exhaustively, are documented in [`../prd/12-permissions-and-access-control.md`](../prd/12-permissions-and-access-control.md).

This page is the **architecture** view: where the rules live in code, how they're evaluated, and how they're enforced consistently across REST, real-time, search, and AI.

## Where the code lives

| Concern | Path |
|---|---|
| CASL ability factory | `apps/server/src/core/casl/` |
| Per-request guards | `apps/server/src/common/guards/` |
| Page access service | `apps/server/src/core/page/services/page-access.service.ts` (and EE extension) |
| Space membership service | `apps/server/src/core/space/services/` |
| Workspace role resolution | `apps/server/src/core/workspace/` |
| Page-restriction tables | DB tables `page_access`, `page_permissions` |
| Page restriction UI | `apps/client/src/ee/page-permission/` |

Page-level permissions are an EE feature — the **schema is in core migrations** so you can read it without the EE submodule, but the **enforcement service** lives in EE.

## Workspace roles

Defined as enum values:

| Role | Permissions |
|---|---|
| **Owner** | Everything. License/billing, deletion, security policy, audit logs. |
| **Admin** | Manage users, groups, spaces, settings. Cannot transfer ownership. |
| **Member** | Use the workspace per space-level roles. |
| **Guest** | Limited access; usually scoped to specific shared spaces. |

There is no **Knowledge Manager** role in code yet — the PRD describes it but enforcement currently overlaps with Admin / Space Admin.

## Space permissions

Three roles, assigned **per user or per group** within a space:

| Role | Read | Write | Manage |
|---|:---:|:---:|:---:|
| **Reader** | Y | — | — |
| **Writer** | Y | Y | — |
| **Admin** | Y | Y | Y (members, settings, deletion) |

A user's effective space role is the **highest** of:
- Their direct user-on-space role
- The role granted by any group they belong to that's been assigned to that space
- Their workspace role (Owner / Admin always have full rights inside any space they're in)

## Page-level permissions (Enterprise)

Page restriction **overrides** the inherited space role. When a page is restricted:

- Only users / groups explicitly granted a role on the page can access it.
- The restriction is **inherited by child pages** unless the child explicitly breaks inheritance.
- Space Admins still have access — restriction does not lock out the space owner.

The data model:

```
page_access
  page_id           which page is restricted
  workspace_id      tenant scope
  inherits_from     (nullable) parent page-access id
  ...

page_permissions
  page_access_id    FK
  user_id           (nullable)
  group_id          (nullable)
  role              'reader' | 'writer'
```

Access decisions are made by `PageAccessService`:

```ts
PageAccessService.validateCanView(page, user)
PageAccessService.validateCanEdit(page, user)
PageAccessService.validateCanComment(page, user)
```

These methods are called by:

- **REST controllers** — before reading or mutating page data
- **Hocuspocus auth extension** — at WebSocket connect time and on permission changes
- **Search** — to filter results before they're returned to the user
- **AI Search / AI Chat retrieval** — to filter sources used to build answers
- **Export** — to skip pages the requester can't see

This is the **single chokepoint** that makes "permission-aware everything" actually true.

## Feature-specific gates

On top of view/edit/comment, the system applies gates for specific actions:

| Gate | Where it's checked | Configurable by |
|---|---|---|
| Public sharing allowed for this space? | `share` controllers | Workspace + space admins |
| Public sharing allowed at all? | Workspace settings (`workspace.settings.sharing.disabled`) | Workspace admin |
| Templates can be created by non-admins? | Template controllers | Workspace admin |
| Exports allowed? | Export controllers | Workspace admin |
| AI usable in this workspace / space? | AI controllers | Workspace admin (`workspace.settings.ai.*`) |
| Viewer can comment? | Comment controllers | Per-space toggle |

## Resolution order (canonical)

```
1. If feature flag is missing for this workspace → ForbiddenException, no further check
2. Resolve workspace role
3. If page is restricted:
     a. Use page_permissions roles
     b. (If user has none) → check inherited restrictions up the parent chain
     c. (If still none) → fallback denied (unless workspace Admin/Owner)
   Else:
     Use space role
4. Apply per-action gate (comment / share / export / AI)
5. Audit if the action is sensitive (see audit-events.md)
```

## Permission-aware AI

Two AI guarantees:

- **AI Search / AI Chat** never includes content from pages the requester can't see in the retrieval set. This is enforced at the retrieval layer, not at the prompt layer — the LLM literally never sees the forbidden text.
- **AI tools** (the 20 tools exposed in AI Chat / MCP) are wrapped in the same `PageAccessService` checks. A `read_page` tool call is denied if the user can't view the page.

## Audit

Every permission-changing action emits an audit event:

- `PAGE_RESTRICTED`
- `PAGE_RESTRICTION_REMOVED`
- `PAGE_PERMISSION_ADDED`
- `PAGE_PERMISSION_UPDATED`
- `PAGE_PERMISSION_REMOVED`
- `SPACE_MEMBER_ADDED` / `_REMOVED` / `_ROLE_CHANGED`
- `GROUP_MEMBER_ADDED` / `_REMOVED`
- `WORKSPACE_INVITE_CREATED` / `_REVOKED`

Full list: [`../reference/audit-events.md`](../reference/audit-events.md).

## Related

- Full PRD: [`../prd/12-permissions-and-access-control.md`](../prd/12-permissions-and-access-control.md)
- Page-restriction APIs: [`../reference/api.md`](../reference/api.md)
- Permission matrices: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
- AI retrieval permission filtering: [`./ai-subsystem.md`](./ai-subsystem.md)
- Search permission filtering: [`./search-subsystem.md`](./search-subsystem.md)
