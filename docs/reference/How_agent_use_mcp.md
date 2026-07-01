# How an Agent Should Use the ConqrHub MCP

A practical guide for anyone building or prompting an agent against the ConqrHub MCP server. The full tool inventory and protocol spec live in [`mcp-tools.md`](./mcp-tools.md) — this file covers **how to use it without falling into the same pits**.

If you only read one section, read [Rules an agent must follow](#rules-an-agent-must-follow).

---

## TL;DR

1. Connect to `POST https://<your-host>/mcp` with `Authorization: Bearer <API_KEY>`.
2. Call `initialize`, then `tools/list` once per session.
3. **Never invent parameter names.** Read the live `inputSchema` from `tools/list` and follow it.
4. `spaceId` must be a UUID. Slugs like `LDP` are rejected. Look UUIDs up with `list_spaces`.
5. `get_page` accepts either the UUID or the short slugId (e.g. `69mCnVW2Xg`). Both fine.
6. Omit optional parameters entirely. Never send keys with `null` / `undefined`.
7. Tool failures come back as `result.isError: true` with a readable message. Read it, fix the call, retry.

---

## Why this guide exists

Agents fail against ConqrHub MCP for three recurring reasons:

| Failure mode | What you see | Real cause |
|---|---|---|
| Guessed parameter names (`space_id`, `slug`, `spaceSlug`) | `Invalid arguments for list_pages: spaceId: Required` | The agent didn't read `tools/list`. |
| Passed a slug where a UUID is required | `Invalid arguments for list_pages: spaceId: Invalid uuid` | LDP is a slug, not a UUID. Resolve via `list_spaces` first. |
| Sent optional fields as `null` or `undefined` | `UNDEFINED_VALUE: Undefined values are not allowed` | Older clients serialize unset fields. Omit them from the JSON object entirely. |

All three are now caught with clear validation errors instead of opaque DB exceptions — but the right fix is the agent following the schema in the first place.

---

## Connect

The endpoint is **`POST /mcp`** (no `/api/` prefix, no trailing slash) over Streamable HTTP. JSON-RPC 2.0 over HTTPS. Auth is `Authorization: Bearer <API_KEY>` — get the key from **Account Settings → API Keys** (keys default to 30-day TTL).

Workspace admin must have enabled MCP under **Settings → AI → MCP** (`workspace.settings.ai.mcp = true`). Without that, calls return HTTP 403.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "conqrhub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://app.conqrhub.com/mcp",
        "--header",
        "Authorization:Bearer ${CONQRHUB_API_KEY}"
      ],
      "env": { "CONQRHUB_API_KEY": "<paste key here>" }
    }
  }
}
```

Restart Claude Desktop after editing. You should see "conqrhub" in the Connectors list and the tool count.

### Claude Code / Cursor / VS Code

Same `mcp-remote` bridge pattern — see [`mcp-tools.md`](./mcp-tools.md#sdk-examples) for the exact JSON-RPC payloads each client expects.

### Programmatic clients

TypeScript and Python SDK quick-starts live in [`mcp-tools.md`](./mcp-tools.md#sdk-examples). Both use streamable HTTP transport with the same `Authorization` header.

---

## Connect via OAuth (ChatGPT / Claude custom connectors)

ChatGPT connectors and Claude custom connectors don't let you paste an API-key header — they expect the server to speak OAuth. ConqrHub now implements the MCP Authorization spec (OAuth 2.1), so you connect with **no key handling**:

1. In the connector dialog, choose **Server URL** and enter `https://app.conqrhub.com/mcp`. Set **Authentication → OAuth**. Leave the advanced OAuth fields blank — the client auto-discovers and self-registers.
2. Click **Create / Connect**. Your browser is sent to ConqrHub.
3. **Log in** to ConqrHub if you aren't already, then **Allow access** on the consent screen.
4. You're returned to ChatGPT/Claude, connected. The connector now calls `/mcp` with a short-lived token that acts as *you* — every tool call runs the same permission checks as the web app.

What happens under the hood (for operators / debugging):

- Discovery: `GET /.well-known/oauth-protected-resource/mcp` → `GET /.well-known/oauth-authorization-server`.
- Dynamic Client Registration: `POST /oauth/register` (public client, PKCE, no secret).
- Authorization: `GET /oauth/authorize` (login + consent) → redirect back with a one-time code.
- Token: `POST /oauth/token` (authorization_code + PKCE `S256`), returns a **1-hour access token** + a **rotating refresh token**.

Security notes:

- **PKCE `S256` is mandatory**; `plain` is rejected.
- Access tokens are bound to this server's audience (`https://app.conqrhub.com/mcp`) and expire in 1 hour; refresh tokens rotate on every use (reuse revokes the whole grant).
- **Requires** workspace admin to have enabled MCP under **Settings → AI → MCP**. If MCP is off, discovery returns 404 and the connector reports "does not implement OAuth".
- **Revoke** a connector any time from **Account Settings → API Keys** (OAuth grants appear there as `MCP · <client>`).
- The manual `Authorization: Bearer <API_KEY>` path (above) still works unchanged for Claude Desktop / Claude Code / programmatic clients.

---

## Discover before you call

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

Every tool comes back with:

- `name` — exact tool name (snake_case)
- `description` — what it does, when to use it
- `inputSchema` — draft 2020-12 JSON Schema, **input view** (fields with `.default()` are non-required)

**Rule:** rebuild your tool catalog at the start of each session. Tools are added between deploys — hardcoded lists go stale.

Treat `inputSchema.required` as a hard contract. If a field is in `required`, sending the call without it returns `Invalid arguments`. If it's not in `required`, omit it from the JSON object unless you mean to set it.

