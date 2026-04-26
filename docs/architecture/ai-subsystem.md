# AI Subsystem

ConqrAI Wiki ships four AI-powered surfaces, all gated behind `Feature.AI` (and `Feature.MCP` for the MCP endpoint):

1. **Generative AI / Ask AI** — in-editor assistant (improve writing, summarize, translate, …)
2. **AI Search / AI Answers** — natural-language Q&A with cited workspace sources
3. **AI Chat** — multi-turn conversational assistant with tool calling
4. **MCP** — Model Context Protocol endpoint for external AI clients

All four share a provider layer, an authorization layer, and the same retrieval pipeline where applicable.

## Workspace toggles

Each surface has an independent on/off switch on the workspace, so admins can enable, say, AI Search without enabling AI Chat:

```ts
workspace.settings.ai = {
  generative: boolean,   // Ask AI in editor
  search: boolean,       // AI Search / AI Answers
  chat: boolean,         // AI Chat
  mcp: boolean,          // Model Context Protocol
}
```

UI: **Settings → AI** (admin only).

## Provider layer

Built on the **Vercel AI SDK** so the same code works across providers. Configured providers:

| Provider | Notes |
|---|---|
| **OpenAI** | Default for cloud |
| **Google Gemini** | Alternative LLM |
| **Ollama** | Local models — important for self-hosted air-gapped |
| **OpenAI-compatible endpoints** | LiteLLM, Azure OpenAI, vLLM, … |

Provider configuration is workspace-scoped. Self-hosted operators set provider URLs and API keys via env vars or workspace settings; cloud uses managed defaults.

## Generative AI (Ask AI)

In-editor actions on selected text. Implemented via:

- **Server:** `POST /api/ai/generate` (one-shot), `POST /api/ai/generate/stream` (SSE)
- **Client:** `apps/client/src/ee/ai/` — bubble-menu integration

Actions exposed:

| Action | What it does |
|---|---|
| `IMPROVE_WRITING` | Rewrite for clarity and flow |
| `FIX_SPELLING_GRAMMAR` | Corrections |
| `MAKE_SHORTER` / `MAKE_LONGER` | Length adjustment |
| `SIMPLIFY` | Easier language |
| `CHANGE_TONE` | Formal / casual / friendly / … |
| `SUMMARIZE` | Summary |
| `EXPLAIN` | Plain-English explanation |
| `CONTINUE_WRITING` | Continue from cursor |
| `TRANSLATE` | To target language |
| `CUSTOM` | Free-form prompt with selected text as context |

The DTO:

```ts
interface AiGenerateDto {
  action?: AiAction;
  content: string;     // selected text or page content
  prompt?: string;     // when action is CUSTOM
}
```

These calls do **not** retrieve external pages — context is only what the client supplies.

## AI Search (AI Answers)

Natural-language Q&A grounded in workspace pages.

- **Endpoint:** `POST /api/ai/answers` (SSE-streamed)
- **Storage:** Vector embeddings of page chunks indexed in a separate table
- **Retrieval:** Permission-filtered semantic search (top-K)
- **Response:**

```ts
interface IAiSearchResponse {
  answer: string;
  sources?: Array<{
    pageId: string;
    title: string;
    slugId: string;
    spaceSlug: string;
    similarity: number;
    distance: number;
    chunkIndex: number;
    excerpt: string;
  }>;
}
```

The retrieval layer **never returns chunks from pages the user can't view**. The LLM is given retrieved chunks plus the question, asked to answer concisely, and required to cite the chunks it used.

## AI Chat

Full multi-turn assistant. Implemented in `apps/client/src/ee/ai-chat/` and the EE server module.

### Endpoints

```
POST  /ai/chats/create     Create a chat
POST  /ai/chats            List chats (paginated)
POST  /ai/chats/info       Get chat + messages
POST  /ai/chats/delete
POST  /ai/chats/update     Rename / update title
POST  /ai/chats/search     Search across chats
POST  /api/ai/chats/send   Send message — SSE stream of response
POST  /ai/chats/upload     Attach a file
```

