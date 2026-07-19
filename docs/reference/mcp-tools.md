# MCP Reference

> **Status: implemented (Enterprise).** The MCP server is live at `POST /mcp` using JSON-RPC 2.0. It exposes 39 tools (34 without the ConqrPlane integration configured) that external AI clients can invoke against the workspace. AI Chat uses the same tool set. Connect any MCP-compatible client (Claude Desktop, Claude Code, Cursor, VS Code, LangGraph) or build a custom agent against the JSON-RPC endpoint directly.

ConqrHub's MCP (Model Context Protocol) endpoint lets external agents read, search, and modify the workspace with the same permissions as the user behind the API key. The agent integration is gated by the workspace `mcp` AI feature toggle (default: off — admins enable it from **Settings → AI → MCP**).

---

## Endpoint

| | |
|---|---|
| URL | `POST https://<your-host>/mcp` (no trailing slash, no `/api/` prefix) |
| Protocol | JSON-RPC 2.0 over HTTPS |
| Content type | `application/json` |
| Transport | Streamable HTTP. The `mcp-remote` bridge is also supported for stdio-only clients. |
| Auth | `Authorization: Bearer <API_KEY>` — created at Account Settings → API Keys |
| Feature gate | Requires `workspace.settings.ai.mcp = true` (Enterprise feature `Feature.MCP`) |

API keys carry the issuing user's identity. Every tool call runs with that user's workspace role + space memberships + page-level restrictions, exactly as if they were using the web UI. Rotate keys regularly — they default to a 30-day TTL.

---

## Protocol flow

### 1. `initialize`

Send first. The server negotiates the MCP protocol version: supported versions are `2025-06-18` (recommended), `2025-03-26`, and `2024-11-05`. If your client requests a supported version, the server echoes it back; otherwise the newest version is returned.

```json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": { "name": "my-agent", "version": "1.0.0" }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "ConqrHub MCP", "version": "0.80.1" }
  }
}
```

Per the MCP spec you may follow this with a `notifications/initialized` notification. This server accepts it as a no-op.

### 2. `tools/list`

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

Each tool comes back with a draft 2020-12 JSON Schema describing its arguments (input view — fields with `.default()` are non-required). Use this to constrain what your model is allowed to call.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "search_pages",
        "description": "Search the ConqrHub workspace for pages…",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "The search query" },
            "limit": { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 }
          },
          "required": ["query"]
        }
      }
      // …
    ]
  }
}
```

Rebuild your tool list at the start of each session — tools may be added between deploys.

### 3. `tools/call`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_pages",
    "arguments": { "query": "incident review", "limit": 5 }
  }
}
```

Success response:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "[ { \"id\": \"019e…\", \"title\": \"Q1 Incident Review\", … } ]" }
    ]
  }
}
```

The result shape is always `{ content: [{ type: "text", text }] }`. Non-string tool results are JSON-stringified — parse the `text` field client-side.

### 4. Other supported methods

| Method | Behavior |
|---|---|
| `notifications/initialized` | No-op, returns `{}` |
| `resources/list` | Returns `{ resources: [] }` — this server does not expose MCP resources |
| Anything else | JSON-RPC error `-32601 Unknown method` |

---

## Errors

**Tool-level errors** (permission denied, page not found, validation failed) come back inside `result` with `isError: true`. Your agent sees the message and can recover:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "Error: You do not have access to this page" }
    ],
    "isError": true
  }
}
```

**Protocol-level errors** (bad JSON, unknown method, internal server error) come back as a JSON-RPC `error`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": { "code": -32603, "message": "Internal error" }
}
```

**HTTP statuses**

| Code | Meaning |
|---|---|
| `200` | Always — inspect the body for `result` vs `error` / `isError` |
| `401` | Missing / malformed / expired API key — rotate and retry |
| `403` | MCP is disabled for the workspace, or the EE MCP feature is not licensed |
| `404` | Wrong URL — the endpoint is `/mcp`, not `/api/mcp` |

---

## Tools

39 tools across 9 categories (the 5 ConqrPlane work-item tools appear only when the Plane integration is configured). Limits and required arguments are taken from the live schema — fetch `tools/list` for the authoritative version.

### Search & RAG (2)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `search_pages` | `query` | `limit` (1–20, default 5) | Full-text search across pages the user can read. Returns ranked results with excerpts. |
| `rag_retrieve` | `question` | `spaceId` | Semantic search over indexed chunks. Returns labeled context chunks for grounding. |

### Pages — read (6)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `get_page` | `pageId` | — | Full content of a page (up to 8 000 characters). Truncate signal returned in metadata. |
| `get_page_breadcrumbs` | `pageId` | — | Ancestor path from the space root down to the page. |
| `get_page_comments` | `pageId` | `limit` (1–50, default 20) | Comments on a page. Same as `get_comments` (legacy alias removed). |
| `get_page_history` | `pageId` | `limit` (1–20, default 10) | Revision history without full content. |
| `list_child_pages` | `pageId` | `limit` (1–50, default 20) | Direct children of a page. |
| `list_recent_pages` | — | `limit` (1–20, default 10) | Most recently edited pages across all accessible spaces. |
| `list_space_pages` | `spaceId` | `parentPageId`, `limit` (1–50, default 20) | Pages in a space, optionally starting from a parent. |

### Pages — write (9)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `create_page` | `spaceId`, `title` | `content` (markdown), `parentPageId` | Create a new page. |
| `update_page` | `pageId` | `title`, `content`, `contentOperation` (`replace` \| `append` \| `prepend`, default `replace`) | Edit title and/or content in one call. |
| `update_page_title` | `pageId`, `title` | — | Rename only. |
| `update_page_content` | `pageId`, `content` | `operation` (`replace` \| `append` \| `prepend`, default `replace`) | Edit content only. |
| `add_diagram` | `pageId`, `type` (`mermaid`), `source` | `caption`, `position` (`append` \| `prepend`, default `append`) | Insert a diagram block. See [Diagrams](#diagrams) below. |
| `move_page` | `pageId` | `parentPageId` (null to move to space root) | Re-parent within the same space. |
| `duplicate_page` | `pageId` | — | Clone into the same space (prefixed `Copy of`). |
| `copy_page_to_space` | `pageId`, `targetSpaceId` | — | Clone into another space (read on source + write on target). |
| `move_page_to_space` | `pageId`, `targetSpaceId` | — | Move into another space (edit on source + write on target). |
| `delete_page` | `pageId` | — | Soft delete to trash (recoverable for 30 days). |

#### Diagrams

`add_diagram` lets an agent attach a rendered diagram to a page. Today only **Mermaid** is supported because the diagram body is plain text — the editor renders it client-side with `mermaid.js`. Pass the raw Mermaid source as `source`, without ``` fences:

