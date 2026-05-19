# Expert Insights — Slice 1 (Schema) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema changes that all later Expert Insights slices depend on — author snapshot columns, `confidence` enum, helpfulness counters on `expert_insights`; a nullable `department` column on `users`; a nullable `insight_id` FK on `attachments`; and a new `expert_insight_votes` table. Update the repo and service to populate snapshot fields and confidence on create, and to surface them via `findByPage`. No new endpoints, no UI. Ships as a single mergeable PR.

**Architecture:** Single Kysely migration adds all DDL (idempotent, online-safe). Type regeneration via `pnpm run migration:codegen` updates `apps/server/src/database/types/db.d.ts` to include the new columns and the `ExpertInsightVotes` interface. The `ExpertInsightsRepo` is extended to look up the author profile, snapshot it onto the insight row, and return per-row vote counters (placeholder zeroes until slice 2 adds the vote logic). `ExpertInsightsService.create()` threads the new `confidence` field from the DTO.

**Tech Stack:** NestJS (Fastify), Kysely, PostgreSQL, Jest.

**Spec:** [docs/superpowers/specs/2026-05-19-expert-insights-completion-design.md](../specs/2026-05-19-expert-insights-completion-design.md) — Slice 1 section.

---

## Task 0: Pre-flight

**Files:** none — verification only.

- [ ] **Step 0.1: Confirm we are in the project root and on the right branch**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: working tree may have unrelated modifications already present (those listed in the gitStatus block at session start), branch is `main` or a feature branch off it. Do NOT stage or revert those pre-existing modifications.

- [ ] **Step 0.2: Confirm the previous Expert Insights migration is in place**

Run: `ls apps/server/src/database/migrations/ | grep expert-insights`
Expected: one entry — `20260502T100000-expert-insights.ts`. We add a v2 migration that depends on it.

- [ ] **Step 0.3: Confirm `gen_uuid_v7()` is available**

Run: `grep -rn "gen_uuid_v7" apps/server/src/database/migrations/ | head -3`
Expected: multiple matches (helper function added by an earlier migration). We rely on it for new `expert_insight_votes.id`.

---

## Task 1: Write the migration

**Files:**
- Create: `apps/server/src/database/migrations/20260520T100000-expert-insights-v2.ts`

- [ ] **Step 1.1: Create the migration file**

