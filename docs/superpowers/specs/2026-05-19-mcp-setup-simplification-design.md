# MCP Setup Simplification — Design

**Date:** 2026-05-19
**Status:** Draft for review
**Owner:** Yahya Hibaoui

## Problem

The MCP server at `POST /mcp` exposes the documented set of 20 tools and works today, but the in-app settings page (`apps/client/src/ee/ai/components/mcp-settings.tsx`) only shows the server URL and a plain list of tool names. A user who wants to connect Claude Desktop, Claude Code, Cursor, VS Code, or a LangGraph app has to leave the product, find external documentation, and hand-author a config file. That friction blocks adoption.

## Goal

Make MCP connection trivial: from the MCP settings page, a user picks their client from a tab, copies a ready-to-paste snippet with their workspace URL pre-filled, swaps in an API key, and is connected.

## Non-goals

- No server rename. The MCP server keeps reporting `name: 'ConqrHub MCP'` in its `initialize` response.
- No new MCP tools. The 20 documented tools already exist.
- No GraphRAG, multimodal retrieval, or "ConqrKnowledge" backend — that is a separate future initiative, represented here only by a disabled "Coming soon" tab.
- No real LangGraph server-side integration. The LangGraph tab is a Python snippet showing users how to consume the existing MCP endpoint via `langchain-mcp-adapters`.
- No API key generation flow from inside the MCP page. The snippet renders `YOUR_API_KEY` as a literal placeholder; users obtain keys from the existing API Keys settings.
- No new tests. The change is presentational; existing MCP unit tests stay green and serve as the regression net.

## Approach

Tabbed snippets inside `mcp-settings.tsx` using Mantine `<Tabs>`. Six tabs:

| Tab | Snippet | Status |
|---|---|---|
| Claude Desktop | `claude_desktop_config.json` JSON using `mcp-remote` | active |
| Claude Code | Two `claude mcp add` CLI commands (native http + mcp-remote fallback) | active |
| Cursor | `.cursor/mcp.json` JSON using `mcp-remote` | active |
| VS Code | `.vscode/mcp.json` (workspace) or `settings.json` (global), native http transport | active |
| LangGraph (Python) | `langchain-mcp-adapters` + `create_react_agent` snippet | active |
| ConqrKnowledge | Disabled tab with a "Coming soon" alert | placeholder |

Each active tab renders a `<CodeHighlight>` block with `${mcpUrl}` interpolated and `YOUR_API_KEY` left as a literal, plus a copy button using the existing `CopyButton` component. The current top-of-page URL field stays as a reference.

**Defaults:** "Claude Desktop" is the default selected tab on first render. The ConqrKnowledge tab is disabled (not selectable as default, visibly distinct via a `<Badge>` reading "Soon").

**Caption per tab:** A single line below the snippet — "Replace `YOUR_API_KEY` with a key from Account Settings → API Keys" — with the "API Keys" portion linking to the existing route.

### Why this approach

- **No new abstraction.** Five active tabs is small enough that a snippet-registry module would be over-engineering. A flat list of components is easier to read and tweak per client.
- **No backend churn.** All snippet content is static templates rendered client-side from `mcpUrl`.
- **Recoverable.** If we add more clients later (10+), refactoring inline JSX into a `clients.ts` registry is mechanical.

### Approaches considered and rejected

- **Server-rendered config files via download endpoints.** Adds endpoints and routing for no benefit — the URL is already known on the client.
- **Snippet registry module up front.** YAGNI at five entries.
- **One-click API key generation embedded in the page.** Out of scope; the user explicitly chose placeholder-only.

## Files affected

| File | Action | Approx. LOC |
|---|---|---|
| `apps/client/src/ee/ai/components/mcp-settings.tsx` | Replace the static "Supported tools" list with `<Tabs>` containing the six snippet panels | ~80 changed |
| `apps/client/src/ee/ai/components/mcp-setup-snippets.tsx` | New file holding the six snippet panel components | ~170 new |

No server changes. No migrations. No new dependencies (Mantine `<Tabs>` and `<CodeHighlight>` are already in use elsewhere in the app).

## Endpoint and auth (verified)

- **Endpoint:** `${getAppUrl()}/mcp` — the JSON-RPC POST endpoint mounted by `McpController`. Verified against `apps/server/src/main.ts:39-41` (global `/api` prefix excludes `'mcp'`) and `apps/server/src/ee/ai/mcp/mcp.controller.ts:17` (`@Controller('mcp')`).
- **Auth:** `Authorization: Bearer <API_KEY>` header. Verified against `apps/server/src/core/auth/strategies/jwt.strategy.ts:28` (`extractBearerTokenFromHeader`) and `apps/server/src/ee/api-key/api-key.service.ts:73-103` (API key tokens are JWTs validated by the same strategy).
- **Note on `/mcp/stream`:** `McpStreamController` exists but is currently reachable at `/api/mcp/stream`, which means it inherits the workspace pre-handler on `/api` routes (`main.ts:62-86`) and is not usable by external clients carrying only an API key. The simple POST at `/mcp` is the canonical public surface. This spec deliberately does not surface `/mcp/stream` to users.
- **HTTPS:** required in production. API keys are bearer tokens — sniffable over plain HTTP. The settings page will display the URL as-served by the server (so HTTPS deployments produce HTTPS snippets automatically).

## Snippet conventions

- `${mcpUrl}` in this spec means the literal URL the component renders at runtime (e.g. `https://wiki.example.com/mcp`). It is interpolated when the snippet panel mounts.
- `YOUR_API_KEY` is rendered verbatim — never substituted. Users replace it after copying.
- The local server name in each client config is `conqrhub` by convention. Users may rename it; everything downstream uses that key only locally in their client.

## Snippet content

