# Users & Groups

How to invite, manage, deactivate, and group users in a workspace.

## Inviting users

### Manual invite

**Settings → Workspace → Members → Invite**.

1. Enter email + initial workspace role.
2. Optionally pre-assign to one or more groups.
3. The invitee receives an email with a magic-link token.
4. They sign up (or sign in if they already have an account on the platform) and join.

**Behind the scenes:**
- Row inserted in `workspace_invitations` with a 16-char nanoid token.
- Email sent via `EMAIL_QUEUE` → `invitation` template.
- Audit event: `WORKSPACE_INVITE_CREATED`.

### Bulk invite via CSV (planned)

Not currently shipped; coming.

### Automatic provisioning via SCIM (`Feature.SCIM`, Enterprise)

For organizations using Okta, Azure AD, Google Workspace, or another SCIM 2.0 IdP:

1. **Settings → Security & SSO → SCIM** to get the base URL and bearer token.
2. Configure your IdP to push users.
3. Users are created on first sync; deactivation / role change / group sync follow IdP changes.

SCIM sync is **one-way (IdP → ConqrAI)** — manual changes in the workspace can be overwritten on the next sync if the IdP is the source of truth.

## Roles

Workspace-level roles:

| Role | Capability |
|---|---|
| **Owner** | Everything; manages license/billing; can delete workspace |
| **Admin** | Users, groups, spaces, settings, security |
| **Member** | Use spaces according to space-level role |
| **Guest** | Limited — typically scoped to specific shared spaces |

For the full matrix, see [`../reference/permission-matrix.md`](../reference/permission-matrix.md).

### Promoting / demoting

**Settings → Workspace → Members → [user] → Change role**.

Only Owners can promote to Admin. Only Owners can transfer ownership. Audit event: `USER_ROLE_CHANGED`.

## Deactivating users

**Settings → Workspace → Members → [user] → Deactivate.**

A deactivated user:

- Cannot log in.
- Their content stays — pages, comments, attachments — and continues to be attributed to them.
- They no longer count against billed seats (cloud).
- Active sessions are terminated.

To re-activate: **[user] → Activate**.

To **fully delete** a user (right-to-be-forgotten / GDPR): **[user] → Delete**. The system reassigns or anonymizes their content depending on policy. This is irreversible.

Audit events: `USER_DEACTIVATED`, `USER_ACTIVATED`, `USER_DELETED`.

## Groups

Groups are named sets of users used for **bulk permission assignment**.

### When to use a group

- When the same set of users will appear together in multiple spaces (e.g. `Engineering`, `HR`, `Leadership`).
- When permissions should follow team membership — assign the team to a space, add/remove people from the team.
- When SCIM is in use — IdP groups can sync into workspace groups.

### Managing groups

**Settings → Workspace → Groups**.

- **Create group** — name + optional description.
- **Add / remove members** — search across workspace members.
- **Assign to a space** — open the space, add the group with a role (Reader / Writer / Admin).
- **SCIM-synced** groups show a lock icon — manual edits will be overwritten on next sync.

Audit events: `GROUP_CREATED`, `GROUP_UPDATED`, `GROUP_DELETED`, `GROUP_MEMBER_ADDED`, `GROUP_MEMBER_REMOVED`.

### Effective space role

When a user belongs to multiple groups assigned to the same space, their effective role is the **highest**. If they have a direct user-on-space role in addition, the highest of all wins.

## Allowed email domains *(`Feature.SECURITY_SETTINGS`, Business+)*

Restrict who can sign up to the workspace by email domain. **Settings → Security & SSO → Allowed domains**.

- Only listed domains can complete signup.
- Users whose accounts pre-date the restriction are not affected (they remain).
- Empty list = open signup (default).

## Active sessions

Each user can view and revoke their own sessions in **Settings → Account → Security → Active sessions**.

Admins do not currently have a per-user session-killer UI; deactivating the user terminates all their sessions.

## Common tasks

| I want to... | Steps |
|---|---|
| Onboard a new team member | Invite from Members → assign initial groups → done |
| Make someone an admin | Members → user → Change role → Admin |
| Off-board someone | Members → user → Deactivate (keeps content) or Delete (irreversible) |
| Migrate from manual to SCIM | Configure SCIM in IdP → first sync will adopt existing users by email |
| See who's in a group | Groups → click the group |
| Restrict signup to company emails | Security & SSO → Allowed domains → add `yourdomain.com` |

## Related

- Permission matrix: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
- SCIM provisioning runbook: this file (above) and SSO setup at [`./sso-and-mfa.md`](./sso-and-mfa.md)
- Audit log of role/group changes: [`./audit-logs.md`](./audit-logs.md)
