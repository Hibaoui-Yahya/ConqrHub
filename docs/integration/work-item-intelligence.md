# Work-item semantic intelligence (A1 + A2)

ConqrPlane work items are indexed into the suite semantic store
(`ai_embeddings`, source kind `plane_work_item`) and power duplicate
detection + label prediction.

## Data flow

1. Plane webhook (`issue` created/updated/deleted) → `PlaneWebhookProcessorService`
   → BullMQ `AI_QUEUE` job (`index-plane-work-item` / `delete-plane-work-item-embeddings`).
   Enqueue failures are logged and never break refresh fan-out.
2. EE `AiEmbeddingQueueProcessor` → `WorkItemIndexerService`: fetches the fresh
   item from the Plane REST API, chunks + embeds, and upserts under the Hub
   space its project is mapped to (**unmapped projects are never indexed**).
   Archived/404 items delete their embeddings. Label ids are resolved to names
   at index time (5-minute per-project cache) and frozen into chunk metadata.
3. Backfill: `POST /api/ai/work-items/backfill { projectId? }` enqueues
   `backfill-plane-work-items` per mapped project (cursor-paginated). A supplied
   `projectId` must be mapped in the caller's workspace (404 otherwise).

## Endpoints (JWT, workspace-scoped)

All endpoints require `JwtAuthGuard` + `WorkspaceAiToggleGuard` and are
disabled when the workspace's `ai.retrieval` toggle is off
(`@RequireAiFeature('retrieval')`).

- `POST /api/ai/work-items/similar` `{ title, description?, limit? (1–10) }`
  → `{ items: [{ workItemId, projectId, title, sequenceId, state, labels, url, score }] }`
- `POST /api/ai/work-items/predict-labels` same body
  → `{ labels: [{ label, confidence }] }` — confidences are clamped to [0, 1]
  and sum ≤ 1; zero-weight labels are omitted.
- Both return empty results when no AI provider is configured — callers
  (e.g. ConqrPlane's create modal, fork ledger F9) must degrade silently.
- Both scope the search to spaces the calling user can read: `WorkIntelService`
  resolves the caller's readable space ids (`SpaceMemberRepo.getUserSpaceIds`)
  and restricts `similaritySearch` to that allow-list, so a member never sees
  titles/labels/urls of work items indexed into spaces they cannot access. A
  caller with no readable spaces gets an empty result with no search performed.
- `POST /api/ai/work-items/backfill` is workspace-scoped (not per-space) —
  any workspace member who passes the guards above can trigger a backfill for
  projects mapped in their workspace.

## Licensing boundary

`core/` never imports `ee/`. The webhook processor only enqueues queue jobs;
all embedding/AI code lives in `ee/ai/`.
