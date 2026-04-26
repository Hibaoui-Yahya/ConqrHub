# REST API Reference

ConqrAI Wiki exposes a JSON REST API under `/api/`. Streaming endpoints (AI, etc.) use Server-Sent Events.

This page is the canonical endpoint catalogue. For the gating rules, see [`./feature-flags.md`](./feature-flags.md).

## Authentication

Every authenticated request supplies one of:

- **Cookie** — `authToken` cookie set after login (default for the SPA)
- **Bearer JWT** — `Authorization: Bearer <jwt>` header
- **API key** — `Authorization: Bearer <api-key>` header (Business+, gated by `Feature.API_KEYS`)

Unauthenticated calls receive `401`. The SPA auto-redirects to `/login` on `401`.

## Base URL

All endpoints are prefixed with `/api`. The Vite dev server proxies `/api`, `/socket.io`, and `/collab` to the backend (`apps/client/vite.config.ts`).

## Pagination

Cursor-based:

```ts
// Request
{ cursor?: string; limit?: number }

// Response
{
  items: T[];
  meta: {
    hasNextPage: boolean;
    hasPrevPage?: boolean;
    nextCursor?: string;
    prevCursor?: string;
  }
}
```

## Streaming (SSE)

AI endpoints return events in `text/event-stream`:

```
data: {"type":"content","text":"Hello"}

data: {"type":"done","messageId":"…"}

data: [DONE]
```

The client uses `AbortController` to cancel a stream.

---

## Authentication & accounts

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Email/password |
| POST | `/auth/signup` | If allowed by workspace/SSO |
| POST | `/auth/logout` | Revokes the cookie session |
| POST | `/auth/forgot-password` | Triggers reset email |
| POST | `/auth/reset-password` | With reset token |
| POST | `/auth/refresh` | Refresh JWT |

## MFA

`Feature.MFA` (Business+).

| Method | Path | Notes |
|---|---|---|
| POST | `/mfa/status` | Get user MFA status |
| POST | `/mfa/setup` | Begin TOTP setup — returns QR + secret |
| POST | `/mfa/enable` | Verify code, enable |
| POST | `/mfa/disable` | Disable MFA |
| POST | `/mfa/generate-backup-codes` | New backup codes |
| POST | `/mfa/verify` | Verify code at login |
| POST | `/mfa/validate-access` | Check if MFA is required |

## SSO

`Feature.SSO_GOOGLE` and `Feature.SSO_CUSTOM` (Business+).

| Method | Path | Notes |
|---|---|---|
| POST | `/sso/providers` | List configured providers |
| POST | `/sso/info` | Provider details |
| POST | `/sso/create` | Create provider |
| POST | `/sso/update` | Update provider |
| POST | `/sso/delete` | Delete provider |

Provider data model: see [`../architecture/backend.md`](../architecture/backend.md) (Authentication section).

## Workspace

| Method | Path | Notes |
|---|---|---|
| POST | `/workspace/info` | Current workspace info |
| POST | `/workspace/update` | Update settings |
| POST | `/workspace/entitlements` | Returns `{ cloud, tier, features[] }` |
| POST | `/workspace/members` | List members (paginated) |
| POST | `/workspace/invite` | Send invite |
| POST | `/workspace/invite/resend` | Resend invite |
| POST | `/workspace/invite/revoke` | Revoke pending invite |

## Spaces

| Method | Path | Notes |
|---|---|---|
| POST | `/spaces` | List spaces |
| POST | `/spaces/info` | Space details |
| POST | `/spaces/create` | Create space |
| POST | `/spaces/update` | Update space |
| POST | `/spaces/delete` | Delete space |
| POST | `/spaces/members` | List members |
| POST | `/spaces/members/add` | Add user / group |
| POST | `/spaces/members/remove` | |
| POST | `/spaces/members/update-role` | |
| POST | `/spaces/export` | Export entire space |

## Pages

| Method | Path | Notes |
|---|---|---|
| POST | `/pages` | List pages (filterable) |
| POST | `/pages/info` | Page metadata + content |
| POST | `/pages/create` | New page |
| POST | `/pages/update` | Save changes (collab WS is the primary write path) |
| POST | `/pages/delete` | Move to trash |
| POST | `/pages/restore` | Restore from trash |
| POST | `/pages/move` | Reorder within space |
| POST | `/pages/move-to-space` | Cross-space move |
| POST | `/pages/duplicate` | Duplicate (within space) |
| POST | `/pages/copy-to-space` | Copy across spaces |
| POST | `/pages/import` | Single-file import (MD / HTML) |
| POST | `/pages/import-zip` | Bulk ZIP import |
| POST | `/pages/export` | Export single page |
| POST | `/pages/history` | List revisions |
| POST | `/pages/history/restore` | Restore revision |

## Page-level permissions

`Feature.PAGE_PERMISSIONS` (Enterprise).

| Method | Path |
|---|---|
| POST | `/pages/{pageId}/restrict` |
| POST | `/pages/{pageId}/unrestrict` |
| POST | `/pages/{pageId}/permissions` |
| POST | `/pages/{pageId}/permissions/add` |
| POST | `/pages/{pageId}/permissions/remove` |
| POST | `/pages/{pageId}/permissions/update-role` |
| POST | `/pages/{pageId}/restrictions/info` |

