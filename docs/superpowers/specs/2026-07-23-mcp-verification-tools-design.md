# MCP Verification Tools — Design

**Date:** 2026-07-23
**Status:** Approved (design), pending spec review
**Area:** `apps/server/src/ee/ai` (chat tools → MCP surface) + `apps/server/src/ee/page-verification`

## Problem

ConqrHub's RAG index only contains **verified** pages. `rag_retrieve` (and therefore
ConqrService's "Ask HR") is a pure pgvector similarity search with no keyword fallback;
a page enters the index only when its verification reaches `verified`
(`PageVerificationService.verifyPage` enqueues `GENERATE_PAGE_EMBEDDINGS`), and the
indexer actively drops embeddings for any page that is not effectively verified
(`embedding-indexer.service.ts` → `isEffectivelyVerified`). Editing a verified page
resets it to `draft` and removes it from RAG (`invalidateOnContentChange`).

Today an MCP client can create and edit pages but has **no way to see or drive
verification state**. The result: freshly created pages are silently invisible to
`rag_retrieve`/Ask HR, with no signal to the model explaining why. This blocks
end-to-end seeding of the knowledge corpus (e.g. the ConqrService E2E suite) entirely
from the connector.

## Goal

Expose the verification lifecycle over MCP so an authorized client can make content
retrievable, and teach the model the gate so it stops mis-diagnosing empty results as
"indexing lag".

Non-goals: no change to the verification rules, the status machine, or the permission
model; no new UI; no bypass of the space-admin permission check.

## Decisions (approved)

- **Full lifecycle** over MCP (read + create + submit-for-approval + verify + obsolete),
  gated behind the existing `ai.mcp` workspace feature flag and the existing
  space-admin permission (`assertCanManage`) enforced by `PageVerificationService`.
  Rationale: the caller wants to seed and re-seed knowledge corpora from the connector;
  the gate is not removed, only made drivable by an authorized principal.
- **Add a `verify-space` MCP prompt** (workflow: list unverified pages in a space →
  verify them).
- Build the tools only; do not backfill the existing 9 CW pages in this change.

## Architecture

Each capability is a `@Injectable` implementing `ChatTool` (name / description / zod
params / `execute`), self-registering via `onModuleInit() → registry.register(this)` and
listed as a provider in `apps/server/src/ee/ai/chat/ai-chat.module.ts`. The MCP layer
surfaces `ChatToolRegistry` tools automatically, so no `mcp.service.ts` change is needed
for the tools themselves (only for the new prompt + guide content). Tools are thin
adapters over `PageVerificationService`; they resolve a page ref (UUID or slugId) via
`PageService.findById(id, true)` before delegating, matching the existing tools.

`PageVerificationModule` must export `PageVerificationService` (and its query helper),
and `AiChatModule` must import `PageVerificationModule`.

### Tools (6) → total surface 39 → 45

| Tool | Params | Delegates to | Result |
|---|---|---|---|
| `get_verification_status` | `pageId` | `getVerificationInfo` | effective status, `inRag: boolean`, caller permissions |
| `list_unverified_pages` | `spaceId?`, `limit?` | new repo query (pages LEFT JOIN pageVerifications, keep rows with no effectively-valid verification) | page id/title/space, current status |
| `verify_page` | `pageId`, `expiresInDays?` | `createVerification` (only if no row exists) then `verifyPage` | new status + note that embeddings are enqueued |
| `create_verification` | `pageId`, `type?` (`expiring`\|`qms`, default `expiring`), `verifierIds?`, `expiresInDays?` | `createVerification` | created verification (draft) |
| `submit_for_approval` | `pageId` | `submitForApproval` | status `in_approval` |
| `mark_obsolete` | `pageId` | `markObsolete` | status `obsolete` (dropped from RAG) |

`verify_page` folding create+verify into one call is the ergonomic win for seeding: one
call per page instead of two. `create_verification` remains available for the
QMS/expiring flow where a draft-then-approve sequence is wanted.

**Type/verifier reality (verified against the service):** verification `type` is only
`expiring` (default) or `qms` — there is no `standard`. `createVerification` **requires
1–5 `verifierIds`**; when the MCP client omits them, the tools default `verifierIds` to
`[ctx.user.id]` (the API-key principal). An `expiring` verification created with no
expiry mode gets `expiresAt = null` = **permanent** (passes `isEffectivelyVerified`
forever), which is the right default for a knowledge base; `expiresInDays` optionally
sets a period expiry. `verify_page` therefore auto-creates an `expiring` +
permanent verification with the caller as sole verifier, then calls `verifyPage`
(`type='expiring' → status='verified' →` RAG enqueued).

