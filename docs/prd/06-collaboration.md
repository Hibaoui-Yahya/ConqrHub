# PRD 06 — Collaboration

> **Source:** lines 537–644.

## Area overview

Collaboration spans **two channels**: live document editing (Hocuspocus / Yjs) and discussion (comments). See [`../architecture/realtime-collaboration.md`](../architecture/realtime-collaboration.md).

## Epic 6.1 — Real-Time Collaboration

### Feature 6.1.1 — Multi-User Editing

**User stories.**
- See who is editing to avoid conflicts.
- Live updates so collaboration feels instant.
- Co-create documentation during meetings.

**Acceptance criteria.**
- Multiple users edit same page simultaneously.
- Users see each other's cursors / presence.
- Edits merge without conflicts.
- Connection loss handled gracefully.

**Functional requirements.**
Real-time document sync · Cursor presence · User avatars · Online/offline status · Reconnect handling · Conflict-free CRDT.

**UX/UI requirements.**
Active collaborators at top of page · Colored cursors and labels · Connection status when unstable · No intrusive collaboration UI.

**Technical notes.**
Hocuspocus + Yjs CRDT · Endpoint `/collab` · Persistence extension stores document state · Auth extension validates access before joining.

**Innovation additions** (from product spec):
- **Collaboration timeline** — who edited what and when, grouped by session.
- **Focus mode** — one user writes without distractions while others can comment.
- **Edit lock for critical pages** — for verified or regulated content, admins may require checkout/check-in editing.

## Epic 6.2 — Comments and Feedback

### Feature 6.2.1 — Inline and Page Comments

**User stories.**
- Comment on a page to ask for clarification.
- Inline comments attached to specific text.
- Resolve comments to track completed feedback.

**Acceptance criteria.**
- Comment-permission users create comments (inline or page-level).
- Replies supported.
- Resolve / reopen.
- Mentioned users notified.

**Functional requirements.**
Create / edit / delete comment · Reply · Resolve / reopen · Mention user · Filter resolved/unresolved · Notify mentioned users.

**Advanced** (planned / partial):
Assign to user · Add due date · Add priority · Show comment history · Convert comment into task · Link to Jira/Linear issue.

**Technical notes.**
Inline comment marks stored in editor document (Yjs) · Comment data also in DB for queries / notifications / audit · Resolve state synced between document marks and backend.

### Feature 6.2.2 — Viewer Comments

**Use case.** Read-only users / external clients provide feedback without editing.

**Functional requirements.**
Enable / disable viewer comments per space (`Feature.VIEWER_COMMENTS`) · Allow viewer comment creation · Prevent viewer editing · Audit setting changes.

**Technical notes.**
Comment permission must be checked independently from edit permission.

## Cross-references

- Architecture: [`../architecture/realtime-collaboration.md`](../architecture/realtime-collaboration.md)
- Notifications: [`../reference/notification-events.md`](../reference/notification-events.md)
- Reference (schema): [`../reference/database-schema.md`](../reference/database-schema.md) (`comments`, `notifications`)
