# Adding a feature, end to end

A practical recipe. Not every feature touches every layer — pick the steps that apply.

## Worked example

Imagine you want to add a **"page reading-time estimate"** that shows on the page header.

1. Backend computes a reading-time integer from the page's plain text.
2. Stored on the page row.
3. Updated when the page changes.
4. Returned in `GET /pages/info`.
5. Rendered on the page header in the client.
6. Hidden behind a feature flag for staged rollout.

## Step 1 — Schema

Decide if you need a new column or new table. For "reading time," a column is enough.

```bash
cd apps/server
pnpm migration:create add-page-reading-time
```

Edit the generated file:

```ts
export async function up(db) {
  await db.schema
    .alterTable('pages')
    .addColumn('reading_time_seconds', 'integer')
    .execute();
}

export async function down(db) {
  await db.schema
    .alterTable('pages')
    .dropColumn('reading_time_seconds')
    .execute();
}
```

Run it:
```bash
pnpm migration:latest
pnpm migration:codegen
```

## Step 2 — Repo + service

In `apps/server/src/database/repos/page.repo.ts`, add an `updateReadingTime(pageId, seconds)` method.

In `apps/server/src/core/page/services/page.service.ts`, add a `recomputeReadingTime(pageId)` method that:

- Loads the page's `text_content`.
- Computes a reading-time estimate (e.g. 200 wpm).
- Calls `pageRepo.updateReadingTime`.

## Step 3 — Wire it to a queue (if expensive)

Reading time is cheap but, for the pattern, let's enqueue it on the search-index pathway. In your `PAGE_CONTENT_UPDATED` job processor, add a call to `recomputeReadingTime` (or enqueue a separate job).

## Step 4 — Expose it on the API

Modify `PageService.getInfo` to return the reading time. Update the DTO type. Update the OpenAPI / response shape if you publish one.

## Step 5 — Audit (if it's user-visible governance)

Reading time isn't governance, so skip the audit step. If your feature *does* affect access, ownership, or content visibility, emit an audit event:

```ts
this.auditService.record({
  event: 'PAGE_READING_TIME_RECOMPUTED', // example only
  workspaceId,
  resourceType: 'page',
  resourceId: pageId,
});
```

Update [`../reference/audit-events.md`](../reference/audit-events.md).

## Step 6 — Notifications (if applicable)

Reading time isn't a notification trigger, so skip. If your feature does notify someone, see [`../reference/notification-events.md`](../reference/notification-events.md).

## Step 7 — Frontend types

In `apps/client/src/features/page/types/`, extend the page type with `readingTimeSeconds`. Update the TanStack Query hook.

## Step 8 — UI

In `apps/client/src/features/page/components/page-header/`, render a small badge:

```tsx
{page.readingTimeSeconds && (
  <Badge>{Math.round(page.readingTimeSeconds / 60)} min read</Badge>
)}
```

## Step 9 — Feature flag (for staged rollout)

If you want to gate this:

1. Add `Feature.READING_TIME = 'page:reading-time'` in both `apps/server/src/common/features.ts` and `apps/client/src/ee/features.ts`.
2. In the controller (or service), gate with `licenseCheckService.hasFeature(...)`.
3. In the UI, gate with `useHasFeature('page:reading-time')`.
4. Document in [`../reference/feature-flags.md`](../reference/feature-flags.md).

For most features that aren't tied to commercial tiers, you don't need a feature flag — the codebase's flag system is for **commercial** entitlements, not experimentation.

## Step 10 — Tests

- **Unit:** `PageService.recomputeReadingTime` with mocked repo.
- **Integration:** Save a page → confirm reading time is computed and returned.
- **E2E:** Hit `/pages/info` and assert the field is in the response.

See [`./testing.md`](./testing.md).

## Step 11 — Documentation

- Update the relevant area's PRD (e.g. [`../prd/04-pages-and-content-lifecycle.md`](../prd/04-pages-and-content-lifecycle.md)).
- Update the feature catalogue: [`../product/feature-catalogue.md`](../product/feature-catalogue.md).
- If new APIs were added, update [`../reference/api.md`](../reference/api.md).
- If new schema was added, update [`../reference/database-schema.md`](../reference/database-schema.md).

## Step 12 — Review checklist

Before opening the PR, confirm:

- [ ] Migration is reversible (`down` is implemented and tested).
- [ ] `db.d.ts` is regenerated and committed.
- [ ] Feature is permission-aware — pages the user can't see don't expose it.
- [ ] Audit event emitted if the action affects governance.
- [ ] Notification dispatched if a person should know about it.
- [ ] Tests exist at least at the unit level.
- [ ] No new env var introduced without documenting it in [`../deployment/environment-variables.md`](../deployment/environment-variables.md).
- [ ] No new feature flag introduced without documenting it in [`../reference/feature-flags.md`](../reference/feature-flags.md).
- [ ] No EE / OSS bleed — EE-only code in `ee/` directories, OSS code in `core/` / `features/`.

## When in doubt

The pattern matters more than the exact code. Read the closest analogous feature and mirror its structure — that's the fastest way to ship something the rest of the codebase will accept.