```jsonc
{
  "name": "add_diagram",
  "arguments": {
    "pageId": "fkDQj507tR",
    "type": "mermaid",
    "source": "sequenceDiagram\n  Agent->>MCP: tools/call add_diagram\n  MCP->>Agent: { success: true }",
    "caption": "Fig 1: agent appends a sequence diagram",
    "position": "append"
  }
}
```

Mermaid supports flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, gantt charts, mindmaps, gitGraphs, pie charts, journey maps, and quadrant charts — see the [Mermaid syntax docs](https://mermaid.js.org/intro/) for the full grammar.

**Excalidraw** and **Drawio** are **not** creatable via MCP today. Both store the diagram as a scene that the server has to render into an SVG attachment before the editor node can reference it; that pipeline doesn't exist yet. Create those interactively in the web UI for now. If you need to add this, the work is: (a) accept the scene JSON or XML, (b) render server-side to SVG, (c) upload as an attachment, (d) emit an `excalidraw` / `drawio` node with `src` and `attachmentId`.

### Spaces — read (2)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `list_spaces` | — | `limit` (1–50, default 20) | Spaces the user is a member of. |
| `get_space` / `get_space_info` | `spaceId` | — | Name, slug, description, member count. |

### Spaces — write (2)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `create_space` | `name` (2–100), `slug` (2–100) | `description` | Workspace admin or owner only. |
| `update_space` | `spaceId` | `name`, `description` | Space admin or workspace admin. |

### Comments (4)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `get_page_comments` | `pageId` | `limit` (1–50, default 20) | Read comments on a page. |
| `create_comment` | `pageId`, `text` | — | Post a top-level comment. |
| `update_comment` | `commentId`, `text` | — | Edit a comment (only the creator). |
| `delete_comment` | `commentId` | — | Delete a comment (creator or space admin). |

### Attachments (1)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `search_attachments` | — | `query`, `pageId`, `spaceId`, `limit` (1–50, default 20) | Find file attachments by name or location. |

### Users (2)

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `get_current_user` | — | — | The user the API key represents. |
| `list_workspace_members` | — | `limit` (1–50, default 20) | Members visible to the requester. |

### ConqrPlane work-item tools (5)

Cross-product tools that let the suite assistant (chat + MCP) read and create work items in **ConqrPlane** (the Conqr suite's work-management app) through the integration layer's Plane REST adapter. **These tools appear only when the Plane integration is configured** — `PLANE_API_URL`, `PLANE_API_KEY`, and `PLANE_WORKSPACE_SLUG` are all set. On an unconfigured deployment they are absent from `tools/list` entirely, so an agent never sees or advertises dead tools.

| Tool | Required args | Optional | Purpose |
|---|---|---|---|
| `list_conqrplane_projects` | — | — | List projects in the configured ConqrPlane workspace. Returns `{ id, name, identifier }[]`. Use to find a project ID before searching or creating work items. |
| `search_work_items` | `projectId` | `query`, `limit` (1–50, default 20) | Search work items in a project by name. Returns `{ id, name, sequenceId, state, priority, updatedAt }[]`. |
| `get_work_item` | `projectId`, `workItemId` | — | Fetch one work item, including its description. Returns the same summary shape plus `description`. |
| `create_work_item` | `projectId`, `name` | `description`, `priority` (`urgent` \| `high` \| `medium` \| `low` \| `none`) | Create a work item. Plain-text `description` is wrapped in `<p>` automatically; a value already starting with `<` is passed through as-is. An `X-Conqr-On-Behalf-Of` header is sent for future attribution, but ConqrPlane does not yet consume it — writes currently appear as the integration API-key user. Use only after explicit user confirmation. |
| `get_project_cycles` | `projectId` | — | List a project's cycles (iterations) with `{ id, name, start_date, end_date }`. Use for status questions like "what is in the current cycle". |

Errors from the Plane API (timeouts, 4xx/5xx, or an unconfigured integration) are never thrown through to the transport — each tool catches `PlaneApiError` (and any other failure) and resolves to a structured `{ error: "ConqrPlane request failed (...): ..." }` object instead, so the model can read the message and recover rather than seeing a raw exception.

---

## Authorization model

Every tool re-checks the API key user's permissions on the resource being touched. There is no separate MCP permission layer — the same CASL rules that protect the REST API and UI also protect MCP.

| Surface | Check |
|---|---|
| `search_*`, `list_*`, `get_*` on pages | Filtered to pages the user can read (space membership + page-level restrictions) |
| `create_page`, `update_page*`, `move_page`, `delete_page` | Requires page-level edit permission |
| `copy_page_to_space`, `move_page_to_space` | Read on source + write on target space |
| `create_space`, `update_space` | Workspace admin or owner |
| `create_comment`, `update_comment` | Comment permission on the page |
| `delete_comment` | Comment creator, or space admin |
| `list_workspace_members` | Returns only members the requester can see (visibility rules) |
| `list_conqrplane_projects`, `search_work_items`, `get_work_item`, `create_work_item`, `get_project_cycles` | Not CASL-gated — visible only when the Plane integration is configured. `create_work_item` sends an on-behalf-of header for future attribution; until ConqrPlane consumes it, writes appear as the integration API-key user. |

A failure surfaces as a tool result with `isError: true` and a human-readable message — never a silent partial success.

---

## SDK examples

### TypeScript / Node

```ts
// npm i @modelcontextprotocol/sdk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("https://app.conqrhub.com/mcp"),
  {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.CONQRHUB_API_KEY}` },
    },
  },
);

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: "search_pages",
  arguments: { query: "onboarding", limit: 5 },
});
```

### Python

```py
# pip install mcp
import asyncio, os
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    headers = {"Authorization": f"Bearer {os.environ['CONQRHUB_API_KEY']}"}
    async with streamablehttp_client("https://app.conqrhub.com/mcp", headers=headers) as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool(
                "search_pages", {"query": "onboarding", "limit": 5}
            )
            print(result)