### Claude Desktop — `claude_desktop_config.json`

Location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

```json
{
  "mcpServers": {
    "conqrhub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Restart Claude Desktop after editing. Verify under Settings → Developer → MCP Servers.

### Claude Code (CLI) — two equivalent options

```bash
# Recommended: native HTTP transport (Claude Code ≥ 1.0).
claude mcp add conqrhub --transport http ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"

# Fallback: via mcp-remote if your Claude Code version doesn't accept --transport http.
claude mcp add conqrhub -- npx -y mcp-remote ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"
```

Verify with `claude mcp list`. The server should appear and `claude mcp get conqrhub` should show the URL.

### Cursor — `.cursor/mcp.json`

Workspace file. Create at the repo root if it does not exist.

```json
{
  "mcpServers": {
    "conqrhub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Reload Cursor (`Cmd/Ctrl+Shift+P` → "Reload Window"). Verify under Settings → Features → MCP.

### VS Code — `.vscode/mcp.json` (workspace) or `settings.json` (global)

**Workspace file** (recommended — keeps config with the project):

```json
{
  "servers": {
    "conqrhub": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Or in user `settings.json`** (global across workspaces):

```json
{
  "mcp": {
    "servers": {
      "conqrhub": {
        "type": "http",
        "url": "${mcpUrl}",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    }
  }
}
```

Requires VS Code 1.99+. Verify with `MCP: List Servers` from the command palette.

### LangGraph (Python)

Requires Python 3.10+.

```python
# pip install langchain-mcp-adapters langgraph langchain-anthropic
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "conqrhub": {
        "transport": "streamable_http",
        "url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer YOUR_API_KEY"},
    }
})

async def main():
    tools = await client.get_tools()
    agent = create_react_agent("anthropic:claude-opus-4-7", tools)
    result = await agent.ainvoke({
        "messages": [("user", "List the spaces I have access to.")]
    })
    print(result["messages"][-1].content)

if __name__ == "__main__":
    asyncio.run(main())
```

For production, read the API key from an environment variable (`os.environ["CONQRHUB_API_KEY"]`) rather than embedding it.

### ConqrKnowledge — placeholder

Disabled tab. Renders a Mantine `<Alert>`:

> **Coming soon.** ConqrHub will connect to ConqrKnowledge for retrieval-augmented generation (RAG), GraphRAG, and multimodal search. No setup needed today.

## Verification matrix (for the implementation plan)

| Client | What "works" looks like |
|---|---|
| Claude Desktop | Restart → MCP Servers list shows `conqrhub`. In a chat, `@conqrhub` tools appear (e.g. `search_pages`). A `search_pages` call returns JSON. |
| Claude Code | `claude mcp list` shows `conqrhub`. A test prompt that calls `get_current_user` returns the authenticated user's name. |
| Cursor | Reload window → MCP panel shows `conqrhub` green. Agent mode can call `list_spaces`. |
| VS Code | `MCP: List Servers` shows `conqrhub`. Agent-mode chat can list tools and call `list_spaces`. |
| LangGraph | The Python script above prints a non-empty space list. Network tab shows POST to `/mcp` with `Authorization: Bearer …`. |

## Testing

- **No new automated tests.** The change is presentational JSX + copy buttons. Existing MCP tool unit tests stay as the regression net for protocol behavior.
- **Manual UI verification** (every tab):
  1. `pnpm run dev`, log in, enable MCP in settings.
  2. For each tab, copy the snippet and paste into a scratch buffer. Confirm the URL interpolated to the real `${APP_URL}/mcp` and `YOUR_API_KEY` is still literal.
  3. Confirm the ConqrKnowledge tab is visibly disabled (Soon badge) and not selectable as default.
- **End-to-end client verification** — minimum bar before merging: complete the Claude Code row of the Verification Matrix above with a real API key against `pnpm run dev`. The other rows are documentation correctness rather than functional behavior of this PR (they exercise the same `/mcp` endpoint with the same auth) and can be smoke-tested post-merge.

## Risks and mitigations

- **Mantine `<CodeHighlight>` may not be installed.** Verify at implementation start with `pnpm list @mantine/code-highlight` in `apps/client`. Fallback: Mantine `<Code block>` (already used in `apps/client/src/ee/ai/components/mcp-settings.tsx` siblings) with `white-space: pre` styling.
- **`mcp-remote` version drift.** The `-y` flag pins nothing — npm will fetch latest. If a breaking release ships, the snippets stop working. Mitigation: snippets live in one file (`mcp-setup-snippets.tsx`); a pin to a known-good version is a one-line edit.
- **Claude Code flag changes.** `--transport` and `--header` are stable on current Claude Code, but the spec includes a fallback `mcp-remote` form so a single client never has zero working snippet.
- **VS Code MCP API maturity.** VS Code MCP support is recent (1.99+). Older installs will not see the server. The caption notes the version requirement.
- **i18n.** Surrounding labels (tab titles, captions) go through `t()` matching the existing pattern; snippet bodies stay verbatim. Tab titles ("Claude Desktop", "Cursor", etc.) are product names and stay untranslated regardless of locale.
- **HTTPS leakage of API keys.** Out of scope for this UI change, but the caption will mention "Keep your API key secret — it grants full workspace access."
- **`/mcp/stream` confusion.** The stream controller mounts under `/api/` and is unreachable for external clients. The spec deliberately points users at `/mcp` only. A follow-up may remove the stream controller entirely; that is a separate cleanup.

## Out of scope (tracked for future specs)

- ConqrKnowledge backend: RAG / GraphRAG / multimodal retrieval pipeline.
- LangGraph server-side agent runtime.
- API key generation embedded in the MCP settings page.
- Snippet-registry refactor (only worthwhile if we grow beyond ~10 clients).
