# Editor

The editor is built on **Tiptap** (which wraps **ProseMirror**), with collaboration via **Yjs**, and a custom set of nodes/marks shipped from `packages/editor-ext`.

## Why Tiptap

- Mature schema, plugins, transactions
- First-class collaboration via the y-prosemirror binding
- Composable: every block is an extension, swappable per workspace

## Storage representation

Two parallel representations of page content:

| Field | Type | Source of truth | Used by |
|---|---|---|---|
| `pages.ydoc` | `bytea` | Yes | Real-time editor, history |
| `pages.content` | `jsonb` (ProseMirror JSON) | No (derived) | Search, export, server-side render |
| `pages.text_content` | `text` | No (derived) | `tsvector` index for full-text search |

When the Yjs document changes, the server materializes the ProseMirror JSON and the plain text and re-indexes for search.

## Extensions (`packages/editor-ext`)

Extensions are split out of the client app so they can also run on the server (during import, export, search-text extraction). Exported from `packages/editor-ext/src/lib/`:

| Extension | Purpose |
|---|---|
| `attachment` | File attachment node |
| `audio` | Audio player |
| `callout` | Callout block (info / warning / error / success) |
| `columns` | Multi-column layout |
| `comment` | Comment marks (inline + page) |
| `custom-code-block` | Code block with language selection |
| `details` | Collapsible / toggle |
| `drawio` | Draw.io diagrams |
| `embed` | Embed external content |
| `excalidraw` | Excalidraw drawings |
| `heading` | H1–H6 |
| `highlight` | Text highlight |
| `image` | Image node with resize |
| `link` | Hyperlinks |
| `markdown` | Markdown ↔ ProseMirror conversion |
| `math` | Inline + block math |
| `mention` | `@user` and `@page` mentions |
| `pdf` | PDF inline viewer |
| `resizable-node-view` | Helper for resizable nodes |
| `search-replace` | Find & replace |
| `shared-storage` | Plugin shared state across nodes |
| `status` | Status pill node |
| `subpages` | Sub-pages embed list |
| `table` | Tables with merged cells |
| `unique-id` | Block-level UUIDs (used by comment threading) |
| `video` | Video player |

The full canonical list is in [`../reference/editor-extensions.md`](../reference/editor-extensions.md).

## Slash menu, drag handle, bubble bar

These live in the **client editor wrapper** (`features/editor/`), not in `packages/editor-ext`:

- **Slash command** — types `/`, opens a filterable menu of insertable blocks.
- **Drag handle** — appears on the gutter, lets you reorder or open a per-block menu.
- **Bubble menu** — appears on selection, exposes formatting marks (bold, italic, link, comment, AI…).

The AI editor actions (improve writing, summarize, …) attach to the bubble menu when the workspace has `ai.generative = true`.

## Collaboration binding

The editor is mounted with the Hocuspocus provider. The provider exposes a Yjs document; `y-prosemirror` syncs ProseMirror state to/from it. See [`./realtime-collaboration.md`](./realtime-collaboration.md).

## Comment marks

Inline comments are **marks** with a unique ID and a `resolved` boolean. The `resolved` attribute is updated through a TipTap command (`setCommentResolved(commentId, isResolved)`), which writes through to the Yjs doc and over the wire. Resolved comments visually de-emphasize but stay in the document so threads aren't lost.

## Paste handling

Pastes from Word, Google Docs, raw HTML, or Markdown are normalized to ProseMirror nodes. The `markdown` extension handles MD-to-PM conversion; HTML pastes go through a sanitizer to strip styles and unsafe attributes.

## Server-side rendering of editor content

For exports and PDFs the server walks the ProseMirror JSON and renders to:

- **HTML** — for HTML export and the PDF render pipeline (Gotenberg renders HTML to PDF)
- **Markdown** — for Markdown export
- **Plain text** — for the search index (`text_content`)

The same `packages/editor-ext` set powers these conversions, which is why it's a separate package and not buried in `apps/client`.

## Adding a new block

1. Create `packages/editor-ext/src/lib/<name>/` with a Tiptap extension.
2. Export it from `packages/editor-ext/src/index.ts`.
3. Add it to the editor's extension list in `apps/client/src/features/editor/`.
4. Optionally add a slash-command entry in the slash menu.
5. If it has server-side rendering needs (export / search), wire the renderers in `apps/server`.

For the formal product spec on the editor, see [`../prd/05-rich-editor.md`](../prd/05-rich-editor.md).