**Two distinct permission checks (do not conflate):**
- `assertCanManage` (create / obsolete): passes if the caller has workspace
  Manage-Settings **or** space Manage-Settings.
- `userCanVerify` (verify): passes if the caller has workspace Manage-Settings **or** is
  a listed verifier on that page's verification. `verify_page`'s auto-create adds the
  caller as verifier, so self-verify works whenever the caller could create (i.e. has
  space-manage). If a verification already exists and the caller is neither a listed
  verifier nor workspace-manage, `verify_page` surfaces the service's
  `ForbiddenException` unchanged.

### New query: unverified pages

`list_unverified_pages` needs pages that have **no effectively-valid** verification
(no row, or row in draft/in_approval/approved/expired/obsolete, or a past `expiresAt`).
`listVerifications` only returns pages that already have a verification row, so it can't
answer this. Add a small Kysely query (in a repo or the verification service) that
LEFT JOINs `pages` to `pageVerifications` and filters to rows failing
`isEffectivelyVerified`, scoped by workspace and optional space, `deletedAt is null`,
with a `limit` (default 50).

### Prompt: `verify-space`

Add to `MCP_PROMPTS` in `mcp-guide.ts`. Args: `space` (name/slug, required). Builds a
workflow message: resolve the space → `list_unverified_pages` → confirm with the user →
`verify_page` each → report which pages are now retrievable.

### Model guidance (mcp-guide.ts)

- Add one line to `SERVER_INSTRUCTIONS`: a page is retrievable by `rag_retrieve`/Ask HR
  only after it is **verified**; creating or editing a page does not index it, and
  editing a verified page resets it to draft and drops it from RAG. Use
  `list_unverified_pages` / `verify_page` to make new content retrievable.
- Add a `verification` `GUIDE_SECTION` (slug `verification`) covering the gate, the tool
  flow, permissions, and the edit-invalidates-verification rule.
- Update the "DEEPER GUIDANCE" topic list and the tool-groups list in the `overview`
  section to include verification.

## Data flow

```
MCP callTool
  → ChatToolRegistry tool.execute(args, { user, workspace })
  → PageService.findById(pageId, true)               // resolve UUID or slugId
  → PageVerificationService.<method>(...)            // assertCanManage on writes
  → DB update + aiQueue.add(GENERATE_PAGE_EMBEDDINGS) // on verify
  → ai-embedding-queue.processor → embeddings written to pgvector
  → page now returned by rag_retrieve / Ask HR
```

## Error handling

- Page not found / not in workspace → clear "page not found" error (as existing tools).
- Caller lacks space-admin → surface the service's `ForbiddenException` message verbatim
  ("you must be a space admin to manage verification"), not a generic failure — so the
  model can tell the user to grant the API-key user manage rights.
- `submit_for_approval` / `verify_page` called from an invalid status → surface the
  service's `BadRequestException` message (e.g. "Page is not in draft status").
- Embedding enqueue is fire-and-forget in the service; `verify_page` reports that
  indexing is enqueued (retrieval is eventually consistent, seconds-scale), and does not
  block on embedding completion.

## Testing

- One `*.spec.ts` per tool mirroring existing chat-tool specs: mock
  `PageVerificationService` + `PageService`, assert delegation, arg mapping, and
  permission-error passthrough.
- `verify_page` spec: asserts it creates an `expiring`+permanent verification (caller as
  verifier) when none exists, then calls `verifyPage`, and returns the enqueued-status
  result; and that it does NOT re-create when a verification already exists.
- `list_unverified_pages` spec: asserts the LEFT JOIN filter excludes effectively-verified
  pages and includes no-row / draft / expired pages.
- Existing `mcp.service.spec.ts` picks up the new tools automatically (registry-driven);
  add assertions that the new prompt (`verify-space`) and guide section (`verification`)
  are advertised.

## Rollout

Standard suite deploy: commit on `feat/meeting-intelligence-foundation`, fast-forward
`main`, Railway auto-deploys ConqrHub (~2.5 min). Verify the live tools catalog
(`GET /api/ai/mcp/tools`) reports 45 tools including the six verification tools.
