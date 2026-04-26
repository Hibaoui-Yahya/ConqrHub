# Documentation Health Center

> **Status:** MVP shipped 2026-04-26. See [PRD 21](../prd/21-documentation-health.md) for the long-term scope.

The Documentation Health Center scores how well-maintained your knowledge base is and surfaces a prioritised list of pages to fix.

## Where to find it

`Settings → Documentation health` (visible to **workspace admins and owners only**).

## What gets scored

Each page is scored on four signals:

| Signal | Weight | What it measures |
|---|---|---|
| Freshness | 30% | Days since the page was last updated. 100 if ≤90 days, decays linearly to 0 at 365 days. |
| Ownership | 25% | Whether `pages.owner_id` points to an active (non-deactivated, non-deleted) user. |
| Verification | 25% | Only counted on **critical** pages. 100 if currently verified, 50 if expiring, 0 if expired or never verified. The signal is averaged across critical pages only — non-critical pages don't contribute. If a scope has no critical pages, the signal returns `null` (rendered as "Not applicable"). |
| Content strength | 20% | Word count of the page body. 100 if ≥300 words, 0 if <50 words, linear scale between. |

Per-page scores roll up to a per-space score (simple average) and a workspace score (average across all scored pages). A space needs ≥10 pages before a score is shown — smaller spaces display "Insufficient data".

## What makes a page "critical"

A page is treated as critical (and therefore verification-tracked) when **either**:

- the space it lives in is marked **Critical space** (Space settings → toggle), **or**
- the page already has a `page_verifications` record.

Non-critical pages are scored on the other three signals — verification doesn't drag them down.

Toggling a space's critical flag is recorded as a `space.updated` audit event with `before`/`after` showing the change.

## Issue categories

The "Issues to fix" list filters pages by one of five categories:

| Category | What it means | Suggested action |
|---|---|---|
| Outdated | Last updated >180 days ago | Open the page and refresh it |
| Missing owner | No active owner assigned | Assign a knowledge owner |
| Unverified critical | Critical page that isn't currently verified | Request verification |
| Weak content | Fewer than 50 words | Flesh the page out or merge it |
| Broken links | Page contains internal links pointing to deleted or missing pages | Edit the page and remove or repoint the links |

## Permissions

| Endpoint | Access |
|---|---|
| `POST /api/workspace-health` | Workspace admin or owner |
| `POST /api/workspace-health/space` | Workspace admin/owner, **or** Space admin for that space |
| `POST /api/workspace-health/issues` | Workspace admin/owner for workspace-wide queries; Space admin for queries scoped to their space |
| `POST /api/workspace-health/trend` | Workspace admin/owner for workspace-wide trend; Space admin for queries scoped to their space |
| `POST /api/workspace-health/snapshot` | Workspace admin or owner — triggers an immediate capture (otherwise waits for the daily cron) |
| `POST /api/workspace-health/alerts` | Any authenticated user — lists their own alert subscriptions for this workspace |
| `POST /api/workspace-health/alerts/subscribe` | Any authenticated user — upserts a subscription (one row per `user × workspace × space` scope) |
| `POST /api/workspace-health/alerts/unsubscribe` | Any authenticated user — removes one of their own subscriptions |

The issue list is computed against `pages.deleted_at IS NULL` and joins to `spaces` and `users` so deactivated/deleted users surface as "missing owner".

## Score over time (v1.1)

A daily cron (`0 2 * * *` UTC) snapshots every workspace's score (one workspace-level row + one row per space) into `doc_health_snapshots`. A second job 30 minutes later prunes anything older than 365 days. Both jobs run on the `general-queue` and are registered by `DocHealthCronService` at module init.

The Documentation Health page renders a sparkline chart of the workspace-level score with selectable ranges (7d / 30d / 90d / 1y). Admins can hit **Snapshot now** to capture an extra point immediately — useful right after a bulk content fix, or for demos where waiting until 02:00 UTC isn't an option.

## Broken-link detection (v1.2 → v1.3)