### Message model

```ts
type AiChatMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any;
  metadata?: any;
  createdAt: string;
};
```

### Streaming protocol

SSE events on `POST /api/ai/chats/send`:

```ts
type AiChatStreamEvent =
  | { type: 'chat_created'; chatId: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: any }
  | { type: 'tool_result'; id: string; result: any }
  | { type: 'done'; messageId: string; usage?: any }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };
```

The client uses `AbortController` to cancel in-flight streams.

### Tool calling

The chat assistant has access to **20 tools** that can read and write the workspace:

| Tool | Purpose |
|---|---|
| `search_pages` | Full-text search workspace pages |
| `get_page` | Read a page by ID |
| `create_page` | Create a new page |
| `update_page` | Edit a page |
| `list_pages` | Pages in a space |
| `list_child_pages` | Children of a page |
| `duplicate_page` | Duplicate |
| `copy_page_to_space` | Copy across spaces |
| `move_page` | Reorder within space |
| `move_page_to_space` | Cross-space move |
| `get_space` / `list_spaces` / `create_space` / `update_space` | Space operations |
| `get_comments` / `create_comment` / `update_comment` | Comments |
| `search_attachments` | Find file attachments |
| `list_workspace_members` / `get_current_user` | People |

**Every tool call is permission-checked** at the same `PageAccessService` chokepoint that REST controllers use. The LLM cannot bypass authorization through tool calls.

### Modes (UX)

- **Sidebar mode** — when on a page, chat renders as a side panel with that page in context.
- **Full-page mode** — `/chat` route. Cross-workspace conversations.
- **`@page` mention** — type `@` to inject a page's content into the chat context explicitly.

### History

Chats are persisted per user with cursor pagination. Search across history is implemented as a Postgres tsvector search on chat content.

## MCP (Model Context Protocol)

Exposes the AI Chat tool catalogue to **external AI clients** (Claude Desktop, internal AI agents, …).

- **Endpoint:** `GET/POST /mcp` (MCP protocol)
- **Auth:** Bearer API key. Workspace API keys can be issued from Settings → API Management.
- **Tools:** Identical set to AI Chat (20 tools).
- **Workspace toggle:** `workspace.settings.ai.mcp = true`

Use cases:

- A Claude Desktop user adds the workspace as an MCP server and can ask Claude to search and update internal docs.
- An internal AI agent (e.g. a deployment agent) reads runbooks via MCP before executing.
- A customer-support agent retrieves verified answers from the wiki and surfaces them in tickets.

For the per-tool input schema, see [`../reference/mcp-tools.md`](../reference/mcp-tools.md).

## Permission model recap

The non-negotiable invariants:

1. **No retrieval of unauthorized content.** The retriever filters at query time; embeddings of restricted pages can be in the index but are never returned to the LLM for users without access.
2. **No tool-call escalation.** Tools wrap REST services; same auth as a logged-in REST call.
3. **No cross-workspace leak.** All retrieval is scoped to the requester's workspace.
4. **Auditable.** AI tool use generates audit events when sensitive (creates / updates / deletes).

## Cost / governance

- **Per-workspace toggles** for each AI surface
- **AI usage logs** (token count, model, cost estimate) — viewable by admins
- **Sensitive-space exclusion** — admins can opt a space out of AI retrieval (planned)
- **Provider routing** — workspace can select which provider to use; air-gapped deployments point at Ollama or a local OpenAI-compatible endpoint

## Related

- Provider configuration: [`../admin/ai-governance.md`](../admin/ai-governance.md)
- Full MCP tool reference: [`../reference/mcp-tools.md`](../reference/mcp-tools.md)
- Search subsystem (full-text path): [`./search-subsystem.md`](./search-subsystem.md)
- Formal PRD: [`../prd/08-ai-assistant-and-chat.md`](../prd/08-ai-assistant-and-chat.md)
