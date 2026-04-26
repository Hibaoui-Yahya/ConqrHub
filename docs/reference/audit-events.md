# Audit Events Reference

Every audit-event type emitted by ConqrAI Wiki, grouped by category. The audit log is an Enterprise feature (`Feature.AUDIT_LOGS`); these events are still **emitted** in lower tiers but are not surfaced via the audit log UI.

For the audit log API and retention controls, see the [admin runbook](../admin/audit-logs.md).

## Common shape

```ts
interface IAuditLog {
  id: string;
  workspaceId: string;
  actorId?: string;                          // user / system / api key id
  actorType: 'user' | 'system' | 'api_key';
  event: string;                             // event constant (one of the below)
  resourceType: string;                      // 'page', 'space', 'workspace', ...
  resourceId?: string;
  spaceId?: string;
  changes?: { before?: any; after?: any };
  metadata?: any;
  ipAddress?: string;
  createdAt: string;
}
```

## Workspace
- `WORKSPACE_CREATED`
- `WORKSPACE_UPDATED`
- `WORKSPACE_INVITE_CREATED`
- `WORKSPACE_INVITE_RESENT`
- `WORKSPACE_INVITE_REVOKED`

## User
- `USER_CREATED`
- `USER_DELETED`
- `USER_LOGIN`
- `USER_LOGOUT`
- `USER_ROLE_CHANGED`
- `USER_PASSWORD_CHANGED`
- `USER_PASSWORD_RESET`
- `USER_UPDATED`
- `USER_DEACTIVATED`
- `USER_ACTIVATED`

## API Keys
- `API_KEY_CREATED`
- `API_KEY_UPDATED`
- `API_KEY_DELETED`

## Space
- `SPACE_CREATED`
- `SPACE_UPDATED`
- `SPACE_DELETED`
- `SPACE_MEMBER_ADDED`
- `SPACE_MEMBER_REMOVED`
- `SPACE_MEMBER_ROLE_CHANGED`

## Group
- `GROUP_CREATED`
- `GROUP_UPDATED`
- `GROUP_DELETED`
- `GROUP_MEMBER_ADDED`
- `GROUP_MEMBER_REMOVED`

## Comments
- `COMMENT_CREATED`
- `COMMENT_DELETED`
- `COMMENT_UPDATED`
- `COMMENT_RESOLVED`
- `COMMENT_REOPENED`

## Pages
- `PAGE_CREATED`
- `PAGE_TRASHED`
- `PAGE_DELETED`
- `PAGE_RESTORED`
- `PAGE_MOVED_TO_SPACE`
- `PAGE_DUPLICATED`

## Page Permissions
- `PAGE_RESTRICTED`
- `PAGE_RESTRICTION_REMOVED`
- `PAGE_PERMISSION_ADDED`
- `PAGE_PERMISSION_REMOVED`

## Page Verification
- `PAGE_VERIFICATION_CREATED`
- `PAGE_VERIFICATION_UPDATED`
- `PAGE_VERIFICATION_REMOVED`
- `PAGE_VERIFIED`
- `PAGE_APPROVAL_REQUESTED`
- `PAGE_APPROVAL_REJECTED`
- `PAGE_MARKED_OBSOLETE`

## Public Sharing
- `SHARE_CREATED`
- `SHARE_DELETED`

## Import / Export
- `PAGE_IMPORTED`
- `PAGE_EXPORTED`
- `SPACE_EXPORTED`

## SSO
- `SSO_PROVIDER_CREATED`
- `SSO_PROVIDER_UPDATED`
- `SSO_PROVIDER_DELETED`

## MFA
- `USER_MFA_ENABLED`
- `USER_MFA_DISABLED`
- `USER_MFA_BACKUP_CODE_GENERATED`

## License
- `LICENSE_ACTIVATED`
- `LICENSE_REMOVED`

## Attachments
- `ATTACHMENT_UPLOADED`

---

## Filtering & retention

The audit log API supports filtering by:
- Event type
- Date range (start / end)
- Actor
- Space

Retention is configurable in days / months / years and enforced by the `AUDIT_CLEANUP` job on the `AUDIT_QUEUE`. See [`./queues-and-jobs.md`](./queues-and-jobs.md).

## Adding a new audit event

1. Define the event constant in the `audit` integration's enum.
2. Emit it from the controller / service that performs the action — use the audit service's `record(event, …)` method.
3. Add the entry to this reference page **and** the relevant PRD area's "Audit Events" subsection.
4. If the event is high-volume, consider whether it should be sampled or aggregated; the queue handles bursts but the storage cost is real.
