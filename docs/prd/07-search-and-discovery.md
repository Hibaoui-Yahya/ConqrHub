# PRD 07 — Search & Discovery

> **Source:** lines 645–795.

## Area overview

Three search backends + AI Search for natural-language Q&A. Architecture: [`../architecture/search-subsystem.md`](../architecture/search-subsystem.md).

## Epic 7.1 — Full-Text Search

### Feature 7.1.1 — Workspace Search

**User stories.**
- Find documentation answers fast.
- Search code snippets and runbooks.
- Search respects permissions to protect private info.

**Acceptance criteria.**
- Returns pages matching title and content.
- Respects permissions.
- Shows snippets.
- Filterable.
- No inaccessible results exposed.

**Functional requirements.**
Search title · body · comments · attachments · templates · users · groups · spaces.
Filters: space · author · owner · tag · date · status · verification · attachment type · has comments · has unresolved comments.

**UX/UI requirements.**
Global search · Results show title, space, snippet, updated date · Filters easy to use · Empty states suggest alternatives.

**Technical notes.**
- Postgres FTS for core search (`tsvector` + `unaccent` + GIN).
- Typesense as advanced driver (Business+).
- Index updates via `SEARCH_QUEUE`.

### Feature 7.1.2 — Search Suggestions

**Functional requirements.**
- Suggestions appear while typing.
- Include pages, spaces, users, groups.

### Feature 7.1.3 — Attachment Indexing

**`Feature.ATTACHMENT_INDEXING` (Business+).**

Supported file types: PDF, DOCX, MD, HTML, TXT, CSV; XLSX/PPTX (planned).

**Functional requirements.**
Extract text · index attachment content · show snippets · link to parent page · respect permissions.

## Epic 7.2 — AI Search and AI Answers

`Feature.AI` (Enterprise). Architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md).

### Feature 7.2.1 — Natural-Language Q&A

**User stories.**
- Ask in natural language and get an answer.
- See citations to verify.
- Ask follow-up questions.

**Acceptance criteria.**
- Generated answer grounded in workspace pages.
- Cites source pages with excerpts.
- Permission-aware retrieval — never returns content the user can't see.
- Confidence indicator visible.

**Functional requirements.**
Ask in NL · Generate answer · Cite source pages · Cite excerpts · Show confidence · Show related pages · Follow-up Qs · Permission filter.

**Innovation additions.**
- **Answer trust level** — high (verified + recent) / medium (normal) / low (outdated/unverified).
- **Missing-source warning** — "I could not find a verified source for this answer; you may need to create or update documentation."

## Cross-references

- Architecture: [`../architecture/search-subsystem.md`](../architecture/search-subsystem.md), [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- Permissions: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Reference (queues): [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md)
