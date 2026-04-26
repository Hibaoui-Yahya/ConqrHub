# PRD 08 — AI Assistant & AI Chat

> **Source:** lines 796–946.

## Area overview

Four AI surfaces, all gated by `Feature.AI` (and `Feature.MCP` for MCP). Architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md).

## Epic 8.1 — AI Writing Assistant (Editor "Ask AI")

**User stories.**
- Improve writing quality with one click.
- Translate selected text.
- Generate FAQ / outline / introduction from notes.

**Acceptance criteria.**
- Available in editor through bubble menu / slash command.
- Permission + workspace toggle gates the feature.
- Streams output (SSE) for responsiveness.

**Actions.**
| Action | Effect |
|---|---|
| `IMPROVE_WRITING` | Rewrite for clarity and flow |
| `FIX_SPELLING_GRAMMAR` | Corrections |
| `MAKE_SHORTER` / `MAKE_LONGER` | Length adjustment |
| `SIMPLIFY` | Easier language |
| `CHANGE_TONE` | Formal / casual / friendly / … |
| `SUMMARIZE` / `EXPLAIN` | Condense / explain |
| `CONTINUE_WRITING` | Continue from cursor |
| `TRANSLATE` | Specific language |
| `CUSTOM` | Free-form prompt |

**Context awareness (planned/partial).** Selected text · current page title · current page content · space context · related pages · company glossary · user role + intent.

## Epic 8.2 — AI Chat

Multi-turn conversational assistant with **20 tools** for reading and writing the workspace. Conversations stored per user.

**User stories.**
- Multi-turn conversations about workspace content.
- Mention pages with `@page`.
- Upload files.
- Ask AI to create / update pages on my behalf.

**Acceptance criteria.**
- Persisted history with cursor pagination.
- Streaming responses (SSE).
- Cancellable (AbortController).
- Permission checked at every tool call.

**Modes.**
- **Page mode** — chat about current page (sidebar)
- **Space mode** — chat about a full space
- **Workspace mode** — across all accessible content (full page)
- **Creation mode** — generate new documentation
- **Admin mode** (planned) — analyze documentation quality and workspace health

**Tool catalogue (20).** See [`../reference/mcp-tools.md`](../reference/mcp-tools.md) — same tools used by AI Chat and MCP.

## Epic 8.3 — AI Documentation Generator (planned)

Generate complete documentation from a short brief.

**Inputs.** Product name · description · target users · main features · technical stack · deployment type · integrations · security needs.

**Outputs.** Product overview · user guide · admin guide · technical architecture · API docs · DB docs · deployment guide · security guide · FAQ · release notes.

## Epic 8.4 — AI Knowledge Gap Detection (planned)

Scan workspace and identify missing or weak documentation.

**Detects.** Missing pages · outdated · duplicated · contradictory · without owners · without verification · frequently searched topics with no results · unresolved comments · critical processes without runbooks.

## Epic 8.5 — Human-in-the-Loop Expert Insights

See [`./09-human-in-the-loop.md`](./09-human-in-the-loop.md).

## Epic 8.6 — AI Governance

`Feature.AI` admin controls. See [`../admin/ai-governance.md`](../admin/ai-governance.md).

**Functional requirements.**
- Enable / disable AI per workspace
- Enable / disable AI per space (planned per-space exclusion)
- Choose AI provider, model, embedding model
- Configure data retention for AI chats
- Disable external AI providers for sensitive spaces (planned)
- AI usage logs · token cost · feedback
- (Optional) prevent AI from answering from unverified pages

## MCP

`Feature.MCP` (Enterprise). Exposes the same 20 tools to external clients.

See [`../reference/mcp-tools.md`](../reference/mcp-tools.md).

## Cross-references

- Architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- Admin: [`../admin/ai-governance.md`](../admin/ai-governance.md)
- API: [`../reference/api.md`](../reference/api.md)
- Permission semantics: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md) (Permission-aware AI section)
