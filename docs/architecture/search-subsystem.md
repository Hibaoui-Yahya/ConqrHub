# Search Subsystem

Three search backends layered:

1. **Postgres full-text search** — built in, free tier, default
2. **Typesense driver** — Business+, faster + typo tolerance + faceting
3. **Attachment indexing** — Business+, indexes content of PDF / DOCX uploads

All three are accessed through the same controller surface (`/search`, `/search/suggestions`) so the client doesn't need to know which backend is active.

## Postgres full-text search (Free)

### Tables

Pages, comments, and templates each have a `tsvector` column with a `GIN` index.

| Table | Indexed columns |
|---|---|
| `pages` | title + plain text (from `text_content`) |
| `comments` | comment text |
| `templates` | title + description + plain text |

The `unaccent` Postgres extension is required so `naïve` matches `naive`.

### Where the code lives

```
apps/server/src/core/search/
├── search.module.ts
├── search.controller.ts        /search, /search/suggestions
├── search.service.ts           Builds tsquery, applies permission filter
└── repos/                      Per-table search repos
```

### Index maintenance

Indexing happens on a queue. When a page is saved or a comment is created, the service enqueues:

- `SEARCH_INDEX_PAGE`
- `SEARCH_INDEX_COMMENT`
- `SEARCH_REMOVE_PAGE` (on delete)

The processor materializes the plain text from ProseMirror JSON, computes the tsvector, and writes it back. This decouples user-perceived save latency from indexing.

### Permission filter

The query joins to space membership and page-restriction tables and excludes any rows the user can't access. This means **search results never include forbidden content** — the same chokepoint as REST and AI.

### Suggestions

`/search/suggestions` returns type-ahead suggestions across users, groups, and pages. Used for the global search bar and `@mention` resolution.

## Typesense driver (Business+)

For workspaces that have it configured, the same `SearchService` routes through Typesense instead of Postgres. Typesense gives you:

- Sub-100ms search at scale
- Typo tolerance (configurable)
- Faceted filtering (by space, by author, by tag…)
- Better ranking controls

The driver is selected via env vars; existing Postgres indexes remain (used for fallback / tools that bypass the driver).

## Attachment indexing (Business+)

`Feature.ATTACHMENT_INDEXING` enables full-text search **inside** uploaded files.

Supported file types:

- PDF
- DOCX
- Markdown / HTML / TXT (trivially indexable)
- CSV (planned)
- XLSX, PPTX (planned)

### Pipeline

```
Upload attachment
  └─► Stored via storage driver (local / S3 / Azure)
        └─► ATTACHMENT_QUEUE job: extract text
              └─► Text chunks indexed in same backend (PG or Typesense)
```

Search results show attachment hits with snippets and link to the parent page.

## AI Search (separate path)

AI Search is **not** the same path. It uses **vector embeddings** of page chunks — a separate index — combined with permission filtering. See [`./ai-subsystem.md`](./ai-subsystem.md).

The two coexist: keyword search returns exact matches with snippet highlighting, AI Search returns a generated answer with citations.

## Permission-aware filtering — the canonical pattern

Whichever backend serves a query, the result set is filtered through:

```ts
SearchPermissionFilter.applyToQuery(query, user, workspace) → query'
```

The filter:

1. Restricts to the workspace (always).
2. Excludes spaces the user is not a member of.
3. Excludes pages with restrictions where the user has no role.
4. Excludes pages whose status hides them (e.g. `obsolete` may be hidden to non-managers depending on workspace policy).

The same filter is applied to the AI Search vector retrieval and the search-attachment results.

## Performance notes

- **Postgres tsvector with GIN** scales to millions of pages on a properly tuned cluster. The bottleneck is usually attachment text extraction, which is offloaded to the queue.
- **Typesense** is recommended past ~50k pages or when typo tolerance / faceting is needed.
- **Indexing is asynchronous.** A search performed within ~200ms of a save may not yet include the latest text — the queue worker runs eagerly but is not synchronous.

## Related

- AI Search internals: [`./ai-subsystem.md`](./ai-subsystem.md)
- Permission filter chokepoint: [`./permissions-model.md`](./permissions-model.md)
- Queue + indexing jobs: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md)
- Formal PRD: [`../prd/07-search-and-discovery.md`](../prd/07-search-and-discovery.md)
