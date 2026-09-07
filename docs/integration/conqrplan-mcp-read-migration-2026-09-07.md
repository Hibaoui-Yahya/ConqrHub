# ConqrPlan MCP: read-tool migration record (2026-09-07)

Operator: workspace owner, via the claude.ai ConqrHub connector (Hub `/mcp`
surface, API-key session) and the Railway CLI. Production project: Railway
`ConqrHub` / environment `production`, services `ConqrHub` and `conqrplan-mcp`.

## State found

| Item | Brief said | Actual |
|---|---|---|
| PR #32 (routed-tool observability) | open | merged 2026-09-06 17:34Z as squash `100d475f`; head `17ce929e` |
| PR #33 (403 not 500 for refused exchange) | - | merged 2026-09-06 18:00Z as `e26936c4` |
| Deployed commit, both services | - | `e26936c4` (Hub `a30faa16`, MCP `d311a65b`) |
| `CONQRPLAN_MCP_ROUTED_TOOLS` | `list_conqrplan_projects` only | five tools: projects, states, labels, cycles, members (added 2026-09-06 18:02-18:06Z) |

The routed list was reduced to `list_conqrplan_projects` (Hub deployment
`227cff15`) to record authoritative local baselines for every other read,
then Batch A was re-enabled (`8b2ac417`) after verification.

## PR #32 review (merged diff `100d475f`)

Contains only: adoption of `X-Conqr-Correlation-Id` on the MCP inbound request,
`safeCorrelationId` (raw length 1..128, allow-list `^[A-Za-z0-9._:-]+$`, no
trimming, fallback to the assertion `jti`), propagation on the outbound
ConqrPlan header, one structured trace line per call on both Hub routes with
identical keys, an MCP trace carrying `correlationId`, `assertionJti` and
`delegationJti` as three distinct values, and tests for all of it. The id is
never used as a path, query, command or log key. No token, credential or
content appears in either trace (asserted by `standalone-check.js`).

Chain verified: Hub mints a UUID -> header + JSON-RPC id -> MCP adopts through
the allow-list -> `PlaneCallContext.correlationId` -> `X-Conqr-Correlation-Id`
to ConqrPlan -> Hub logs the outcome under the same id. ConqrPlan records the
header only on rejections at its auth layer; on accepted requests
`DelegationAudit.correlation_id` is the downstream token's `jti`, which the MCP
trace names as `delegationJti`. The join to ConqrPlan is therefore by
structured field, not by the same value (see "Limitations").

## Inventory of ConqrPlan reads (from code)

All eleven are GET-only in both implementations, request a read scope, carry
the human's delegation, and let ConqrPlan decide; none caches, records
membership, or updates any last-used state. The six mutating tools stay local.

| Tool | Data returned | ConqrPlan endpoint | Authorization | Cache | Sensitive fields | Recovery | Batch |
|---|---|---|---|---|---|---|---|
| list_conqrplan_projects | id, name, identifier | GET /workspaces/{slug}/projects/ | work-item:read; ConqrPlan membership | none | project names | error envelope, no retry, no fallback | pilot (routed) |
| list_work_item_states | id, name, group, default | GET .../projects/{p}/states/ | work-item:read | none | none | same | A |
| list_work_item_labels | id, name, color | GET .../projects/{p}/labels/ | work-item:read | none | label names | same | A |
| get_project_cycles | id, name, start_date, end_date | GET .../projects/{p}/cycles/ | work-item:read | none | cycle names | same | A |
| list_conqrplan_members | id, displayName, email | GET /workspaces/{slug}/members/ | work-item:read | none | names, e-mail addresses | same | A |
| search_work_items | work-item summaries | GET .../issues/?search&per_page | work-item:read; item-level guest rule | none | item names | same | B |
| list_cycle_work_items | work-item summaries | GET .../cycles/{c}/cycle-issues/ | work-item:read; item-level guest rule | none | item names | same | B |
| get_work_item | normalised work item | GET .../issues/{id}/ | work-item:read; item-level guest rule | none | name, description, assignees | same | C |
| get_work_item_comments | id, text, actorId, createdAt | GET .../issues/{id}/comments/ | work-item:read; item-level guest rule | none | comment bodies | same | C |
| get_estimate_system | configured, isActive, id, name, type, points | GET .../estimates/ (+ estimate-points) | estimate:read | none | none | same | D |
| list_estimate_points | id, name, type, points | GET .../estimates/ (+ points when none embedded) | estimate:read | none | none | same | D |

