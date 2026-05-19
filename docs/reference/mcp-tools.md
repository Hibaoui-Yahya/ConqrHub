# MCP Tools Reference

> **Status: implemented (Enterprise).** The MCP server is live at `POST /mcp` using JSON-RPC 2.0. It exposes 22 tools that external AI clients can invoke against the workspace. The `@modelcontextprotocol/sdk` is used for transport. AI Chat uses the same tool set. Use `mcp-remote` or the `/mcp` URL directly to connect AI clients (Claude Desktop, Claude Code, VS Code, Cursor).

The Model Context Protocol (`Feature.MCP`, Enterprise) endpoint at `/mcp` exposes 22 tools that external AI clients can invoke against the workspace. AI Chat uses the same tool set.

**Authentication:** Bearer API key (`Feature.API_KEYS`).
**Authorization:** Every call goes through the same permission checks as a logged-in REST request — the API key represents a user with their access scope.

| Tool | Reads / Writes | Purpose |
|---|---|---|
| `search_pages` | Read | Full-text search across the user's accessible pages |
| `get_page` | Read | Fetch a page by ID — content, metadata, permissions |
| `create_page` | Write | Create a new page in a space |
| `update_page` | Write | Edit a page's title and content |
| `list_pages` | Read | List pages in a space (paginated) |
| `list_child_pages` | Read | List children of a given page |
| `duplicate_page` | Write | Duplicate within the same space |
| `copy_page_to_space` | Write | Copy across spaces |
| `move_page` | Write | Reorder within a space (set parent / index) |
| `move_page_to_space` | Write | Cross-space move |
| `get_space` | Read | Space details |
| `list_spaces` | Read | List all spaces visible to the user |
| `create_space` | Write | New space (requires admin) |
| `update_space` | Write | Edit space settings (requires admin / space admin) |
| `get_comments` | Read | Comments on a page |
| `create_comment` | Write | Add comment |
| `update_comment` | Write | Edit own comment |
| `search_attachments` | Read | Search within uploaded attachments (requires `attachment:indexing`) |
| `list_workspace_members` | Read | Workspace members (filtered by visibility rules) |
| `get_current_user` | Read | The user the API key represents |

## Permission filtering — by tool

| Tool | Authorization |
|---|---|
| `search_pages`, `list_pages`, `list_child_pages`, `get_page` | Filtered to pages the user can view (CASL + page restriction) |
| `create_page`, `update_page` | Requires write on the target space / page |
| `delete_page` | (Not exposed — deletion goes through REST + UI confirmation) |
| `copy_page_to_space`, `move_page_to_space` | Requires read on source + write on target |
| `create_space`, `update_space` | Requires admin (workspace or space) |
| `create_comment`, `update_comment` | Requires comment permission |
| `list_workspace_members` | Returns only members the requester can see |

## Use cases

- **Claude Desktop reads company docs.** A user adds the workspace to Claude Desktop as an MCP server. Claude can then search and read pages on demand.
- **Internal AI agents create or update docs.** A deployment agent can `create_page` for a release note after every deploy.
- **Developer agents document code.** An agent watching a repo can `update_page` for an API doc page when the API spec changes.
- **Customer support agents retrieve verified answers.** Filtering by `verified` status (in metadata) for trusted answers only.

## Differences from AI Chat

- AI Chat uses the **same 20 tools** but invoked by the workspace's chosen LLM.
- MCP uses the same tools invoked by an **external** client.
- AI Chat respects `workspace.settings.ai.chat`. MCP respects `workspace.settings.ai.mcp`.

## Adding a new MCP tool

1. Add the tool definition (input schema, output schema) to the EE MCP module.
2. Wire it to the corresponding service.
3. Add the same tool to the AI Chat tool set so feature parity is preserved.
4. Update this reference and [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md).

## Related

- AI subsystem architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- API key admin: [`../admin/api-keys.md`](../admin/api-keys.md)
- AI governance: [`../admin/ai-governance.md`](../admin/ai-governance.md)
