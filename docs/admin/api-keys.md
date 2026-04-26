# API Keys

> **EE-only.** The `api_keys` table migration ships in OSS, but the route handlers and key validation live in the EE submodule. To use API keys, build with the EE submodule pulled.

`Feature.API_KEYS` (Business+). Two scopes: **user-level** (personal automation) and **workspace-level** (admin-managed integration keys).

## When to use which

| Scope | Created from | Use case |
|---|---|---|
| **User** | Settings → Account → API Keys | Personal scripts, Claude Desktop MCP setup, ad-hoc CLI usage |
| **Workspace** | Settings → API Management | Production integrations, CI/CD writers, dedicated MCP backends |

User keys carry the **acting user's permissions**. Workspace keys carry an admin-defined scope (typically a service-account-style profile).

## Creating a key

1. Open the relevant settings page.
2. Click **New API Key**.
3. Give it a name (used in audit logs and last-used display).
4. Optionally set an expiration date.
5. Copy the token — it is shown **only once**.

Audit event: `API_KEY_CREATED`.

## Using a key

```http
Authorization: Bearer <api-key>
```

This works on:
- All REST endpoints under `/api/`
- The MCP endpoint at `/mcp`

The API key is **equivalent to a JWT** for that user / scope. Same authorization rules.

## Revoking

**Revoke** removes the key immediately. There is no grace period. Use this when:
- A key is suspected of compromise
- An employee with personal keys leaves
- A workspace integration is deprecated

Audit event: `API_KEY_DELETED`.

## Last-used tracking

Each key records `lastUsedAt`. Useful for:
- Cleaning up stale keys (annually)
- Diagnosing why an integration broke (was it actually being used?)

## Expiration

Setting an expiration is **strongly recommended** for production keys:
- Rotation is built in.
- A leaked key has a bounded blast radius.
- Compliance audits look favorably on bounded credential lifetimes.

## Restricting key creation

Workspace admins can restrict API key creation to admins only. **Settings → Security & SSO → Restrict API key creation** (when `Feature.SECURITY_SETTINGS` is on).

When restricted:
- Members cannot create personal API keys.
- The "API Keys" tab in their account settings is hidden.

## MCP and API keys

The MCP endpoint (`/mcp`, `Feature.MCP` Enterprise) uses API keys for authentication. To set up Claude Desktop or another MCP client:

1. Create a workspace API key in **Settings → API Management** (admins) or a personal key in **Settings → Account → API Keys**.
2. In the MCP client, add ConqrAI Wiki as a server with:
   - URL: `https://<your-host>/mcp`
   - Bearer token: the API key

The client can then call any of the 20 MCP tools — see [`../reference/mcp-tools.md`](../reference/mcp-tools.md).

## Best practices

- **Name keys explicitly:** `prod-deploy-bot`, not `key-1`.
- **Set expirations** for everything except short-lived dev keys.
- **Rotate annually** — at minimum.
- **Audit keys quarterly** — check `lastUsedAt` and revoke unused ones.
- **Never commit keys** — use secret management (Vault, AWS Secrets Manager, doppler, …).
- **Watch audit events** — `API_KEY_CREATED` outside normal business hours is suspicious.

## API endpoints

```
POST  /api-keys           List
POST  /api-keys/create    Create
POST  /api-keys/update    Rename
POST  /api-keys/revoke    Revoke
```

See [`../reference/api.md`](../reference/api.md) for the full surface.

## Related

- MCP setup: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md) and [`../reference/mcp-tools.md`](../reference/mcp-tools.md)
- Audit events: [`../reference/audit-events.md`](../reference/audit-events.md)