A weekly cron (Sunday `0 3 * * *` UTC, registered alongside the snapshot/prune jobs) walks every page in every workspace, extracts every link mark from the ProseMirror content, and records anything that resolves as broken in `page_broken_links`. Each scan replaces that page's broken-link rows transactionally, so resolving a broken link clears it on the next scan.

**Internal links** (v1.2) are matched by URL shape (`/p/<slugId>` or `/s/<spaceSlug>/p/<slugId>`), then validated against the `pages` table. Multi-hostname deployments and custom domains work without extra configuration.

**External links** (v1.3) use a HEAD request with a configurable timeout (default 5s), falling back to GET when the host returns 405 / 501. Redirects are followed (up to whatever the runtime's default is, typically 20). The scanner deduplicates external URLs across the workspace before checking, so 100 pages linking to the same URL produce one HEAD request, not 100. Concurrency is capped (default 5 parallel checks) to avoid hammering remote hosts.

| HTTP outcome | Reason recorded |
|---|---|
| 4xx | `http_4xx` |
| 5xx | `http_5xx` |
| AbortError / timeout | `timeout` |
| ENOTFOUND / ECONNREFUSED / EAI_AGAIN | `dns` |
| Anything else (network error, malformed URL) | `unknown` |

Air-gapped operators **disable external checks** with `DOC_HEALTH_EXTERNAL_CHECKS=false`. The internal-link scan remains active. See [Environment variables](../deployment/environment-variables.md).

A broken link surfaces as a row in the **Broken links** tab of the Issues to fix list, sorted by per-page broken-link count (highest first). Severity scales: 1 link = low, 2-4 = medium, 5+ = high.

## Drop alerts (v1.1)

Any user (not just admins) can subscribe to a "tell me when the workspace score drops below X" alert from the Documentation Health page. Subscriptions live in `doc_health_alert_subscriptions` (one row per `user × workspace × space` scope) and are evaluated immediately after the daily snapshot job — so an alert fires at most once per day per subscription, with an additional 24-hour dedupe window guarding against repeat firings while a workspace stays under threshold.

Notifications use the existing in-app notification path (`NotificationType.DOC_HEALTH_DROPPED`, surfaced in the **Direct** notification tab). The notification payload carries `{ score, threshold, scope }` so the client can render a meaningful message without an extra round-trip.

A subscription is silent during "insufficient data" periods — if the workspace doesn't have enough scored pages to produce a score (i.e., latest snapshot row has `score: null`), the alert evaluator skips that subscription rather than treating null as zero.

## Operational notes

- Same-day capture is idempotent: re-running on the same UTC day overwrites that day's rows rather than appending. The first capture on a brand-new workspace inserts a row even if `score` is null (insufficient data) so the trend chart can still show a continuous date axis.
- The Health Center is **gated by Workspace Admin role**, not by an entitlement flag. To restrict it to a paid tier in the future, add a `Feature.DOC_HEALTH` flag and gate the sidebar entry plus controller.
- Mobile layout is not optimised in this MVP — desktop-first per the broader product position (PRD 26.4).

## Out of scope (next iterations)

| Capability | Tracking |
|---|---|
| Email digest of alert events | v1.2 (in-app fires today) |
| Broken external link detection | v1.3 |
| Semantic duplicate detection | v1.3 |
| AI-confidence signal | v2 (depends on AI Search analytics) |
| Search-success signal | v2 (depends on PRD 20.2 analytics) |
| Knowledge gap detection | v2 (PRD 21.3) |

## Required manual steps after pulling this code

1. Run the new migration:
   ```bash
   cd apps/server && pnpm run migration:up
   ```
   This adds `pages.owner_id` and `spaces.is_critical`.

2. Regenerate Kysely types (the manual edits in `db.d.ts` will be overwritten with the same shape):
   ```bash
   cd apps/server && pnpm run migration:codegen
   ```

3. Optional: mark high-importance spaces as critical so verification scoring activates. Space settings → "Critical space" toggle.

4. Optional, for demos and visual QA: populate two demo spaces with ~26 pages spanning every health category:
   ```bash
   cd apps/server && pnpm run seed:doc-health
   ```
   The script is idempotent — pages it inserts are titled `[seed] *` and re-running clears and re-creates them. Requires an existing workspace (run `/setup` or sign up first).
