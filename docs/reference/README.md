# Reference

*Audience: Anyone who needs to **look something up**.*

Code-grounded, exhaustive lists. Each file is a flat reference — open it, search it, link it.

## Contents

### API & integrations
- [`api.md`](./api.md) — Full REST API: auth, base URL, pagination, streaming, every endpoint in this codebase.
- [`mcp-tools.md`](./mcp-tools.md) — The complete catalogue of MCP tools exposed to external AI clients (Claude Desktop etc.).

### Configuration
- [`feature-flags.md`](./feature-flags.md) — Every `Feature.*` constant, the tier that includes it, how it's enforced server- and client-side.
- [`settings-sidebar.md`](./settings-sidebar.md) — The complete tree of the Settings sidebar, with feature flag and required role on each item.

### Events & jobs
- [`audit-events.md`](./audit-events.md) — Every audit event type emitted by the system, grouped by category.
- [`notification-events.md`](./notification-events.md) — Every notification type (in-app + email).
- [`queues-and-jobs.md`](./queues-and-jobs.md) — Every BullMQ queue and job constant, with the file where each is defined.

### Data
- [`database-schema.md`](./database-schema.md) — Tables, columns, foreign keys, indexes — including enterprise-only tables.
- [`status-codes.md`](./status-codes.md) — Page status, verification status, share status, license type — every enum-like field with its allowed values.

### Editor & permissions
- [`editor-extensions.md`](./editor-extensions.md) — Every Tiptap extension exported from `packages/editor-ext`.
- [`permission-matrix.md`](./permission-matrix.md) — Workspace, space, and page permission matrices in one place.

## Conventions in this section

- Every claim is anchored to a file path in the repo. If a reference doc says a constant exists, you can grep for it.
- When a feature is gated, the tier badge appears: `[Free]` `[Business+]` `[Enterprise]`.
- When something is **planned but not yet implemented**, the entry is marked **(planned)**.
