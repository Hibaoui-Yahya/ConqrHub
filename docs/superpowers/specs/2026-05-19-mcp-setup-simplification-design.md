# MCP Setup Simplification — Design

**Date:** 2026-05-19
**Status:** Draft for review
**Owner:** Yahya Hibaoui

## Problem

The MCP server at `POST /mcp` and `/mcp/stream` exposes 20+ tools and works today, but the in-app settings page (`apps/client/src/ee/ai/components/mcp-settings.tsx`) only shows the server URL and a plain list of tool names. A user who wants to connect Claude Desktop, Claude Code, Cursor, VS Code, or a LangGraph app has to leave the product, find external documentation, and hand-author a config file. That friction blocks adoption.

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
| VS Code | `settings.json` snippet under `mcp.servers` (native http) | active |
| LangGraph (Python) | `langchain-mcp-adapters` + `create_react_agent` snippet | active |
| ConqrKnowledge | Disabled tab with a "Coming soon" alert | placeholder |

Each active tab renders a `<CodeHighlight>` block with `${mcpUrl}` interpolated and `YOUR_API_KEY` left as a literal, plus a copy button using the existing `CopyButton` component. The current top-of-page URL field stays as a reference.

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

## Snippet content

URLs reference `mcpUrl = ${getAppUrl()}/mcp`. `YOUR_API_KEY` stays as a literal in every snippet.

**Claude Desktop** — `claude_desktop_config.json`:

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

**Claude Code** — two CLI alternatives:

```bash
# Recommended: native HTTP transport
claude mcp add conqrhub --transport http ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"

# Alternative: via mcp-remote (older Claude Code versions)
claude mcp add conqrhub -- npx -y mcp-remote ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"
```

**Cursor** — `.cursor/mcp.json`:

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

**VS Code** — `settings.json` under `mcp.servers`:

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

**LangGraph (Python)**:

```python
# pip install langchain-mcp-adapters langgraph langchain-anthropic
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "conqrhub": {
        "transport": "streamable_http",
        "url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer YOUR_API_KEY"},
    }
})

tools = await client.get_tools()
agent = create_react_agent("anthropic:claude-opus-4-7", tools)
```

**ConqrKnowledge** — disabled tab content:

> Coming soon — ConqrHub will connect to ConqrKnowledge for RAG, GraphRAG, and multimodal retrieval.

## Testing

- No new automated tests. The component is presentational; pure JSX with copy buttons. Existing MCP tool unit tests cover behavior changes that would matter, and there are none here.
- Manual verification flow:
  1. `pnpm run dev`, log in, enable MCP in settings.
  2. Click through each active tab, copy the snippet, paste it elsewhere, and confirm `${mcpUrl}` rendered correctly and `YOUR_API_KEY` was preserved.
  3. Run the Claude Code snippet end-to-end with a real API key to confirm the connection works against the running dev server.
  4. Confirm the ConqrKnowledge tab renders as disabled / "coming soon" and is not selectable as the default tab.

## Risks and mitigations

- **Mantine `<CodeHighlight>` may not be installed** — verify before implementation. Fallback: use `<Code block>` with manual styling, which is already in use across the app.
- **Snippet drift over time** (Claude Code flag names change, etc.). Mitigation: snippets live in one small file (`mcp-setup-snippets.tsx`); future updates are a one-file edit.
- **i18n.** Strings inside snippets stay verbatim; only the surrounding labels and captions go through `t()`, matching the existing pattern in `mcp-settings.tsx`.

## Out of scope (tracked for future specs)

- ConqrKnowledge backend: RAG / GraphRAG / multimodal retrieval pipeline.
- LangGraph server-side agent runtime.
- API key generation embedded in the MCP settings page.
- Snippet-registry refactor (only worthwhile if we grow beyond ~10 clients).
