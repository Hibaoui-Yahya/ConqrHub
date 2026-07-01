# MCP OAuth 2.1 for ConqrHub — Design

**Status:** Approved (2026-07-01)
**Author:** Yahya Hibaoui (with Claude)
**Scope:** Make the ConqrHub MCP endpoint (`/mcp`) connectable by OAuth-based MCP clients (ChatGPT custom connectors, Claude custom connectors) by turning ConqrHub into a minimal OAuth 2.1 authorization server for its own MCP resource.

---

## Problem

ChatGPT's and Claude's "custom connector" flows do not let a user paste an `Authorization: Bearer <API_KEY>` header. When the connector's auth type is **OAuth**, the client performs the MCP Authorization handshake:

1. Call the MCP resource; expect a `401` with `WWW-Authenticate: Bearer resource_metadata="…"`.
2. Fetch **Protected Resource Metadata** (RFC 9728) → discover the authorization server.
3. Fetch **Authorization Server Metadata** (RFC 8414) → discover `authorize` / `token` / `register` endpoints.
4. **Dynamically register** (RFC 7591) to obtain a `client_id`.
5. Redirect the user to `/authorize` (with PKCE `S256`).
6. Exchange the code at `/token` for an access token (+ refresh token).
7. Call the MCP resource with the bearer access token.

ConqrHub serves **none** of steps 1–6 today, so the client aborts with *"MCP server https://app.conqrhub.com/mcp does not implement OAuth."*

## Goals

- ChatGPT and Claude can connect to `https://app.conqrhub.com/mcp` via OAuth with no manual key handling.
- **Simple:** reuse existing JWT (`APP_SECRET`), `api_keys` grant store, login session, and CASL — no external IdP/gateway.
- **Fast:** access tokens are ordinary HS256 JWTs validated by the existing `JwtStrategy` (no extra DB round-trip on the hot path beyond what API keys already do).
- **Secure:** PKCE `S256` mandatory, exact `redirect_uri` match, one-time short-TTL codes, rotating refresh tokens stored hashed, explicit consent, short-lived access tokens.
- **Non-breaking:** existing `Bearer <API_KEY>` MCP flow keeps working unchanged.

## Non-goals (v1)

- Read-only / granular scopes (single `mcp` scope; per-call CASL is the real boundary).
- Being a general-purpose OAuth provider for third-party apps beyond MCP.
- Refresh-token binding to hardware/DPoP.

---

## Architecture

ConqrHub hosts a **minimal OAuth 2.1 authorization server** whose issued access tokens are **short-lived `API_KEY`-type JWTs** backed by a durable grant row in the existing `api_keys` table.

```
ChatGPT/Claude ──(1) POST /mcp, no token──────────────► 401 + WWW-Authenticate: resource_metadata=…
              ──(2) GET /.well-known/oauth-protected-resource[/mcp]─► { authorization_servers:[issuer] }
              ──(3) GET /.well-known/oauth-authorization-server────► { authorize, token, register, S256 }
              ──(4) POST /oauth/register──────────────────────────► { client_id, … }   (RFC 7591 DCR)
              ──(5) GET  /oauth/authorize ─(browser)──────────────► login? → consent → 302 back w/ code
              ──(6) POST /oauth/token (code + PKCE verifier)──────► { access_token(1h), refresh_token }
              ──(7) POST /mcp, Bearer access_token────────────────► JwtStrategy validates API_KEY JWT → tools
```

Why access tokens are `API_KEY` JWTs backed by `api_keys`:

- `JwtStrategy.validateApiKey` already validates `API_KEY` JWTs against `api_keys` (filtering `deleted_at`), so **no core auth change** is needed.
- The MCP controllers keep `JwtAuthGuard`; both manual keys and OAuth tokens ride the same path.
- Revoke = soft-delete the `api_keys` row → every token minted from the grant dies immediately.
- `last_used_at` tracking already exists → connector activity is visible in the API Keys UI.

## Components & file layout

All new server code lives under `apps/server/src/ee/ai/mcp/oauth/` (same EE license zone as MCP + api-key modules):