Write `apps/server/src/database/migrations/20260520T100000-expert-insights-v2.ts`:

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enums first so column definitions can reference them.
  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_confidence AS ENUM ('low', 'medium', 'high');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_vote_kind AS ENUM ('helpful', 'not_helpful');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  // expert_insights — author snapshot + confidence + counters.
  await db.schema
    .alterTable('expert_insights')
    .addColumn('author_name', 'text')
    .addColumn('author_role', 'text')
    .addColumn('author_department', 'text')
    .addColumn('confidence', sql`expert_insight_confidence`, (col) =>
      col.notNull().defaultTo('medium'),
    )
    .addColumn('helpful_count', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('not_helpful_count', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  // users — nullable department column.
  await db.schema
    .alterTable('users')
    .addColumn('department', 'text')
    .execute();

  // attachments — nullable insight_id FK + partial index.
  await db.schema
    .alterTable('attachments')
    .addColumn('insight_id', 'uuid', (col) =>
      col.references('expert_insights.id').onDelete('cascade'),
    )
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_insight
    ON attachments(insight_id)
    WHERE insight_id IS NOT NULL
  `.execute(db);

  // expert_insight_votes.
  await db.schema
    .createTable('expert_insight_votes')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('insight_id', 'uuid', (col) =>
      col.notNull().references('expert_insights.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('vote', sql`expert_insight_vote_kind`, (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uniq_expert_insight_votes_user_insight', [
      'insight_id',
      'user_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_expert_insight_votes_insight')
    .ifNotExists()
    .on('expert_insight_votes')
    .column('insight_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('expert_insight_votes').ifExists().execute();

  await sql`DROP INDEX IF EXISTS idx_attachments_insight`.execute(db);
  await db.schema
    .alterTable('attachments')
    .dropColumn('insight_id')
    .execute();

  await db.schema.alterTable('users').dropColumn('department').execute();

  await db.schema
    .alterTable('expert_insights')
    .dropColumn('not_helpful_count')
    .dropColumn('helpful_count')
    .dropColumn('confidence')
    .dropColumn('author_department')
    .dropColumn('author_role')
    .dropColumn('author_name')
    .execute();

  await sql`DROP TYPE IF EXISTS expert_insight_vote_kind`.execute(db);
  await sql`DROP TYPE IF EXISTS expert_insight_confidence`.execute(db);
}
```

- [ ] **Step 1.2: Run the migration**

Run from `apps/server`: `pnpm run migration:up`
Expected: log line `Migration "20260520T100000-expert-insights-v2" was executed successfully` (or similar — match the convention from previous migrations).

- [ ] **Step 1.3: Verify table shape in psql (or any DB tool)**

Run from project root: `docker compose exec db psql -U postgres -d docmost -c "\d expert_insights" | sed -n '1,40p'`
Expected: the `expert_insights` table now lists `author_name`, `author_role`, `author_department`, `confidence`, `helpful_count`, `not_helpful_count` columns. `confidence` defaults to `'medium'`. `helpful_count` and `not_helpful_count` default to `0`.

Also run: `docker compose exec db psql -U postgres -d docmost -c "\d expert_insight_votes"`
Expected: table with `id, insight_id, user_id, vote, created_at, updated_at`, primary key on `id`, unique constraint on `(insight_id, user_id)`.

- [ ] **Step 1.4: Verify rollback works**

Run from `apps/server`: `pnpm run migration:down`
Expected: success log, then `\d expert_insights` no longer shows the new columns and `\d expert_insight_votes` errors with "Did not find any relation named...".

- [ ] **Step 1.5: Re-apply for the rest of the plan**

Run from `apps/server`: `pnpm run migration:up`
Expected: success.

- [ ] **Step 1.6: Commit**

```bash
git add apps/server/src/database/migrations/20260520T100000-expert-insights-v2.ts
git commit -m "feat(db): expert-insights v2 schema — snapshot, confidence, votes, attachments FK"
```

---

## Task 2: Regenerate Kysely types

**Files:**
- Modify (generated): `apps/server/src/database/types/db.d.ts`

- [ ] **Step 2.1: Run codegen**

Run from `apps/server`: `pnpm run migration:codegen`
Expected: command exits 0; `apps/server/src/database/types/db.d.ts` is rewritten.

- [ ] **Step 2.2: Verify new types are present**

Run: `grep -n "department\|expert_insight_confidence\|ExpertInsightVotes\|expertInsightVotes\|helpfulCount\|notHelpfulCount\|authorName\|authorRole\|authorDepartment\|insightId" apps/server/src/database/types/db.d.ts | head -25`
Expected: matches for at least `department`, `helpfulCount`, `notHelpfulCount`, `authorName`, `authorRole`, `authorDepartment`, `insightId` (on `Attachments`), and an `ExpertInsightVotes` interface (the exact casing depends on the codegen — check that it exists in some form before continuing).

- [ ] **Step 2.3: Commit the regenerated types**

```bash
git add apps/server/src/database/types/db.d.ts
git commit -m "chore(db): regenerate Kysely types for expert-insights v2"
```

---

## Task 3: Extend the repo types and create-input

**Files:**
- Modify: `apps/server/src/core/expert-insights/expert-insights.repo.ts`

- [ ] **Step 3.1: Extend `InsightRow` and `CreateInsightInput`**

Open `apps/server/src/core/expert-insights/expert-insights.repo.ts`. Replace the existing `InsightRow` and `CreateInsightInput` interfaces (around lines 9-43) with:

```ts
export type ExpertInsightConfidence = 'low' | 'medium' | 'high';

export interface InsightRow {
  id: string;
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: ExpertInsightType;
  status: ExpertInsightStatus;
  title: string;
  body: string;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  retiredAt: Date | null;
  spanAnchor: unknown;
  // Snapshot at create-time. Immutable.
  authorName: string | null;
  authorRole: string | null;
  authorDepartment: string | null;
  confidence: ExpertInsightConfidence;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateInsightInput {
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: ExpertInsightType;
  title: string;
  body: string;
  createdBy: string;
  // Snapshot — resolved by the service before the call.
  authorName: string | null;
  authorRole: string | null;
  authorDepartment: string | null;
  confidence: ExpertInsightConfidence;
  expiresAt?: Date | null;
  spanAnchor?: unknown;
}
```

- [ ] **Step 3.2: Update `create()` to persist the new columns**

In the same file, replace the body of `create()` (the existing `.insertInto('expertInsights').values({...})` block) with:

```ts
async create(input: CreateInsightInput): Promise<InsightRow> {
  return (this.db as any)
    .insertInto('expertInsights')
    .values({
      workspaceId: input.workspaceId,
      spaceId: input.spaceId,
      pageId: input.pageId,
      insightType: input.insightType,
      title: input.title,
      body: input.body,
      createdBy: input.createdBy,
      authorName: input.authorName,
      authorRole: input.authorRole,
      authorDepartment: input.authorDepartment,
      confidence: input.confidence,
      expiresAt: input.expiresAt ?? null,
      spanAnchor: input.spanAnchor
        ? sql`${JSON.stringify(input.spanAnchor)}::jsonb`
        : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
```

- [ ] **Step 3.3: Extend `UpdateInsightInput` to accept `confidence`**

Replace the `UpdateInsightInput` interface in the same file with:

```ts
export interface UpdateInsightInput {
  insightType?: ExpertInsightType;
  title?: string;
  body?: string;
  confidence?: ExpertInsightConfidence;
  expiresAt?: Date | null;
  spanAnchor?: unknown;
}
```

And in `update()`, add the confidence handler alongside the existing optional handlers:

```ts
if (input.confidence !== undefined) updates.confidence = input.confidence;
```

(Place it after the `body` line for readability.)

- [ ] **Step 3.4: Typecheck**

Run from `apps/server`: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no new errors. Pre-existing errors in unrelated files (mentioned in Task 0) are acceptable; nothing in `core/expert-insights/` should fail.

---

## Task 4: Add user-profile lookup to the service create flow

**Files:**
- Modify: `apps/server/src/core/expert-insights/expert-insights.service.ts`
- Modify: `apps/server/src/core/expert-insights/dto/create-insight.dto.ts`
- Modify: `apps/server/src/core/expert-insights/dto/update-insight.dto.ts`

- [ ] **Step 4.1: Add `confidence` to `CreateInsightDto`**

Open `apps/server/src/core/expert-insights/dto/create-insight.dto.ts`. Add inside the existing class (just before the closing brace):

```ts
@IsOptional()
@IsEnum(['low', 'medium', 'high'])
confidence?: 'low' | 'medium' | 'high';
```

The existing file already imports `IsEnum` and `IsOptional` from `class-validator` — no new imports needed.

- [ ] **Step 4.2: Add `confidence` to `UpdateInsightDto`**

Open `apps/server/src/core/expert-insights/dto/update-insight.dto.ts`. Add the same optional field block from Step 4.1 inside `UpdateInsightDto` (the class that wraps update fields — leave `InsightIdDto` alone).

- [ ] **Step 4.3: Resolve author profile in `service.create()`**

Open `apps/server/src/core/expert-insights/expert-insights.service.ts`. Inject Kysely so we can read the user profile. At the top of the file, add to the existing imports:

```ts
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
```

In the constructor, add `@InjectKysely() private readonly db: KyselyDB,` as the **last** parameter (so it doesn't break existing tests that pass positional mocks).

Replace the `create()` method body with:

```ts
async create(dto: CreateInsightDto, user: User) {
  const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
  if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
    throw new ForbiddenException('You cannot create insights in this space');
  }

  const profile = await (this.db as any)
    .selectFrom('users')
    .select(['name', 'role', 'department'])
    .where('id', '=', user.id)
    .executeTakeFirst();

  const insight = await this.repo.create({
    workspaceId: user.workspaceId,
    spaceId: dto.spaceId,
    pageId: dto.pageId,
    insightType: dto.insightType,
    title: dto.title,
    body: dto.body,
    createdBy: user.id,
    authorName: profile?.name ?? null,
    authorRole: profile?.role ?? null,
    authorDepartment: profile?.department ?? null,
    confidence: dto.confidence ?? 'medium',
    expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    spanAnchor: dto.spanAnchor,
  });

  this.eventEmitter.emit(EventName.INSIGHT_CREATED, {
    insightId: insight.id,
    workspaceId: insight.workspaceId,
    spaceId: insight.spaceId,
  });

  return insight;
}
```

- [ ] **Step 4.4: Thread `confidence` through `service.update()`**

Locate the existing `update()` method. In the `this.repo.update(dto.insightId, { ... })` call, add `confidence: dto.confidence,` to the object. Keep all existing fields. Snapshot fields (`authorName`, etc.) are NOT in this object — they are immutable.

- [ ] **Step 4.5: Typecheck**

Run from `apps/server`: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no new errors.

---

## Task 5: Update existing service spec for snapshot + confidence

**Files:**
- Modify: `apps/server/src/core/expert-insights/expert-insights.service.spec.ts`

- [ ] **Step 5.1: Update `makeInsight()` helper to include new fields**

Open `apps/server/src/core/expert-insights/expert-insights.service.spec.ts`. The helper at the top of the file currently returns a row missing the new columns. Locate the `function makeInsight(...)` helper. Replace its `return { ... }` block with:

```ts
return {
  id: INSIGHT_ID,
  workspaceId: WORKSPACE_ID,
  spaceId: SPACE_ID,
  pageId: PAGE_ID,
  insightType: 'warning',
  status: 'draft',
  title: 'Test insight',
  body: 'Some body text',
  createdBy: USER_ID,
  publishedBy: null,
  publishedAt: null,
  expiresAt: null,
  retiredAt: null,
  spanAnchor: null,
  authorName: 'Test User',
  authorRole: 'admin',
  authorDepartment: 'Engineering',
  confidence: 'medium',
  helpfulCount: 0,
  notHelpfulCount: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  ...overrides,
};
```

- [ ] **Step 5.2: Add a mock for the injected `KyselyDB`**

Still in the spec file, locate the `beforeEach` block that instantiates `ExpertInsightsService`. Above it, add:

```ts
const mockDb = {
  selectFrom: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  executeTakeFirst: jest
    .fn()
    .mockResolvedValue({
      name: 'Test User',
      role: 'admin',
      department: 'Engineering',
    }),
} as any;
```

Then update the service instantiation in the `beforeEach` to pass `mockDb` as the new fourth constructor argument:

```ts
service = new ExpertInsightsService(
  repo,
  spaceAbility as any,
  eventEmitter as any,
  mockDb,
);
```

- [ ] **Step 5.3: Write a new test for snapshot fields**

In the `describe('create', ...)` block, add a new test as the last `it()`:

```ts
it('snapshots author name/role/department and defaults confidence to medium', async () => {
  spaceAbility.createForUser.mockResolvedValue(
    makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight),
  );
  repo.create.mockResolvedValue(
    makeInsight({ authorName: 'Test User', authorRole: 'admin' }),
  );

  await service.create(
    {
      spaceId: SPACE_ID,
      pageId: PAGE_ID,
      insightType: 'warning',
      title: 't',
      body: 'b',
    } as any,
    mockUser,
  );

  expect(repo.create).toHaveBeenCalledWith(
    expect.objectContaining({
      authorName: 'Test User',
      authorRole: 'admin',
      authorDepartment: 'Engineering',
      confidence: 'medium',
    }),
  );
});
```

- [ ] **Step 5.4: Write a test that confidence is taken from the DTO when present**

Append immediately after the previous test:

```ts
it('uses confidence from the DTO when provided', async () => {
  spaceAbility.createForUser.mockResolvedValue(
    makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight),
  );
  repo.create.mockResolvedValue(makeInsight({ confidence: 'high' }));

  await service.create(
    {
      spaceId: SPACE_ID,
      pageId: PAGE_ID,
      insightType: 'recommendation',
      title: 't',
      body: 'b',
      confidence: 'high',
    } as any,
    mockUser,
  );

  expect(repo.create).toHaveBeenCalledWith(
    expect.objectContaining({ confidence: 'high' }),
  );
});
```

- [ ] **Step 5.5: Run the spec**

Run from `apps/server`: `pnpm exec jest src/core/expert-insights/expert-insights.service.spec.ts`
Expected: all tests pass, including the two new ones from Steps 5.3 and 5.4.

- [ ] **Step 5.6: Commit the repo + service + spec changes**

```bash
git add apps/server/src/core/expert-insights/expert-insights.repo.ts \
        apps/server/src/core/expert-insights/expert-insights.service.ts \
        apps/server/src/core/expert-insights/dto/create-insight.dto.ts \
        apps/server/src/core/expert-insights/dto/update-insight.dto.ts \
        apps/server/src/core/expert-insights/expert-insights.service.spec.ts
git commit -m "feat(insights): snapshot author + confidence on create, surface in repo"
```

---

## Task 6: Smoke-test the migration + create flow end-to-end

**Files:** none — verification only.

- [ ] **Step 6.1: Run the full server unit suite for the insights module**

Run from `apps/server`: `pnpm exec jest src/core/expert-insights/`
Expected: all green, including pre-existing tests.

- [ ] **Step 6.2: Run the server build to confirm no compile regressions**

Run from `apps/server`: `pnpm run build`
Expected: exits 0. Build warnings in unrelated files are acceptable, but `core/expert-insights/` must build clean.

- [ ] **Step 6.3: Verify the migration is the latest applied**

Run from `apps/server`: `pnpm exec ts-node -e "process.exit(0)"` (no-op; just confirms ts-node still works) — then in any DB tool, query: `select name from migrations order by name desc limit 3;`
Expected: top row is `20260520T100000-expert-insights-v2`.

- [ ] **Step 6.4: Final commit (if anything was left unstaged)**

Run: `git status --short`
Expected: clean working tree apart from the unrelated pre-existing modifications noted in Task 0. If anything new appears, inspect it before committing.

---

## What's not in this slice (handed off to slice 2)

- Vote endpoints + counter mutation logic (`vote`, `unvote` in service / controller)
- Repo-level `findByPage` returning `myVote` joined from `expert_insight_votes`
- Attachment controller routing the `insightId` field
- Expiry cron (`ExpertInsightsScheduler`)
- Draft privacy fix (listener limiting embedding to `INSIGHT_PUBLISHED`)

`helpful_count` and `not_helpful_count` exist on the table after this slice but stay at `0` until slice 2 mutates them. `findByPage` returns them as-is; no consumer reads them yet.

## Self-review checklist (run before handing off to the executor)

- Migration is idempotent (each `CREATE TYPE` wrapped in `DO $$ ... EXCEPTION`, indexes have `IF NOT EXISTS`, table has `ifNotExists()`).
- Migration `down()` removes everything `up()` added, in reverse order.
- Repo types match generated db.d.ts column names (camelCase from snake_case).
- Service creates with `confidence` defaulting to `'medium'` when DTO omits it.
- Snapshot fields are nullable in the row type (existing rows from before the migration will read as `null` until/unless backfilled).
- No new endpoints, no UI, no listener changes. All of that is slice 2+.
- Tests use the existing in-memory mock pattern, no DB needed.