---

## Rules an agent must follow

### 1. ID rules

| ID | Format | Where to get it |
|---|---|---|
| `spaceId` | UUID (`019e261d-…`) — **never a slug** | `list_spaces` returns `{ id, name, slug }`. Use `id`. |
| `pageId` (input) | UUID **or** short slugId (e.g. `69mCnVW2Xg`) | Returned by `search_pages`, `list_pages`, `list_recent_pages`. Either field works. |
| `commentId` | UUID | `get_page_comments` |
| `parentPageId` | UUID or slugId — same as `pageId` | Same as above, or omit to mean "top level" |

URLs from the UI like `https://app.conqrhub.com/s/LDP/p/12-client-questions-...-69mCnVW2Xg` give you:
- `LDP` → space **slug** (needs lookup via `list_spaces` to get the UUID)
- `69mCnVW2Xg` → page **slugId** (usable directly with `get_page`)

### 2. Omit optional fields, never null them

❌ Wrong:

```json
{ "spaceId": "019e…", "parentPageId": null }
```

✅ Right:

```json
{ "spaceId": "019e…" }
```

`null` and `undefined` reach the database as bound parameters and break the query. The schema says optional — that means **omit**.

### 3. search_pages is workspace-wide

`search_pages` takes `query` and `limit` only. There is no `spaceId` filter — results span every space the API key's user can read. If you need space-scoped results, filter client-side after the call (each result includes the page's `spaceId`).

### 4. Read error messages

Tool failures look like this:

```json
{
  "result": {
    "content": [{ "type": "text", "text": "Invalid arguments for list_pages: spaceId: Required" }],
    "isError": true
  }
}
```

The message names the field and the rule. Fix the call; don't retry blindly with different guesses.

Protocol-level failures (bad JSON, unknown method) come back as JSON-RPC `error` — handle them by surfacing to the user, not by retrying.

### 5. Respect write semantics

| Tool | Semantics |
|---|---|
| `update_page` | Default `contentOperation: "replace"`. Pass `"append"` or `"prepend"` for additive edits. |
| `delete_page` | **Soft** delete — recoverable from trash for 30 days. No hard-delete tool exists by design. |
| `move_page` | Same-space re-parent. Use `move_page_to_space` for cross-space. |
| `copy_page_to_space` / `move_page_to_space` | Need read on source + write on target. |

Confirm with the user before any write call. There is no transactional rollback for batches.

### 6. Caps and pagination

- `get_page` returns up to **8 000 characters** of body text. For long pages, walk children via `list_child_pages`.
- `list_*` tools cap `limit` at 20 or 50 depending on the tool. To iterate, change the starting point (parent page, space) rather than asking for a bigger limit.
- `search_pages` caps `limit` at 20.

### 7. Permissions are enforced per call

Every tool re-runs the same CASL checks as the web UI for the user behind the API key. There is no separate MCP permission layer. Probing access is safe — denied calls come back with a permission error and no side effect.

---

## A complete agent loop

For a task like "improve page X and clean up duplicates," structure the run in three phases. Don't write before approval.

### Phase 1 — Discovery (read-only)

1. `list_spaces` → find the target space, capture `spaceId` (UUID).
2. `get_page` with the slugId from the URL → read the target page in full.
3. `get_page_breadcrumbs` → understand its place in the tree.
4. `list_space_pages` (iterate via `parentPageId`) → map the tree.
5. `search_pages` with phrases from the page → find duplicate / overlapping candidates.
6. `get_page` on each candidate → confirm overlap.

Produce a written audit. **Stop. Ask the user to approve.**

### Phase 2 — Execute (after explicit approval)

For each action, name the `pageId`, the tool used, and one line of rationale. Don't batch silently.

- **Improve target:** `update_page` with revised content, `contentOperation: "replace"`.
- **Merge:** `update_page` (`append`) any unique value into target, then `delete_page` on the duplicate.
- **Delete redundant pages:** `delete_page` directly.
- **Rename only:** `update_page_title`.

### Phase 3 — Verify

1. `get_page` on the target → confirm new content is in place.
2. `list_space_pages` → confirm duplicates are gone from the tree.
3. Summarize: improved / merged / deleted / renamed.

### Hard rules during execution

- No `create_space`. No `create_page` unless explicitly asked.
- No deletes outside the scoped space.
- Permission error → stop and report. Do not work around it.
- Cannot resolve a slug to a UUID via `list_spaces` → stop and ask the user.

---

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid arguments for X: spaceId: Required` | Sent `space_id`, `slug`, `spaceSlug`, or omitted it | Read `tools/list`, send `spaceId` (camelCase, UUID). |
| `Invalid arguments for X: spaceId: Invalid uuid` | Sent a slug like `LDP` | `list_spaces` first, use the returned `id`. |
| `Tool not found: list_pages_in_space` | Hallucinated tool name | Use `list_space_pages` (or `list_pages`) from `tools/list`. |
| `You do not have access to this page` | API key user lacks permission | Don't retry — surface to the user. |
| `get_page` returns truncated content | Page exceeds 8 000 chars | Read children via `list_child_pages` instead of fighting the cap. |
| Search returns nothing useful | `search_pages` is workspace-wide; results filtered to user's spaces | Try synonyms, or use `list_space_pages` to walk a known space. |

---

## See also

- Full protocol + tool catalog: [`mcp-tools.md`](./mcp-tools.md)
- AI subsystem architecture: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- API key admin: [`../admin/api-keys.md`](../admin/api-keys.md)
- AI governance and feature toggles: [`../admin/ai-governance.md`](../admin/ai-governance.md)
