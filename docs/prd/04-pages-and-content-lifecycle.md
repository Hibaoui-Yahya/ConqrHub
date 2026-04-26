# PRD 04 — Pages & Content Lifecycle

> **Source:** lines 248–373.

## Area overview

Pages are the primary knowledge object. They support hierarchy, autosave, history, restore, and rich content. Each page belongs to a space.

## Epic 4.1 — Page Management

### Feature 4.1.1 — Page Creation and Editing

**User stories.**
- As a contributor, I want to create a page to document knowledge.
- As a contributor, I want to edit pages with rich content.
- As a writer, I want autosave so I don't lose work.

**Acceptance criteria.**
- Writer permission required.
- Page belongs to a space; can have a parent page.
- Page content autosaves.
- Unauthorized users cannot edit.

**Functional requirements.**
- Create · Edit title · Edit content
- Add icon, cover · Save · Autosave
- Duplicate · Move · Copy · Delete · Restore · Permanently delete

**UX/UI requirements.**
- Editor opens quickly.
- Save status visible.
- Inline title editing.
- Empty pages show prompts and templates.
- Move/copy uses searchable picker.

**Technical notes.**
- ProseMirror JSON + Yjs document state.
- Deterministic, collision-safe slug generation.
- Debounced autosave.
- Trigger search-indexing jobs.

### Feature 4.1.2 — Page Tree and Hierarchy

**User stories.**
- Browse nested pages to understand documentation structure.
- Move pages to reorganize.
- Collapse sections to keep navigation clean.

**Functional requirements.**
- Display page tree
- Expand / collapse nodes
- Drag-and-drop reorder
- Move page to parent or another space
- Show private/restricted indicator
- Show verification status indicator
- Show favorite / recent pages

**Technical notes.**
- Materialized path / parent ID / nested set as appropriate.
- Permission filtering server-side.
- Reordering must be transactional.

### Feature 4.1.3 — Page History and Restore

**User stories.**
- View page history to recover from mistakes.
- Compare versions to audit content changes.
- Maintain version history for trust.

**Acceptance criteria.**
- Versions created after meaningful edits.
- Permission-aware viewing.
- Restore creates a new version (not a destructive overwrite).

**Functional requirements.**
- List versions · View snapshot · Compare · Restore
- Show editor and timestamp · Track title/content changes

**Technical notes.**
- Snapshots or deltas depending on scale.
- Restoring does not erase audit history.
- Yjs snapshots may be used for collaborative recovery.

## Page metadata

Each page supports: title · slug · space · parent page · creator · last editor · owner · tags · status · verification status · last updated · created date · last viewed · access rules · public share status · AI indexing status.

## Page statuses

`draft · published · in_review · approved · verified · expiring · expired · obsolete · archived · deleted` — see [`../reference/status-codes.md`](../reference/status-codes.md).

## Cross-references

- Architecture: [`../architecture/editor.md`](../architecture/editor.md), [`../architecture/realtime-collaboration.md`](../architecture/realtime-collaboration.md)
- Verification: [`./11-review-verification-governance.md`](./11-review-verification-governance.md)
- Permissions: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Reference (schema): [`../reference/database-schema.md`](../reference/database-schema.md) (`pages`, `page_history`)
