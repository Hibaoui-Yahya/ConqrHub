# ADR 0003 — Permission-safe retrieval: SQL-level filtering, single PermissionScope

> **Status:** Accepted (v1)
> **Date:** 2026-04-30
> **Decision-maker:** ConqrHub engineering
> **Related:** [master-plan.md](../master-plan.md) §7, §10 (Branch 3, 10); ADR 0001

## Context

The single hardest correctness problem in enterprise RAG is **never returning a chunk the user (or agent, or external app) is not allowed to read**. Failure modes seen in other products:

- Post-hoc filtering: vector store returns top-K, application drops forbidden rows, ranking distorts (the "right" chunk falls below K).
- Cache poisoning: cache key omits workspace/user → wrong tenant gets cached results.
- Permission drift: UI uses one permission model, RAG uses a hand-rolled subset → forbidden content leaks through retrieval.
- Agent confusion: agent's API key has different scope semantics than a user's CASL ability → agents over-read.
- Soft-deleted content surfaces in RAG even after UI removal.

ConqrHub already has a thoroughly reasoned permission model: workspace, space (with visibility + default_role), page-level (`page_access` + `page_permissions`), and CASL abilities. RAG must reuse that, not parallel it.

## Decision

Three structural rules govern every retrieval call.

### Rule 1 — Single `PermissionScope` resolved once per request

Every authenticated request resolves to a `PermissionScope` value object before any retrieval logic runs:

```ts
type PermissionScope = {
  principalKind: 'user' | 'api_key' | 'service_account' | 'share_link';
  principalId: string;
  workspaceId: string;             // mandatory
  accessibleSpaceIds: string[];    // pre-computed via CASL
  pageAllowList?: string[];        // explicit grants via page_access
  pageDenyList?: string[];         // explicit denies
  features: { rag: boolean; chat: boolean; agent: boolean };
  audit: { sessionId: string; reason?: string };
};
```

The scope is **immutable**, **passed by value** to retrieval, and **logged in the audit row**. No retrieval code mutates or rebuilds it mid-call.

Service accounts and API keys produce a `PermissionScope` of identical shape — the rest of the pipeline does not branch on principal type.

### Rule 2 — Permission filter is enforced at the SQL level

Vector retrieval, FTS retrieval, and metadata retrieval all carry the same `WHERE` clause:

```sql
WHERE workspace_id = $workspaceId
  AND space_id = ANY($accessibleSpaceIds)
  AND deleted_at IS NULL
  AND (
    page_id NOT IN (SELECT page_id FROM page_access WHERE … denies)
    AND (
      $pageAllowList IS NULL          -- no explicit allow-list set
      OR page_id = ANY($pageAllowList)
    )
  )
```

Critical properties:

- **No `OR` across workspaces, ever.** A workspace mismatch is a SQL bug we can grep for.
- **No post-hoc filtering** of returned rows. K candidates returned by SQL are already permission-safe; the ranking is what the user/agent sees.
- **The same JOIN logic that backs `PageAccessService.validateCanView`** is reused as a SQL fragment by retrieval. UI behavior and RAG behavior cannot diverge.
- **Soft-deleted pages are excluded by default.** An admin debug API may opt in (Branch 8), and only via a separate, audited code path.

### Rule 3 — Refuse before you guess

If retrieval returns zero permission-allowed chunks for a query, the answer pipeline **refuses** ("I don't know based on what you can access") rather than falling back to the LLM's prior knowledge. Refusal is a tracked metric (Branch 8) and false-refusals are a quality bug, but a false-positive (answering with content the user can't see) is a security incident.

## Consequences

### Positive

- **One source of truth for permissions.** UI and RAG share the SQL fragment; bug fixes propagate to both.
- **Cross-tenant isolation is structural.** A retrieval query without `workspace_id` won't compile — the type system enforces presence on `PermissionScope`.
- **Auditable by construction.** The `PermissionScope` is logged with every audit row; replays are deterministic.
- **Agent-ready.** API keys and service accounts use the same scope shape and the same SQL filter — no parallel "agent permissions" subsystem to drift from the human one.
- **Scope evolution is centralized.** Adding partner roles or share-link constraints means extending `PermissionScope` and the SQL fragment, not patching every retrieval entry point.

### Negative

- **Retrieval queries are more complex.** A vector top-K with a permission JOIN can fight the query planner. Mitigation: B-tree on `(workspace_id, space_id, page_id, deleted_at)`; per-query analysis in Branch 3.
- **Less optimal pure-vector latency.** Pre-filter on permissions in the same query is slower than an unfiltered HNSW search. Acceptable trade — enterprise correctness is non-negotiable.
- **HNSW + filter recall.** Aggressive HNSW with strict filters can drop recall when the filtered set is small. Mitigation: `ef_search` tuning per query; if filters reduce candidate set below threshold, fall back to full scan over the filtered set (Postgres can choose this automatically with proper stats).
- **Allow-list/deny-list complexity.** Page-level overrides require careful query construction. The plan keeps the model: deny is absolute; allow is additive only when allow-list is non-empty.
- **No global cross-workspace search.** A future "Super Admin" feature or cross-tenant federation would have to opt out of this model explicitly, with separate audit. Acceptable — not a v1 need.

## Alternatives considered

| Option | Why rejected |
|--------|--------------|
| **Post-hoc filtering** (return top-K from vector, drop forbidden) | Distorts ranking; allows leakage via cache; failure mode is silent. |
| **Per-tenant index** (one HNSW per workspace) | Operational cost, harder maintenance, and pgvector index-per-tenant doesn't help when tenants share a server. Doesn't solve space- or page-level filtering anyway. |
| **Application-side ACL with a separate ACL table joined post-search** | Same as post-hoc filtering with extra steps. |
| **Bit-vector ACL on every chunk row** (precomputed access per user) | Combinatorial explosion; recompute on every permission change; doesn't model groups or expiring shares. |
| **Trust the LLM to refuse forbidden content** | Categorically rejected. Permissions are not a language modeling problem. |
| **Two retrieval paths**, one for users, one for agents | Drift waiting to happen. The point of `PermissionScope` is one path. |

## Revisit conditions

Reopen this ADR if:

- A customer needs cross-workspace federation (still doable, but requires explicit design — currently impossible by the rules above).
- pgvector + permission JOIN performance is unacceptable at scale (reconsider per-tenant indexing or external vector store for the largest tenants only — never at the cost of structural isolation).
- A new principal type (e.g., temporary delegated access) doesn't fit the `PermissionScope` shape — extend the type, don't fork the pipeline.

The first two rules — single scope object, SQL-level filter — are non-negotiable for the foreseeable future. Refusal-first (Rule 3) can be tuned if false-refusal rates become a UX problem, but only with explicit measurement and tuning, never by relaxing the permission filter.
