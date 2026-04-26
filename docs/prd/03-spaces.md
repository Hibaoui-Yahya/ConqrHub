# PRD 03 — Spaces & Information Architecture

> **Source:** lines 163–247.

## Area overview

Spaces organize knowledge by department, project, client, product, or function. Each space has its own member list, permissions, templates, and settings.

## Epic 3.1 — Space Management

### Feature 3.1.1 — Spaces

**Use case.** Organizations need to divide knowledge by team or domain.

**User stories.**
- As an admin, I want to create spaces so documentation is organized by team or domain.
- As a team lead, I want a private space so only my team can access sensitive project docs.
- As a new employee, I want to browse spaces to find relevant knowledge areas.

**Acceptance criteria.**
- Users with permission can create spaces.
- Each space has name, slug, icon, description, visibility, and permissions.
- Slugs unique within a workspace.
- Visibility controls who can see the space.
- Deleted spaces are hidden in normal navigation.

**Functional requirements.**
- Create / edit / delete / archive space
- Set icon, description, visibility
- Manage members and groups
- Configure public sharing
- Configure viewer comments
- Configure templates
- Export space
- View space analytics

**UX/UI requirements.**
- Spaces in left sidebar / workspace navigation.
- Each space shows icon, name, access status.
- Private/restricted spaces show clear lock indicators.
- Space settings easy to access for space admins.

**Technical notes.**
- Space permissions are the default permission layer for pages.
- Page-level permissions can override space rules.
- Search indexing must include space metadata.

**Test cases.**
- Create public-internal space, private space.
- Add / remove user from space.
- User without access cannot see the space.
- Slug uniqueness enforced.

### Feature 3.1.2 — Space Permissions

**Use case.** Different teams need different access to different documentation areas.

**User stories.**
- As a space admin, I want readers and writers so people have correct access.
- As an admin, I want to grant access to groups for scalable permission management.
- As a security owner, I want restricted spaces for sensitive content.

**Acceptance criteria.**
- Space admins add users or groups.
- Roles supported: admin, writer, reader, optionally commenter.
- Users without access cannot view restricted pages.
- Permission changes reflected immediately.

**Functional requirements.**
- Add / remove space member · Change member role
- Add / remove group · Configure default access
- Inherited permissions support · Audit permission changes

**UX/UI requirements.**
- Show users and groups separately.
- Role dropdown explains each role.
- Confirmation for dangerous changes.
- Users should understand why they have access.

**Technical notes.**
- CASL rules enforce server-side.
- Frontend checks improve UX but never replace backend authorization.
- Audit log captures actor, target, role, resource.

**Test cases.**
- Reader can view, cannot edit.
- Writer can edit pages.
- Space admin manages members.
- Removed user loses access.
- Group member receives access through group assignment.

## Space types (referenced by other PRDs)

- **Public-internal** — visible to all workspace members
- **Private** — selected users / groups only
- **Restricted** — selected members + granular page-level controls
- **Public-docs** — externally shared via public link or portal

## Cross-references

- Architecture: [`../architecture/permissions-model.md`](../architecture/permissions-model.md)
- Permissions PRD: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Reference: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