asyncio.run(main())
```

### LangGraph

```py
# pip install langchain-mcp-adapters langgraph langchain-anthropic
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "conqrhub": {
        "transport": "streamable_http",
        "url": "https://app.conqrhub.com/mcp",
        "headers": {"Authorization": f"Bearer {API_KEY}"},
    }
})

tools = await client.get_tools()
agent = create_react_agent("anthropic:claude-opus-4-7", tools)
```

---

## Guardrails for agent authors

- Tools marked **(write)** mutate the workspace. Only call them after explicit user confirmation. There is no transactional rollback for bulk operations.
- `delete_page` is a **soft** delete (trash, recoverable for 30 days). There is no permanent-delete tool over MCP by design — that requires the web UI with admin confirmation.
- `get_page` caps content at **8 000 characters**. For long pages, walk the hierarchy with `list_child_pages` or read structured fragments by section.
- `list_*` tools cap `limit` at 20 or 50. Iterate by changing the starting point (parent page, space) rather than asking for more in one call.
- Treat each tool description as the source of truth. Rebuild your tool list from `tools/list` at the start of each session instead of hardcoding.
- Permissions are enforced server-side per call — probing access is safe.
- API keys expire after 30 days by default. Surface 401 errors to the user with a "rotate your key" hint.

---

## Differences from AI Chat

- AI Chat invokes the **same tool set** through the workspace's chosen LLM. MCP exposes the same tools to **external** clients.
- AI Chat respects `workspace.settings.ai.chat`. MCP respects `workspace.settings.ai.mcp`.
- Both surfaces hit the same backend services with the same CASL checks; behavior is identical end-to-end.

## Adding a new MCP tool

1. Add a `*.tool.ts` under `apps/server/src/ee/ai/chat/tools/` implementing `ChatTool` (name, description, Zod `parameters`, `execute`).
2. Register it in `apps/server/src/ee/ai/chat/ai-chat.module.ts` providers.
3. Write a `*.tool.spec.ts` covering happy path + permission denial.
4. Update this reference and `docs/architecture/ai-subsystem.md`.
5. The JSON Schema for the tool is generated automatically at `tools/list` time via `z.toJSONSchema(parameters, { io: 'input' })` — no manual schema work needed.

---

## Related

- AI subsystem architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- API key admin: [`../admin/api-keys.md`](../admin/api-keys.md)
- AI governance: [`../admin/ai-governance.md`](../admin/ai-governance.md)
- Workspace AI toggles: [`../admin/ai-governance.md#feature-toggles`](../admin/ai-governance.md#feature-toggles)
