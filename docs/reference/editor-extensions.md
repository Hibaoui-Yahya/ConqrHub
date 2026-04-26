# Editor Extensions Reference

Tiptap extensions exported from `packages/editor-ext/src/lib/`. These are shared between the client editor and server-side rendering paths (export, search-text extraction).

For the editor architecture, see [`../architecture/editor.md`](../architecture/editor.md).

## Block / inline content

| Extension | Type | Purpose |
|---|---|---|
| `attachment` | Block | File attachment with metadata |
| `audio` | Block | Audio player |
| `callout` | Block | Info / warning / error / success / generic callout |
| `columns` | Block | Multi-column layout |
| `custom-code-block` | Block | Code block with language selection and copy |
| `details` | Block | Collapsible / toggle / accordion |
| `embed` | Block | External embeds (YouTube, Vimeo, Loom, etc.) |
| `heading` | Block | H1–H6 |
| `image` | Block | Image with resize |
| `math` | Block + Inline | KaTeX math rendering |
| `pdf` | Block | Inline PDF viewer |
| `subpages` | Block | Auto-listing of child pages |
| `table` | Block | Tables with merged cells |
| `video` | Block | Video player |

## Diagrams

| Extension | Purpose |
|---|---|
| `drawio` | Draw.io diagram embed and editor |
| `excalidraw` | Excalidraw drawing embed and editor |

(Mermaid lives inside `custom-code-block` with the `mermaid` language tag.)

## Marks (inline annotations)

| Extension | Purpose |
|---|---|
| `comment` | Inline comment marks (with `commentId` and `resolved` attributes) |
| `highlight` | Text highlight |
| `link` | Hyperlinks (internal + external) |
| `mention` | `@user` and `@page` mentions |
| `status` | Inline status pill |

## Editor infrastructure

| Extension | Purpose |
|---|---|
| `markdown` | Markdown ↔ ProseMirror conversion (paste, import, export) |
| `resizable-node-view` | Helper used by image / video / pdf / drawio for resizing |
| `search-replace` | Find & replace within the document |
| `shared-storage` | Plugin shared state across nodes |
| `unique-id` | Block-level UUIDs (used by comment threading and stable diffs) |

---

## How they wire in

```
packages/editor-ext/src/index.ts
   exports each extension

apps/client/src/features/editor/
   imports them, composes the Tiptap editor with the workspace's enabled set

apps/server/...
   imports the same extensions for HTML / Markdown / plain-text rendering of stored content
```

## Adding a new extension

1. Create `packages/editor-ext/src/lib/<name>/`:
   - `<name>.ts` — Tiptap extension definition
   - `<name>.types.ts` — Shared types (if used server-side)
   - Optional client-only React components — keep these out of the package; place them in `apps/client/src/features/editor/extensions/`
2. Export from `packages/editor-ext/src/index.ts`.
3. Add to the editor's extension list in `apps/client/src/features/editor/`.
4. Add a slash-command entry if it's a block.
5. If the block has plain-text content for search, expose a `getText()` so the server's text materializer picks it up.
6. If the block has HTML rendering for export, expose a `renderHTML` matching ProseMirror conventions.
7. Document it here.

## What lives outside this package

- **Slash menu** (`/`) — UI-only, lives in the client editor wrapper.
- **Drag handle** — UI-only.
- **Bubble menu** — UI-only.
- **AI bubble actions** — gated by `Feature.AI`, lives in `apps/client/src/ee/ai/`.

These attach **to the editor** but are not extensions of the document schema.