| File | Responsibility |
| --- | --- |
| `oauth-metadata.controller.ts` | `GET /.well-known/oauth-protected-resource`, `…/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server`. Public. Gated on the workspace having MCP enabled. |
| `oauth-register.controller.ts` | `POST /oauth/register` — RFC 7591 DCR. Public. |
| `oauth-authorize.controller.ts` | `GET /oauth/authorize` (login redirect / consent screen) + `POST /oauth/authorize/consent` (approve/deny). |
| `oauth-token.controller.ts` | `POST /oauth/token` — `authorization_code` + `refresh_token` grants. Public. `Cache-Control: no-store`. |
| `mcp-oauth.service.ts` | Client registration, code issue/verify (PKCE), grant creation (via `ApiKeyService`), token/refresh issue + rotation, discovery-doc builders. |
| `mcp-oauth-client.repo.ts` | `mcp_oauth_client` CRUD. |
| `mcp-oauth-refresh-token.repo.ts` | `mcp_oauth_refresh_token` CRUD + rotation. |
| `dto/*.ts` | Zod/class-validator DTOs for register, authorize, token. |
| `consent.html.ts` | Server-rendered consent page (self-contained, no client bundle). |
| `mcp-oauth.module.ts` | Wires the above; imports `ApiKeyModule`, `TokenModule`, `AiModule` feature guards. |

Registration in `main.ts`: add `'.well-known/oauth-protected-resource'`, `'.well-known/oauth-authorization-server'`, and `'oauth'` (or the explicit sub-paths) to the `setGlobalPrefix('api', { exclude: [...] })` list so they serve at the root, like `mcp`.

## Data model

Auth codes live in **Redis** (short TTL, one-time, auto-expiring — no migration, fast). Durable state in **Postgres** (one migration):

**`mcp_oauth_client`** (dynamically-registered clients)
- `id` uuid pk, `client_id` text unique, `client_name` text, `redirect_uris` jsonb (string[]), `grant_types` jsonb, `scope` text, `created_at` timestamptz. (Public clients — no secret stored.)

**`mcp_oauth_refresh_token`** (rotating refresh tokens)
- `id` uuid pk, `token_hash` text unique (sha-256 of the opaque token), `client_id` text, `api_key_id` uuid → `api_keys.id` (the durable grant), `user_id` uuid, `workspace_id` uuid, `scope` text, `expires_at` timestamptz, `rotated_at` timestamptz null, `created_at`. Reuse of a rotated token revokes the whole chain for that grant.

**`api_keys`** — add two nullable columns (backward-compatible):
- `type` text default `'default'` (`'default'` | `'mcp_oauth'`) — lets the API Keys UI label OAuth grants.
- `client_id` text null — the OAuth client that holds the grant.

Redis auth-code entry (key `mcp:oauth:code:<code>`, TTL 600s, deleted on first use):
`{ clientId, userId, workspaceId, redirectUri, codeChallenge, codeChallengeMethod:'S256', scope, resource }`.

## Endpoint contracts (host = `app.conqrhub.com`)

> Exact JSON field lists are confirmed against RFC 8414/9728/7591 + the MCP 2025-06-18 authorization spec by the research phase; the shapes below are the baseline.

**`GET /.well-known/oauth-protected-resource`** (and `…/mcp`)
```json
{ "resource": "https://app.conqrhub.com/mcp",
  "authorization_servers": ["https://app.conqrhub.com"],
  "scopes_supported": ["mcp"],
  "bearer_methods_supported": ["header"] }
```

**`GET /.well-known/oauth-authorization-server`**
```json
{ "issuer": "https://app.conqrhub.com",
  "authorization_endpoint": "https://app.conqrhub.com/oauth/authorize",
  "token_endpoint": "https://app.conqrhub.com/oauth/token",
  "registration_endpoint": "https://app.conqrhub.com/oauth/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp"] }
```

**401 challenge from `/mcp` + `/mcp/stream`:**
```
WWW-Authenticate: Bearer resource_metadata="https://app.conqrhub.com/.well-known/oauth-protected-resource"
```