## Parity defect found and fixed

The contract suite compared ids only. The MCP implementation returned
different shapes for the same tool names: `get_work_item` lacked
`sequenceId`, `stateId`, `typeId`; the work-item summary returned `state:
null` where Hub returns the raw state id (production ConqrPlan does not expand
`state`, so this affected every Batch B result); `get_work_item_comments` said
`authorId` for Hub's `actorId`; the two estimate tools had their own shapes.
Fixed in `packages/conqrplan-core/src/tools.ts`; the suite now runs Hub's real
tool classes and asserts complete-result equality (commit `2af0a217`, branch
`feat/conqrplan-read-parity`).

## Verification

Local stack: ConqrPlane `docker-compose-local.yml` (api, db, redis, mq, minio),
`seed_mcp_integration.py` fixtures extended with a mapped former member and a
soft-deleted work item (ConqrPlane branch `feat/mcp-contract-fixtures`).

| Check | Result |
|---|---|
| `conqrplan-read-contract.spec.ts` (Hub tool classes vs MCP over the wire, real ConqrPlan) | 67/67: member complete-result equality for all 11 reads; guest, unmapped, former member, wrong org, scope, deleted item, missing item/project, no-match, pagination, 16 concurrent callers, outage |
| `real-conqrplan-check.js` | 11/11 |
| `container-check.js` (built image, network boundary) | 10/10 |
| `standalone-check.js` | 28/28 |
| `tool-routing.int-spec.ts` (both dispatch entry points, hermetic) | 10/10 |
| `measure-hop.js` (N=30, get_work_item) | local p50 109 ms, via MCP p50 111 ms; +2 ms p50, +4 ms p95; 1 downstream request either way |
| ConqrPlan `DelegationAudit` (local) | 243 rows; 96 of 122 MCP `delegationJti` values present as accepted rows; 0 rows carry the header id; 30 rejections for the former member (`not_workspace_member`), 22 `identity_unmapped`, 4 `delegation_insufficient_scope` |

Production (all as the operator, through the connector; deployments read by id):

| Measure | Value |
|---|---|
| Routed `list_conqrplan_projects` calls after #32 | 11, all `ok`, all correlation-joined to an MCP trace |
| Batch A routed calls (states 2, labels 2, cycles 2, members 1) | 7/7 `ok`, 7/7 joined, byte-equal to local baselines |
| Pre-reduction routed calls used as MCP-route captures | 9, byte-equal to the local captures taken after reduction (8 of 8 comparisons) |
| Unexpected local executions of routed tools | 0 |
| Unrouted tools reaching MCP | 0 |
| 5xx / routing errors | 0 |
| MCP traces with three distinct identifiers | 18/18 (session), 24/24 (since deploy) |
| Second human | organic use on 2026-09-07 14:12Z, two routed calls, own session, correlation-joined |
| Hub-observed latency, MCP route | projects med 275 ms (p90 530); states 185-232; labels 148-339; cycles 192-383; members 193-200 |

## Batches

- A: states, labels, cycles, members - routed, verified, kept.
- B: search_work_items, list_cycle_work_items - blocked until `2af0a217` is deployed.
- C: get_work_item, get_work_item_comments - blocked, same.
- D: get_estimate_system, list_estimate_points - blocked, same.

Rollbacks performed: none. Writes remain local. `backfillProject` was not run.

## Limitations

- The real chat UI dispatch path was not exercised (no authenticated browser
  session available to the operator's tooling): unverified.
- ConqrPlan does not record the correlation header on accepted requests; the
  ConqrPlan leg joins via `delegationJti`. A ConqrPlane change would make the
  same value travel end to end.
- `ConqrPlanToolRouter.assertConfigurationCoherent()` is not called at boot.
- `POST /api/ai/work-items/backfill` has no role guard beyond the AI toggle.
- The read-side control for indexed work items (`WorkIntelService`) is a live
  per-item `getWorkItem` as the viewer; RAG paths drop work-item chunks by
  omission, not by an explicit deny.
