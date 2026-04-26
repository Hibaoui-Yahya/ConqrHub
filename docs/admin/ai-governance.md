# AI Governance

`Feature.AI` (Enterprise). How to enable, restrict, configure, and audit AI features.

For architecture, see [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md).

## The four AI surfaces

Each can be toggled independently per workspace:

| Surface | Toggle | What it does |
|---|---|---|
| **Generative AI (Ask AI)** | `workspace.settings.ai.generative` | In-editor "rewrite this", "summarize", "translate", … |
| **AI Search** | `workspace.settings.ai.search` | Natural-language Q&A with cited sources |
| **AI Chat** | `workspace.settings.ai.chat` | Multi-turn assistant with tool calling |
| **MCP** | `workspace.settings.ai.mcp` (and `Feature.MCP`) | Expose MCP endpoint to external clients |

**Settings → AI Settings.** Admin only.

## Provider configuration

Pick one of:

| Provider | When |
|---|---|
| **OpenAI** | Cloud default; mature; most capable models |
| **Google Gemini** | Alternative LLM with strong long-context |
| **Ollama** | Self-hosted local models — required for air-gapped |
| **OpenAI-compatible endpoint** | Azure OpenAI, vLLM, LiteLLM, TGI, custom routers |

For each, choose:

- **Chat model** — used by Generative AI, AI Chat, AI Search answer generation
- **Embedding model** — used by AI Search retrieval

Defaults can be set via env vars (see [`../deployment/environment-variables.md`](../deployment/environment-variables.md)) or per-workspace in the UI.

## Enabling AI from scratch

1. Confirm the workspace has `Feature.AI` (Enterprise).
2. **Settings → AI Settings → Provider** — choose OpenAI / Gemini / Ollama / custom.
3. Enter API keys / endpoints.
4. **Choose models** — chat + embedding.
5. **Toggle the surfaces** you want active (start with Generative AI, add Search/Chat as the org gets comfortable).
6. **Run a test query** — the settings page has a "Test connection" button.
7. **Communicate** the rollout to users — what's allowed, what data is sent to the provider.

## Disabling AI

If a security review flags the provider, disable surfaces independently:

- Toggle the relevant `ai.*` setting off — UI hides immediately.
- Existing AI chat history is preserved (until separately deleted).
- In-flight streams (open SSE connections) are terminated.

## Per-space exclusion (planned)

A future setting will let admins mark specific spaces as **AI-excluded** — pages in those spaces are never embedded or returned by retrieval, regardless of the requester's permissions. Until shipped, the workaround is to put sensitive content in a space with restricted access — the permission filter ensures retrieval excludes it for users without read access.

## Permission semantics

These are non-negotiable invariants:

1. **AI Search and AI Chat never return content from pages the requester can't see.** The retriever filters at query time.
2. **AI tool calls run with the user's permissions.** A `read_page` tool call is denied just like a REST call would be.
3. **AI does not cross workspaces.** Retrieval is scoped to the requester's workspace.

This means giving a user AI Chat access does *not* expand what they can read — it just makes reading easier.

## What gets sent to the provider

For each AI call, the prompt sent to the LLM includes:

| AI surface | Prompt contents |
|---|---|
| Generative AI | The selected text + the action / custom prompt |
| AI Search | The question + retrieved chunks (top-K from accessible pages) |
| AI Chat | Conversation history + tool schemas + retrieved content from `@page` mentions |
| MCP | Whatever the external client sends; tool calls run server-side |

If your provider stores prompts (most do, for some retention period), this is the data the provider sees. Cloud customers should align on a provider with a contractual data-handling agreement (e.g. OpenAI's enterprise tier with no-training).

## Token / cost monitoring

AI usage is logged and exposed in **Settings → Analytics → AI** (when shipped). Today the audit pipeline records each AI call category; cost estimation depends on the provider's pricing and is visible per-workspace.

## Audit events

- AI tool use that mutates data → standard mutation events (`PAGE_CREATED`, `PAGE_UPDATED`, etc.) with `actorType = 'api_key'` if via MCP, or `actorType = 'user'` for AI Chat.
- AI Chat itself does not currently emit per-message audit events (high volume) — the underlying tool calls do.

## Common policies

| Org posture | Suggested policy |
|---|---|
| **Conservative** | Generative AI on; AI Search off; AI Chat off; MCP off |
| **Standard** | Generative AI + AI Search on; AI Chat on; MCP off |
| **Mature** | All on; MCP keys restricted to admin-issued service accounts |
| **Air-gapped** | All on, Ollama provider, no external network |

## Related

- Architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- MCP tools: [`../reference/mcp-tools.md`](../reference/mcp-tools.md)
- Provider env vars: [`../deployment/environment-variables.md`](../deployment/environment-variables.md)
- AI PRD: [`../prd/08-ai-assistant-and-chat.md`](../prd/08-ai-assistant-and-chat.md)
