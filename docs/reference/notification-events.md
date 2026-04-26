# Notification Events Reference

Every notification type the system can produce. Notifications fan out to channels (in-app, email, plus webhook / Slack / Teams when configured).

## Channels

| Channel | Status | Where configured |
|---|---|---|
| **In-app** | Shipped | Real-time via Socket.io + persisted in DB |
| **Email** | Shipped | `integrations/mail/` + React-email templates in `integrations/transactional/emails/` |
| **Slack** | Planned | (not in current code) |
| **Microsoft Teams** | Planned | (not in current code) |
| **Webhook** | Planned | (not in current code) |

## Email templates (shipped)

Located at `apps/server/src/integrations/transactional/emails/` — 15 templates rendered with `@react-email/render`:

| Template | Triggered by |
|---|---|
| `invitation` | Workspace invite |
| `invitation-accepted` | Invite accepted (notifies inviter) |
| `forgot-password` | Password reset request |
| `change-password` | Password successfully changed |
| `comment-created` | New top-level comment on a watched page |
| `comment-mention` | `@user` mention in a comment |
| `comment-resolved` | Comment marked resolved |
| `page-mention` | `@user` mention in a page |
| `page-update` | Watched page updated |
| `page-update-digest` | Periodic digest of changes |
| `permission-granted` | Granted access to a page or space |
| `approval-requested` | Page submitted for QMS approval |
| `approval-rejected` | Page approval rejected |
| `verification-expiring` | Verification expiring soon |
| `verification-expired` | Verification expired |

## Notification events

### User & access
- User invited
- Invitation accepted
- Permission granted (page or space)
- Permission changed
- Role changed
- Account deactivated / activated

### Pages
- Watched page updated
- You were mentioned in a page (`@you` in body)
- Page assigned to you
- Page moved to a space you can see
- Page restored from trash

### Comments
- New comment on a watched page
- New reply to your comment
- You were mentioned in a comment
- Your comment was resolved
- Your comment was reopened

### Verification & approval
- Page approval requested (to verifiers)
- Page approval approved (to author)
- Page approval rejected (to author, with comment)
- Page verification expiring (to verifiers + owner)
- Page verification expired (to verifiers + owner)

### Sharing
- Public link created on a page you own
- Public link revoked

### Imports / Exports
- Import completed (to job initiator)
- Import failed
- Export ready (to job initiator)

### AI
- AI knowledge gap detected (planned)

### Workspace
- Settings changed (admin notification — limited to high-impact changes)
- License activated / removed (admin / owner)
- License expiring (planned)

## How notifications are dispatched

```
Event fires (e.g. comment created)
   │
   ▼
NOTIFICATION_QUEUE job enqueued
   │
   ▼
Processor:
   ├── Look up subscribers (page watchers, mentioned users, verifiers, …)
   ├── Apply permission filter (don't notify users who can't see the resource)
   ├── For each user × channel:
   │     ├── In-app  → write to user_notifications, emit Socket.io event
   │     └── Email   → render React-email template, hand to MailService → SMTP / Postmark
   └── Mark job done
```

## Permission-aware notifications

A user is **never notified** about a resource they can't view. This applies to comment notifications, mentions, and page-update digests alike. A page-update digest is **filtered per recipient** — even if many users watch the same parent page, each gets a digest scoped to their access.

## Adding a new notification

1. Define the event in the notification integration's enum.
2. Trigger it from the relevant service via `notificationService.dispatch(...)` (or queue a job directly for batchable cases).
3. Add a React-email template under `integrations/transactional/emails/` if it has email content.
4. Register the template in the mail service's renderer registry.
5. Add the entry to this reference and to the relevant admin runbook.
