# PRD 16 — Import and Export

> **Source:** PA 16, lines 5088–5219.

## Area overview

Migrate content in (Markdown, HTML, Notion, Confluence, DOCX) and out (Markdown, HTML, PDF), with hierarchy preservation and queue-based processing for large jobs.

## Epic 16.1 — Import

### Feature 16.1.1 — Single-file import

`POST /pages/import` — single MD or HTML file.

### Feature 16.1.2 — Bulk ZIP import

`POST /pages/import-zip` — Notion ZIP, Confluence ZIP, or generic ZIP. Job runs on `FILE_TASK_QUEUE` (`IMPORT_TASK`).

### Feature 16.1.3 — Notion import (Business+)

Parses Notion's internal format; reconstructs page hierarchy and attachments.

### Feature 16.1.4 — Confluence import (Business+)

`Feature.CONFLUENCE_IMPORT`. Handles space ZIP exports — page hierarchy, attachments, content format conversion.

### Feature 16.1.5 — DOCX import (Business+)

`Feature.DOCX_IMPORT`. Uses `mammoth` (DOCX → HTML → ProseMirror JSON). 20MB per-file limit. Lazy-loads EE module.

### Feature 16.1.6 — Future imports

Planned: GitHub docs · Google Docs · SharePoint · OpenAPI specs (auto-generate API doc pages).

### Import functionality (across formats)

Import single file · Import ZIP · Preserve page hierarchy · Preserve attachments · Preserve links · Preserve headings · Preserve tables · Show import progress · Show import errors · Rollback import · Detect duplicate pages · Map authors (advanced).

## Epic 16.2 — Export

### Feature 16.2.1 — Markdown / HTML export (Free)

`POST /pages/export`, `POST /spaces/export` — single page or full space, ZIP-packaged with attachments. Permission-aware. Internal links rewritten.

### Feature 16.2.2 — PDF export (Business+)

`Feature.PDF_EXPORT`. Server-side rendering via Gotenberg (`GOTENBERG_URL` env var).
Queue jobs: `PDF_EXPORT_TASK`, `PDF_EXPORT_CLEANUP`.

### Feature 16.2.3 — DOCX export (planned)

### Feature 16.2.4 — Full workspace export

For data-portability and compliance.

### Export functionality

Export current page · Page with children · Whole space · Include attachments · Rewrite internal links · Respect permissions · Generate export job · Notify when ready.

## Cross-references

- Architecture: [`../architecture/backend.md`](../architecture/backend.md) (integrations/export, integrations/import)
- API: [`../reference/api.md`](../reference/api.md) (Pages section)
- Queues: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md) (FILE_TASK_QUEUE, GENERAL_QUEUE)
