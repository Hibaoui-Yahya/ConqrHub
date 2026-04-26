# Real-time Collaboration

ConqrAI Wiki runs **two distinct real-time channels** that look similar but solve different problems:

1. **Hocuspocus** at `/collab` — document-level CRDT sync. Used while you're editing a page.
2. **Socket.io** at `/socket.io` — everything else real-time: presence, page-tree updates, notifications, typing indicators.

Both use Redis for multi-instance pub/sub.

---

## Hocuspocus / Yjs (`/collab`)

### Why CRDT

Co-editing without a CRDT means every keystroke goes through a central reconciler that must order it consistently. CRDTs (specifically Yjs) let two users diverge and re-converge without the server adjudicating — every client converges to the same state if it receives the same set of updates.

### Code locations

```
apps/server/src/collaboration/
├── collaboration.gateway.ts      Hocuspocus server bootstrap
├── extensions/                   Auth, persistence, Redis sync
├── handlers/                     onConnect, onLoadDocument, onChange, onDisconnect
├── history-processor.ts          Snapshots into BullMQ history queue
└── redis-sync/                   Cross-instance Yjs update fan-out
```

Editor side:

```
apps/client/src/features/editor/
├── components/                   <Editor /> wrapper
├── extensions/                   Local-only Tiptap extensions
└── (uses) packages/editor-ext/   Shared extensions
```

Page content is stored in two forms in `pages.ydoc` (binary Yjs state) and `pages.content` (ProseMirror JSON snapshot). The Yjs state is authoritative; the JSON snapshot is for read paths and search indexing.

### Connection flow

```
Client editor mounts
  ├── Connects to wss://host/collab?docName=<page-slugId>&token=<jwt>
  │
  └── Hocuspocus server
        ├── Auth extension validates JWT, looks up user + page
        ├── Permission check via PageAccessService
        ├── Loads ydoc from pages.ydoc (or starts new if missing)
        ├── Streams initial state to client
        ├── Receives Yjs updates, fans out via Redis pub/sub
        └── Periodically persists state back to Postgres
```

### Persistence

- **On every batch of updates:** debounced flush to Postgres `pages.ydoc` (binary).
- **On meaningful change:** snapshot pushed onto `HISTORY_QUEUE` (job: `PAGE_HISTORY`) which writes a row to `page_history` for diff/restore.
- **On idle / disconnect:** final flush + index event onto `SEARCH_QUEUE`.

### Authorization

The collab auth extension calls into the same services as REST controllers:

- `PageAccessService.validateCanEdit(page, user)` for write
- `PageAccessService.validateCanView(page, user)` for read-only viewers (page can be loaded but writes are rejected)

If permissions change mid-session — for example, a page is restricted while you're editing — the server can disconnect the offending client and force re-auth.

### Scaling out

To run multiple API instances or a dedicated collab server:

1. **Redis pub/sub** is required. The Redis-sync extension fans out Yjs updates from the instance that received them to all peers.
2. **Sticky sessions are not required.** Any instance can serve any document; the Redis fan-out keeps them in sync.
3. **Standalone collab process** — `pnpm collab:dev` / `pnpm collab:prod` runs the same code with the API HTTP layer disabled. Useful when collaboration QPS dwarfs API QPS.

---

## Socket.io (`/socket.io`)

### What it carries

- **Presence** — who is currently on which page
- **Page tree updates** — created, moved, renamed, deleted pages so other clients refresh their tree
- **Comment events** — new comment, resolution, mention notifications
- **Notification feed** — in-app notifications pushed live
- **Workspace events** — settings updates that affect connected clients

### Code

```
apps/server/src/ws/
├── ws.gateway.ts             Socket.io gateway with Redis adapter
├── ws.module.ts
└── handlers/                 Per-event handlers
```

```
apps/client/src/features/websocket/
├── ws-client.ts              Socket.io client setup
└── hooks/useSocket.ts        React hook
```

### Multi-instance

Uses `@socket.io/redis-adapter` so emit events on one instance reach clients connected to another.

### Auth

Same JWT cookie/Bearer flow as REST. The handshake includes the cookie; the gateway rejects unauthenticated connections.

---

## When to use which channel

| You need to push… | Use |
|---|---|
| Editor content changes between users on the same page | **Hocuspocus** (already built into the editor) |
| "User X is viewing this page" indicator | **Socket.io** presence |
| "A new page was created in this space" — refresh sidebars | **Socket.io** page-tree event |
| "You were mentioned in a comment" toast | **Socket.io** notification |
| Cross-document mass operations (e.g. bulk move) | REST + **Socket.io** broadcast on completion |

A new feature should rarely need to extend Hocuspocus; it almost always wants Socket.io.

---

## Failure modes

- **Redis down.** Both channels stop syncing across instances. Single-instance mode still works.
- **Hocuspocus auth fails mid-session.** Client retries with exponential backoff. If a user's permissions changed, they're gracefully bumped to read-only.
- **Concurrent edits during a permission downgrade.** The downgraded user's pending updates are dropped at the auth boundary — no data merge, by design.
- **Long offline.** Yjs handles the merge when the client comes back. The "offline buffer" lives client-side in IndexedDB until reconnection.

---

## Related

- [`./editor.md`](./editor.md) — How Tiptap consumes the Yjs document.
- [`./permissions-model.md`](./permissions-model.md) — What `PageAccessService` does.
- [`../prd/06-collaboration.md`](../prd/06-collaboration.md) — Functional spec.
- [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md) — `PAGE_HISTORY`, `SEARCH_INDEX_PAGE` jobs.
