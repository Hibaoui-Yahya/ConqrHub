# Architecture

*Audience: Tech leads, new engineers onboarding, anyone reasoning about the system.*

How ConqrAI Wiki is built — the shape of the codebase, the boundaries between processes, and the design decisions behind the major subsystems.

## Contents

### Foundations
- [`overview.md`](./overview.md) — The 30,000-foot view: monorepo, processes, data plane, request lifecycle, license tiers.
- [`backend.md`](./backend.md) — NestJS modules, dependency injection, Fastify, Kysely repositories, request flow.
- [`frontend.md`](./frontend.md) — React 18 SPA, Mantine, Jotai, TanStack Query, routing, code-splitting, EE module boundaries.

### Major subsystems
- [`realtime-collaboration.md`](./realtime-collaboration.md) — Hocuspocus + Yjs CRDT, the `/collab` WebSocket, presence, persistence, the standalone collab process.
- [`editor.md`](./editor.md) — Tiptap + ProseMirror, custom nodes in `packages/editor-ext`, slash commands, paste handling, collaboration-aware extensions.
- [`permissions-model.md`](./permissions-model.md) — CASL ability factory, the four permission layers (workspace → space → page → feature), inheritance, validation services.
- [`ai-subsystem.md`](./ai-subsystem.md) — Generative AI, AI Search, AI Chat, MCP, providers (OpenAI / Gemini / Ollama / OpenAI-compatible), streaming, tool calling, retrieval pipeline.
- [`search-subsystem.md`](./search-subsystem.md) — Postgres `tsvector` search, Typesense driver, attachment indexing, permission-aware filtering, ranking.

### Cross-cutting
- [`enterprise-edition.md`](./enterprise-edition.md) — How the EE submodule is loaded dynamically, why `apps/server/src/ee/` is empty in OSS clones, `packages/ee/` license stub, fallback behavior when EE is missing.
- [`feature-gating.md`](./feature-gating.md) — `Feature` constants, `LicenseCheckService`, cloud vs self-hosted resolution, the entitlement atom on the client, `useHasFeature` hook, upgrade-label semantics.

## How to use this section

If you're new to the codebase, read in order:
1. `overview.md` (15 min)
2. `backend.md` and `frontend.md` (30 min total)
3. The subsystem you're about to work on
4. `feature-gating.md` if you'll touch anything paid

For exact APIs, schemas, or flag lists, jump to [`../reference/`](../reference/README.md).
