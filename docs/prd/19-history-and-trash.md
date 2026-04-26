# PRD 19 — Version History & Trash

> **Source:** PA 19, lines 5410–5523.

## Area overview

Two recovery mechanisms: page revisions (forward-recoverable history) and trash (deleted pages with optional retention).

## Epic 19.1 — Version History

### Feature 19.1.1 — Page revisions

**User stories.**
- View history to recover from mistakes.
- Compare versions to audit content change.
- Maintain history for trust.

**Acceptance criteria.**
- Versions created on meaningful edits (debounced; not on every keystroke).
- Permission-aware viewing.
- Restore creates a new version (non-destructive).
- Diff view shows additions and removals clearly.

**Functional requirements.**
List versions · View snapshot · Compare · Restore · Show editor + timestamp · Track title/content changes · Restore preserves audit history.

**Technical notes.**
- Store snapshots or deltas depending on scale.
- Yjs snapshots can recover collaborative state.
- `HISTORY_QUEUE` job (`PAGE_HISTORY`) writes the snapshot row.

### Feature 19.1.2 — Diagrams + attachments versioning (advanced)

Diagrams version with the page. Attachments referenced by stable IDs so restoring an old version still finds the file.

## Epic 19.2 — Trash and Archive

### Feature 19.2.1 — Trash

**Functional requirements.**
- Move page to trash (soft delete via `deleted_at`)
- View trash (per space, per workspace for admins)
- Restore from trash → page reappears in tree
- Permanently delete (hard delete)
- Children of trashed pages are trashed with them
- Audit events: `PAGE_TRASHED`, `PAGE_DELETED`, `PAGE_RESTORED`

### Feature 19.2.2 — Archive *(distinct from trash)*

**Functional requirements.**
- Archive page → hidden from default listings, retained indefinitely
- Archive a space → similar
- Restore at any time

**Difference from trash.**
- Trash is for "I deleted this; clean up eventually."
- Archive is for "I'm done with this but preserving it for reference."

### Feature 19.2.3 — Trash retention *(Enterprise — `Feature.RETENTION`)*

Configurable auto-purge after N days/months/years. Daily cleanup job. See [`../admin/retention.md`](../admin/retention.md).

## Cross-references

- Architecture: [`../architecture/realtime-collaboration.md`](../architecture/realtime-collaboration.md) (Yjs snapshot + history processor)
- Admin: [`../admin/retention.md`](../admin/retention.md)
- Reference: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md) (`HISTORY_QUEUE`)
- Schema: [`../reference/database-schema.md`](../reference/database-schema.md) (`page_history`)
