# Permission Matrix

Three matrices in one place: workspace, space, and page. For the architectural layers and resolution order, see [`../architecture/permissions-model.md`](../architecture/permissions-model.md).

## Workspace-level

| Action | Owner | Admin | Member | Guest |
|---|:---:|:---:|:---:|:---:|
| View workspace | Y | Y | Y | Y (limited) |
| Update workspace settings | Y | Y | — | — |
| Manage members (invite / role / deactivate) | Y | Y | — | — |
| Manage groups | Y | Y | — | — |
| Manage spaces (any) | Y | Y | — | — |
| Create space | Y | Y | Y | — |
| Configure SSO / MFA / security | Y | Y | — | — |
| Configure AI features | Y | Y | — | — |
| View audit logs | Y (self-hosted) | — | — | — |
| Manage license | Y | — | — | — |
| Manage billing (cloud) | Y | Y | — | — |
| Delete workspace | Y | — | — | — |

## Space-level

A user's effective space role is the **highest** of: their direct user-on-space role, the role of any group they belong to that's been assigned to the space, and (always-superseding) Owner / Admin at workspace level.

| Action | Space Admin | Writer | Reader |
|---|:---:|:---:|:---:|
| View pages in space | Y | Y | Y |
| Create page | Y | Y | — |
| Edit page | Y | Y | — |
| Delete page (trash) | Y | Y | — |
| Permanently delete page | Y | — | — |
| Manage page hierarchy | Y | Y | — |
| Comment on page | Y | Y | Y (if viewer comments enabled) |
| Resolve comment | Y | Y | — |
| Restrict / unrestrict pages (Enterprise) | Y | — | — |
| Add page-level permission (Enterprise) | Y | — | — |
| Verify page (Enterprise) | Y or designated verifier | — | — |
| Mark obsolete (Enterprise) | Y | — | — |
| Create / use templates | Y | Y (if allowed) | — |
| Export page / space | Y | Y (if allowed) | — |
| Manage space members | Y | — | — |
| Configure space settings | Y | — | — |
| Configure space-level public sharing | Y | — | — |
| Delete space | Y | — | — |

## Page-level (with restriction enabled — Enterprise)

When a page is **restricted**, the matrix above is overridden by direct page permissions. The on-page roles are exactly the two values of `PagePermissionRole`: `reader` and `writer` (see [`./status-codes.md`](./status-codes.md)).

| Action | Page Reader | Page Writer |
|---|:---:|:---:|
| View page | Y | Y |
| Edit page | — | Y |
| Comment | Y (if allowed) | Y |
| Manage page permissions | — | — |
| Inherit to children | (via inheritance) | (via inheritance) |

Notes:

- **Workspace Admin / Owner** retain access regardless of restriction — restriction does not lock out the workspace owner.
- **Inheritance:** child pages inherit the parent's restriction by default. A child can break inheritance and define its own.
- **Managing the restriction itself** (adding/removing reader/writer entries) is performed by *Space Admin* (or above). There is no on-page "Page Admin" role.

## Public sharing (any tier with `Feature.SHARING_CONTROLS` for granular control)

| Action | Anyone with link | Anyone with link + password | Authenticated guest | Workspace member |
|---|:---:|:---:|:---:|:---:|
| View shared page | Y | Y (after password) | Y (after auth) | Y (always — internal) |
| Comment | If viewer-comments enabled on the share | If viewer-comments enabled on the share | Y (if granted) | Per space role |
| Index by search engines | Y / N (per-share toggle) | N | N | — |
| See branding | Default Y / `Off` if `remove_branding` (Business+) | — | — | — |

## Feature gates (orthogonal to roles)

These apply on top of any role:

| Gate | Controlled by |
|---|---|
| Workspace public sharing disabled | Workspace admin (`workspace.settings.sharing.disabled`) |
| Space public sharing disabled | Space admin |
| AI features available | Workspace admin (per-surface `workspace.settings.ai.*`) |
| Templates creatable by non-admins | Workspace admin (`Feature.TEMPLATES` settings) |
| Exports allowed | Workspace admin (security settings) |
| Allowed email domains | Workspace admin |
| Session length | Workspace admin (security settings) |

## Where these matrices are enforced

| Layer | Enforcement point |
|---|---|
| Workspace role | CASL ability factory, applied via guards on workspace-scoped controllers |
| Space role | `SpaceMemberService.resolveRole()` + service-level checks |
| Page restriction | `PageAccessService.validateCan*()` — the chokepoint that REST, collab WS, search, and AI all share |
| Feature gate | `LicenseCheckService.hasFeature(...)` |

For the formal product spec on permissions, see [`../prd/12-permissions-and-access-control.md`](../prd/12-permissions-and-access-control.md).