**`POST /oauth/register`** → accepts `redirect_uris` (required), `client_name`, `grant_types`, `response_types`, `token_endpoint_auth_method`, `scope`. Returns `client_id`, `client_id_issued_at`, echoes `redirect_uris`, `grant_types`, `token_endpoint_auth_method:"none"`. No `client_secret` (public client).

**`GET /oauth/authorize`** → validate `response_type=code`, known `client_id`, exact `redirect_uri` match, `code_challenge` + `code_challenge_method=S256`. If no ConqrHub session → `302 /login?redirect=<self>`. If session → render consent page. On approve (`POST /oauth/authorize/consent`) → create grant (`api_keys` row via `ApiKeyService`), store code in Redis, `302 redirect_uri?code=…&state=…`. On deny → `302 redirect_uri?error=access_denied&state=…`.

**`POST /oauth/token`**
- `grant_type=authorization_code`: validate code (one-time, unexpired, client match, exact `redirect_uri`), verify PKCE `BASE64URL(SHA256(verifier)) === code_challenge`. Mint 1h `API_KEY` JWT for the grant + opaque refresh token (store hash). Return `{ access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope }`.
- `grant_type=refresh_token`: validate hash, unexpired, unrotated; rotate (issue new refresh, mark old `rotated_at`); reuse of a rotated token → revoke chain + `invalid_grant`. Mint new 1h access token.
- Errors: RFC 6749 `{ "error": "...", "error_description": "..." }` with correct status; `Cache-Control: no-store`.

## Security posture

- **PKCE `S256` mandatory** — reject missing challenge and `plain`.
- **Exact `redirect_uri` match** against the registered set (primary defense for a public client).
- **One-time auth codes**, 600s TTL, bound to `client_id` + PKCE + `redirect_uri`, deleted on first use.
- **Rotating refresh tokens**, stored only as SHA-256 hashes; reuse detection revokes the grant chain.
- **Explicit consent** on first authorization; grant is auditable and revocable.
- **Short access tokens** (1h) → leaked token self-limits.
- **Open DCR is safe here:** registration stores only redirect URIs; security rests on login + consent + PKCE + exact redirect match.
- **Feature gating:** discovery + authorize/token are only active when the resolved workspace has MCP enabled (`workspace.settings.ai.mcp`), matching the existing `RequireAiFeature('mcp')` guard on `/mcp`.
- **CORS:** `/.well-known/*` and `/oauth/token` + `/oauth/register` must allow the client origins that fetch them programmatically (confirmed in research); `/oauth/authorize` is a top-level browser navigation (no CORS needed).

## Backward compatibility

- Existing `Authorization: Bearer <API_KEY>` MCP usage is untouched — purely additive.
- `api_keys` gains two nullable columns with defaults; existing api-key create/list/revoke code is unaffected.
- `How_agent_use_mcp.md` gains a new "Connect via OAuth (ChatGPT / Claude)" section.

## Testing

**Unit**
- Discovery doc shape (both docs, incl. `/mcp` suffix variant).
- DCR validation (missing `redirect_uris` rejected; response fields correct; public client, no secret).
- PKCE verify: happy path + tampered verifier + `plain` rejected + missing challenge rejected.
- `redirect_uri` mismatch rejected at both authorize and token.
- Auth code single-use (second exchange fails).
- Refresh rotation happy path + reuse-of-rotated-token revokes chain.
- Feature-off → discovery 404 / `/mcp` 403.

**E2E**
- Unauthenticated `POST /mcp` returns the exact `WWW-Authenticate` challenge.
- Full flow: register → authorize (seeded session) → consent → token → `POST /mcp tools/list` succeeds → revoke grant → subsequent call 401.

## Open items resolved

- **Tenancy:** self-hosted resolves a single workspace (`DomainMiddleware.findFirst`), cloud resolves by subdomain — so the workspace is deterministic from the host at authorize time. The grant binds to that workspace.
- **Consent UX:** explicit consent screen (user-approved).
- **Scope:** full user permissions via CASL, single `mcp` scope (user-approved).
- **Token lifetime:** ~1h access + rotating refresh (user-approved).