## Page verification

`Feature.PAGE_VERIFICATION` (Enterprise).

| Method | Path |
|---|---|
| POST | `/pages/{pageId}/verification/info` |
| POST | `/pages/{pageId}/verification/setup` |
| POST | `/pages/{pageId}/verification/update` |
| POST | `/pages/{pageId}/verification/remove` |
| POST | `/pages/{pageId}/verification/verify` |
| POST | `/pages/{pageId}/verification/submit-approval` |
| POST | `/pages/{pageId}/verification/reject` |
| POST | `/pages/{pageId}/verification/mark-obsolete` |
| POST | `/verification/list` |

## Comments

| Method | Path | Notes |
|---|---|---|
| POST | `/comments` | Page comments |
| POST | `/comments/create` | |
| POST | `/comments/update` | |
| POST | `/comments/delete` | |
| POST | `/comments/{commentId}/resolve` | `Feature.COMMENT_RESOLUTION` |

## Search

| Method | Path | Notes |
|---|---|---|
| POST | `/search` | Full-text search |
| POST | `/search/suggestions` | Type-ahead suggestions |

## AI

`Feature.AI` (Enterprise) — and per-surface workspace toggle.

### Generative AI (Ask AI)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/ai/generate` | One-shot |
| POST | `/api/ai/generate/stream` | SSE |

### AI Search
| Method | Path | Notes |
|---|---|---|
| POST | `/api/ai/answers` | SSE |

### AI Chat
| Method | Path | Notes |
|---|---|---|
| POST | `/ai/chats/create` | |
| POST | `/ai/chats` | List (paginated) |
| POST | `/ai/chats/info` | Chat + messages |
| POST | `/ai/chats/delete` | |
| POST | `/ai/chats/update` | Rename |
| POST | `/ai/chats/search` | |
| POST | `/api/ai/chats/send` | SSE response |
| POST | `/ai/chats/upload` | Attach file |

### MCP
`Feature.MCP` — Model Context Protocol endpoint.

| Method | Path |
|---|---|
| GET / POST | `/mcp` |

## Templates

`Feature.TEMPLATES` (Business+).

| Method | Path |
|---|---|
| POST | `/templates` |
| POST | `/templates/{id}` |
| POST | `/templates/create` |
| POST | `/templates/{id}/update` |
| POST | `/templates/{id}/delete` |
| POST | `/templates/{id}/use` |

## API keys

`Feature.API_KEYS` (Business+).

| Method | Path |
|---|---|
| POST | `/api-keys` |
| POST | `/api-keys/create` |
| POST | `/api-keys/update` |
| POST | `/api-keys/revoke` |

## Audit

`Feature.AUDIT_LOGS` (Enterprise).

| Method | Path | Notes |
|---|---|---|
| POST | `/audit` | List logs |
| POST | `/audit/retention` | Get retention policy |
| POST | `/audit/retention/update` | Update retention |

## Billing (cloud only)

| Method | Path | Notes |
|---|---|---|
| POST | `/billing/info` | Subscription info |
| POST | `/billing/plans` | Available plans |
| POST | `/billing/checkout` | Stripe checkout URL |
| POST | `/billing/portal` | Stripe customer portal |

## License (self-hosted)

| Method | Path | Notes |
|---|---|---|
| POST | `/license/info` | Current license |
| POST | `/license/activate` | Activate with key |
| POST | `/license/remove` | Remove license |

## Sharing

| Method | Path | Notes |
|---|---|---|
| POST | `/shares` | List share links |
| POST | `/shares/create` | Create public link |
| POST | `/shares/update` | Update (password / expiration / access) |
| POST | `/shares/delete` | Revoke |

## Health & system

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Aggregated health (Postgres + Redis) |
| GET | `/api/version` | Build version |
| GET | `/robots.txt` | Configurable per workspace |

---

## Workspace settings shape

Returned by `POST /workspace/info` and updated by `POST /workspace/update`:

```ts
workspace.settings = {
  ai: {
    search: boolean,       // AI Search (AI Answers)
    generative: boolean,   // Ask AI in editor
    chat: boolean,         // AI Chat
    mcp: boolean,          // Model Context Protocol
  },
  sharing: {
    disabled: boolean,     // Disable public sharing workspace-wide
  },
};

workspace.enforceMfa: boolean;
workspace.enforceSso: boolean;
```

## Real-time channels (not REST)

- **Hocuspocus** — WebSocket at `/collab` for editor sync. See [`../architecture/realtime-collaboration.md`](../architecture/realtime-collaboration.md).
- **Socket.io** — WebSocket at `/socket.io` for presence, page-tree updates, notifications.

---

## A note on completeness

This is the **catalogue** — pre-DTO. For request and response bodies of each endpoint, the source of truth is the corresponding NestJS controller in `apps/server/src/core/`. Where a feature is EE-only, the controller lives in the EE submodule and the request shapes are documented in [`../prd/`](../prd/README.md) under the relevant area.
