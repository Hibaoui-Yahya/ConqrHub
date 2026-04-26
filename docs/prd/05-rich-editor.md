# PRD 05 — Rich Editor & Documentation Blocks

> **Source:** lines 374–536.

## Area overview

The editor is the heart of the wiki. Built on Tiptap / ProseMirror with custom extensions in `packages/editor-ext`. See [`../architecture/editor.md`](../architecture/editor.md) for implementation.

## Epic 5.1 — Modern Documentation Editor

### Feature 5.1.1 — Rich Text Editing

**User stories.**
- As a writer, I want formatting tools so my pages are readable.
- As a technical writer, I want code blocks and tables.
- As a manager, I want callouts and checklists for actionable docs.

**Acceptance criteria.**
- Common formatting + rich content blocks.
- Slash command for quick block insertion.
- Content saved correctly.
- Pasted content cleaned and preserved.

**Block types.**
Paragraph · Headings · Bullet list · Numbered list · Checklist · Quote · Divider · Table · Image · File · Video/embed · Code block · Inline code · Link · Callout · Toggle · Tabs · Table of contents.

**UX/UI requirements.**
Slash command menu · Bubble toolbar · Floating block menu · Drag handle · Keyboard shortcuts · Markdown shortcuts · Clean empty state.

**Technical notes.**
Tiptap/ProseMirror extensions · Shared in `packages/editor-ext` · SSR-compatible serialization for export.

### Feature 5.1.2 — Diagrams

**User stories.**
- Mermaid for system docs (engineer)
- Draw.io for workflows (PM)
- Excalidraw for quick visuals (designer)

**Functional requirements.**
Mermaid block · Draw.io block · Excalidraw block · Preview · Edit mode · Export rendering.

**Technical notes.**
- Diagram data inside page content or as attachments.
- Export pipeline renders to images where needed.

### Feature 5.1.3 — Technical Documentation Blocks

**User stories.**
- API endpoint block (engineer)
- Database schema block (data engineer)
- Runbook block (DevOps)
- ADR block (architect)

**API block fields.**
Method · Endpoint path · Description · Auth requirements · Headers · Parameters · Request body · Response body · Error responses · Code examples.

**Database block fields.**
Table name · Description · Columns · Types · Constraints · Foreign keys · Indexes · Example query.

**Runbook block fields.**
Objective · Preconditions · Steps · Expected result · Rollback · Escalation.

**ADR block fields.**
Context · Decision · Alternatives · Consequences · Status · Owner.

**Status.** These technical blocks are described in the spec but not all are shipped today. The `custom-code-block`, `callout`, `details`, and `table` extensions cover much of the surface; dedicated API / DB / Runbook / ADR blocks are tracked as **(planned)** in [`../product/feature-catalogue.md`](../product/feature-catalogue.md).

## Cross-references

- Architecture: [`../architecture/editor.md`](../architecture/editor.md)
- Editor extensions reference: [`../reference/editor-extensions.md`](../reference/editor-extensions.md)
- AI editor actions PRD: [`./08-ai-assistant-and-chat.md`](./08-ai-assistant-and-chat.md)
