# Work-Item Semantic Intelligence (Phase A: A1 + A2, Hub side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index ConqrPlane work items into ConqrHub's pgvector embedding store (fed live by the existing Plane webhook stream) and expose semantic **similar-work-item** and **label-prediction** endpoints that Plane's create/intake UI will consume.

**Architecture:** A new EE indexer (`WorkItemIndexerService`) mirrors the existing `InsightIndexerService`, storing chunks in the existing `ai_embeddings` table under a new `plane_work_item` source kind, scoped to the Hub space mapped to the work item's Plane project (permission scoping comes free from project↔space mappings; unmapped projects are never indexed). The core webhook processor bridges to EE **only via the BullMQ AI queue** (licensing boundary: `core/` must never import `ee/`). A new EE `WorkIntelModule` exposes `POST /api/ai/work-items/similar`, `POST /api/ai/work-items/predict-labels`, and an admin backfill.

**Tech Stack:** NestJS (Fastify), Kysely + PostgreSQL + pgvector, BullMQ, Jest. Repo: `ConqrHub/` (branch `main`).

## Global Constraints

- **Licensing:** everything under `apps/server/src/ee/` is EE-licensed; files under `core/` and `integrations/` are AGPL and MUST NOT import from `ee/`. Core→EE communication only via `QueueName.AI_QUEUE` jobs.
- **Terminology (Conqr Suite Glossary):** user-facing strings say "work item" (never "issue"), assistant is "Conqr AI".
- **Working directory for all commands:** `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\ConqrHub` unless stated. Tests run from `apps/server`.
- **Parallel-session guard:** do not modify `packages/i18n` or anything in the `plane/` repo — that belongs to the terminology/parity workstream. This plan touches only ConqrHub.
- **`ai_embeddings.source_id` is `uuid`** — Plane work-item ids are UUIDs, OK. **`space_id` is NOT NULL FK** — always index under the mapped space's id.
- **`source_kind` is the Postgres enum `ai_source_kind`** — new values need `ALTER TYPE ... ADD VALUE` (cannot be removed in `down`; down migrations are no-ops for enum additions).
- Embedding vectors are `vector(1024)`; model/dim come from `AiProviderService` (`getEmbeddingDimension()`, `embedMany()`, `isAvailable()`) and `EnvironmentService` (`getAiEmbeddingModel()`, `getAiEmbeddingChunkChars()`, `getAiEmbeddingChunkOverlap()`, `getAiEmbeddingBatchSize()`).
- Commit after every task: `git add <files> && git commit -m "<conventional message>"`.

---

### Task 1: `plane_work_item` source kind (migration + type)

**Files:**
- Create: `apps/server/src/database/migrations/20260719T090000-plane-work-item-source-kind.ts`
- Modify: `apps/server/src/database/types/embeddings.types.ts` (the `AiSourceKind` union)

**Interfaces:**
- Produces: `AiSourceKind` now includes `'plane_work_item'` — every later task relies on this literal.

- [ ] **Step 1: Write the migration**

```typescript
// apps/server/src/database/migrations/20260719T090000-plane-work-item-source-kind.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // PG >= 12 allows ADD VALUE inside a transaction as long as the new value
  // is not used in the same transaction — we don't use it here.
  await sql`ALTER TYPE ai_source_kind ADD VALUE IF NOT EXISTS 'plane_work_item'`.execute(
    db,
  );
}

export async function down(_db: Kysely<any>): Promise<void> {
  // PostgreSQL cannot remove enum values; rolling back is a no-op.
  // Rows with source_kind = 'plane_work_item' are cleaned by the AI queue's
  // delete jobs, not by schema rollback.
}
```

- [ ] **Step 2: Update the type union**

In `apps/server/src/database/types/embeddings.types.ts` change:

```typescript
export type AiSourceKind = 'page' | 'expert_insight' | 'external_document';
```

to:

```typescript
export type AiSourceKind =
  | 'page'
  | 'expert_insight'
  | 'external_document'
  | 'plane_work_item';
```

- [ ] **Step 3: Run the migration against the dev database**

Run (from `apps/server`, requires the compose `db` container up — `docker-compose up -d db redis` from repo root if not):
`pnpm run migration:latest`
Expected: migration `20260719T090000-plane-work-item-source-kind` executed without error.

Verify: `docker exec conqrhub-db-1 psql -U <user from .env DATABASE_URL> -d <db> -c "select unnest(enum_range(null::ai_source_kind));"` lists `plane_work_item`. (If the db container has a different name, find it with `docker ps`; if no local db is reachable, note it in the task report — the migration will be verified in Task 8's full run.)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p apps/server/tsconfig.json` (from repo root; or `cd apps/server && pnpm exec tsc --noEmit`)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/database/migrations/20260719T090000-plane-work-item-source-kind.ts apps/server/src/database/types/embeddings.types.ts
git commit -m "feat(ai): add plane_work_item source kind for suite semantic index"
```

---

### Task 2: Plane client — labels + cursor pagination

**Files:**
- Modify: `apps/server/src/core/integration/services/plane-client.service.ts`
- Test (create): `apps/server/src/core/integration/services/plane-client.service.spec.ts`

**Interfaces:**
- Consumes: existing `PlaneClientService.request<T>()` private helper, `EnvironmentService.getPlaneApiUrl()/getPlaneApiKey()/getPlaneWorkspaceSlug()/getPlaneApiTimeoutMs()`.
- Produces (used by Tasks 4 & 7):

```typescript
export interface PlaneLabel { id: string; name: string; color?: string }
// PlaneWorkItem gains: labels?: string[];  (array of label UUIDs)
listLabels(projectId: string, workspaceSlug?: string): Promise<PlaneLabel[]>
listWorkItemsPage(
  projectId: string,
  opts?: { cursor?: string; perPage?: number },
  workspaceSlug?: string,
): Promise<{ results: PlaneWorkItem[]; nextCursor: string | null }>
```

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/core/integration/services/plane-client.service.spec.ts
import { PlaneClientService } from './plane-client.service';

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    isPlaneIntegrationEnabled: jest.fn().mockReturnValue(true),
    getPlaneApiUrl: jest.fn().mockReturnValue('http://plane.test/api/v1'),
    getPlaneApiKey: jest.fn().mockReturnValue('test-key'),
    getPlaneWorkspaceSlug: jest.fn().mockReturnValue('conqr'),
    getPlaneApiTimeoutMs: jest.fn().mockReturnValue(5000),
    ...overrides,
  } as any;
}

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('PlaneClientService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('lists labels for a project (handles bare-array response)', async () => {
    const svc = new PlaneClientService(makeEnv());
    mockFetchOnce(200, [{ id: 'l1', name: 'bug', color: '#f00' }]);

    const labels = await svc.listLabels('proj-1');

    expect(labels).toEqual([{ id: 'l1', name: 'bug', color: '#f00' }]);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'http://plane.test/api/v1/workspaces/conqr/projects/proj-1/labels/',
    );
  });

  it('lists labels (handles paginated {results} response)', async () => {
    const svc = new PlaneClientService(makeEnv());
    mockFetchOnce(200, { results: [{ id: 'l2', name: 'story' }] });

    const labels = await svc.listLabels('proj-1');
    expect(labels).toEqual([{ id: 'l2', name: 'story' }]);
  });

  it('pages work items with a cursor and reports the next cursor', async () => {
    const svc = new PlaneClientService(makeEnv());
    mockFetchOnce(200, {
      results: [{ id: 'wi-1', name: 'First' }],
      next_cursor: '100:1:0',
      next_page_results: true,
    });

    const page = await svc.listWorkItemsPage('proj-1', { perPage: 100 });

    expect(page.results).toHaveLength(1);
    expect(page.nextCursor).toBe('100:1:0');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      'per_page=100',
    );
  });

  it('returns nextCursor null on the last page', async () => {
    const svc = new PlaneClientService(makeEnv());
    mockFetchOnce(200, {
      results: [{ id: 'wi-2', name: 'Last' }],
      next_cursor: '100:2:0',
      next_page_results: false,
    });

    const page = await svc.listWorkItemsPage('proj-1', {
      cursor: '100:1:0',
    });
    expect(page.nextCursor).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      'cursor=100%3A1%3A0',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/server`): `pnpm run test -- --testPathPattern=plane-client`
Expected: FAIL — `listLabels is not a function`.

- [ ] **Step 3: Implement**

In `plane-client.service.ts`:

1. Extend the `PlaneWorkItem` interface with `labels?: string[];` (after `assignees`).
2. Add the `PlaneLabel` interface below `PlaneWorkItem`:

```typescript
export interface PlaneLabel {
  id: string;
  name: string;
  color?: string;
}
```

3. Add the two methods at the end of the class (after `listWorkItems`):

```typescript
  /** List a project's labels (id → name) for label prediction metadata. */
  async listLabels(
    projectId: string,
    workspaceSlug?: string,
  ): Promise<PlaneLabel[]> {
    const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
    const res = await this.request<{ results?: PlaneLabel[] } | PlaneLabel[]>(
      `/workspaces/${slug}/projects/${projectId}/labels/`,
    );
    return Array.isArray(res) ? res : (res.results ?? []);
  }

  /**
   * Cursor-paginated work-item listing for backfills. Plane's cursor format is
   * `<page_size>:<page>:<offset>`; `next_page_results=false` marks the end.
   */
  async listWorkItemsPage(
    projectId: string,
    opts: { cursor?: string; perPage?: number } = {},
    workspaceSlug?: string,
  ): Promise<{ results: PlaneWorkItem[]; nextCursor: string | null }> {
    const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
    const params = new URLSearchParams();
    if (opts.perPage) params.set('per_page', String(opts.perPage));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{
      results?: PlaneWorkItem[];
      next_cursor?: string;
      next_page_results?: boolean;
    }>(`/workspaces/${slug}/projects/${projectId}/issues/${qs}`);
    return {
      results: res.results ?? [],
      nextCursor: res.next_page_results ? (res.next_cursor ?? null) : null,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern=plane-client`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/core/integration/services/plane-client.service.ts apps/server/src/core/integration/services/plane-client.service.spec.ts
git commit -m "feat(integration): Plane client label listing + cursor pagination"
```

---

### Task 3: Mapping lookup across workspaces + export PlaneClientService

**Files:**
- Modify: `apps/server/src/database/repos/integration/project-space-mapping.repo.ts`
- Modify: `apps/server/src/core/integration/integration.module.ts` (exports)

**Interfaces:**
- Produces (used by Task 4):

```typescript
// ProjectSpaceMappingRepo
findPrimaryForProjectAnyWorkspace(
  planeProjectId: string,
): Promise<IntegrationProjectSpaceMapping | undefined>
```

- `IntegrationModule` exports gain `PlaneClientService` (EE EmbeddingsModule will inject it).

- [ ] **Step 1: Add the repo method**

Webhooks arrive with no Hub-workspace context, and `ai_embeddings` allows exactly one row-set per source (unique on source_kind/source_id/chunk_index/model), so a work item is indexed once — under the primary mapping. Add after `listForWorkspace` in `project-space-mapping.repo.ts` (reuse the class's existing `sql` import if present; otherwise add `import { sql } from 'kysely';`):

```typescript
  /**
   * The single mapping a work item's embeddings are scoped to: the earliest
   * primary mapping for the project across all Hub workspaces (secondary
   * mappings are used only when no primary exists).
   */
  async findPrimaryForProjectAnyWorkspace(
    planeProjectId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('planeProjectId', '=', planeProjectId)
      .where('deletedAt', 'is', null)
      .orderBy(
        sql`case when mapping_kind = 'primary' then 0 else 1 end`,
        'asc',
      )
      .orderBy('createdAt', 'asc')
      .executeTakeFirst();
  }
```

- [ ] **Step 2: Export PlaneClientService from IntegrationModule**

In `integration.module.ts`, add `PlaneClientService` to the `exports` array (keep the existing entries):

```typescript
  exports: [
    RelationshipService,
    ProjectSpaceMappingService,
    SmartObjectResolverService,
    PlaneClientService,
    WorkItemCreationService,
    TraceabilityService,
    NotificationDedupService,
    FederatedSearchService,
    RequirementService,
    CrossProductInsightService,
    DelegatedTokenService,
  ],
```

- [ ] **Step 3: Typecheck**

Run (from `apps/server`): `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/database/repos/integration/project-space-mapping.repo.ts apps/server/src/core/integration/integration.module.ts
git commit -m "feat(integration): primary-mapping lookup by project + export Plane client"
```

---

### Task 4: EE `WorkItemIndexerService`

**Files:**
- Create: `apps/server/src/ee/ai/embeddings/work-item-indexer.service.ts`
- Test (create): `apps/server/src/ee/ai/embeddings/work-item-indexer.service.spec.ts`
- Modify: `apps/server/src/ee/ai/embeddings/embeddings.module.ts` (import IntegrationModule; provide + export the new service)

**Interfaces:**
- Consumes: `PlaneClientService.getWorkItem/listLabels/listWorkItemsPage` (Task 2), `ProjectSpaceMappingRepo.findPrimaryForProjectAnyWorkspace` (Task 3), `AiProviderService.isAvailable()/embedMany()/getEmbeddingDimension()`, `ChunkingService.chunk()/contentHash()`, `EmbeddingRepository.upsertChunks/isContentUnchanged/deleteBySource`, `EnvironmentService.getAiEmbeddingModel()/getAiEmbeddingChunkChars()/getAiEmbeddingChunkOverlap()/getAiEmbeddingBatchSize()/getPlaneAppUrl()/getPlaneWorkspaceSlug()`.
- Produces (used by Tasks 5 & 7):

```typescript
export interface IndexWorkItemResult {
  workItemId: string;
  status: 'indexed' | 'skipped' | 'deleted' | 'no_content' | 'ai_unavailable' | 'unmapped';
  chunksIndexed?: number;
}
indexWorkItem(workItemId: string, projectId: string): Promise<IndexWorkItemResult>
deleteWorkItemEmbeddings(workItemId: string): Promise<void>
backfillProject(projectId: string): Promise<{ indexed: number; skipped: number; failed: number }>
```

Chunk `metadata` shape (Task 7 reads it — keep names exact):
`{ workItemId, projectId, title, sequenceId, state, labels: string[] /* label NAMES */, url: string | null }`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/server/src/ee/ai/embeddings/work-item-indexer.service.spec.ts
import { WorkItemIndexerService } from './work-item-indexer.service';
import { PlaneApiError } from '../../../core/integration/services/plane-client.service';

function makeDeps(overrides: Partial<Record<string, any>> = {}) {
  const plane = {
    isEnabled: jest.fn().mockReturnValue(true),
    getWorkItem: jest.fn().mockResolvedValue({
      id: 'wi-1',
      name: 'Login fails on Safari',
      description_stripped: 'Steps to reproduce...',
      sequence_id: 42,
      state_detail: { name: 'Backlog', group: 'backlog' },
      labels: ['l1'],
      project: 'proj-1',
    }),
    listLabels: jest
      .fn()
      .mockResolvedValue([{ id: 'l1', name: 'bug' }, { id: 'l2', name: 'story' }]),
    listWorkItemsPage: jest.fn(),
    ...overrides.plane,
  };
  const mappings = {
    findPrimaryForProjectAnyWorkspace: jest.fn().mockResolvedValue({
      id: 'm1',
      workspaceId: 'ws-1',
      spaceId: 'sp-1',
      planeProjectId: 'proj-1',
      mappingKind: 'primary',
    }),
    ...overrides.mappings,
  };
  const aiProvider = {
    isAvailable: jest.fn().mockReturnValue(true),
    embedMany: jest.fn().mockResolvedValue([[0.1, 0.2]]),
    getEmbeddingDimension: jest.fn().mockReturnValue(1024),
    ...overrides.aiProvider,
  };
  const env = {
    getAiEmbeddingModel: jest.fn().mockReturnValue('mistral-embed'),
    getAiEmbeddingChunkChars: jest.fn().mockReturnValue(2000),
    getAiEmbeddingChunkOverlap: jest.fn().mockReturnValue(200),
    getAiEmbeddingBatchSize: jest.fn().mockReturnValue(16),
    getPlaneAppUrl: jest.fn().mockReturnValue('http://plane.test'),
    getPlaneWorkspaceSlug: jest.fn().mockReturnValue('conqr'),
    ...overrides.env,
  };
  const chunking = {
    contentHash: jest.fn().mockReturnValue('hash-1'),
    chunk: jest
      .fn()
      .mockReturnValue([{ chunkIndex: 0, chunkText: 'Login fails on Safari Steps to reproduce...' }]),
    ...overrides.chunking,
  };
  const repo = {
    isContentUnchanged: jest.fn().mockResolvedValue(false),
    upsertChunks: jest.fn().mockResolvedValue(undefined),
    deleteBySource: jest.fn().mockResolvedValue(undefined),
    ...overrides.repo,
  };
  const svc = new WorkItemIndexerService(
    plane as any,
    mappings as any,
    aiProvider as any,
    env as any,
    chunking as any,
    repo as any,
  );
  return { svc, plane, mappings, aiProvider, env, chunking, repo };
}

describe('WorkItemIndexerService', () => {
  it('indexes a mapped work item under the mapped space with label names in metadata', async () => {
    const { svc, repo } = makeDeps();

    const res = await svc.indexWorkItem('wi-1', 'proj-1');

    expect(res.status).toBe('indexed');
    expect(repo.upsertChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        spaceId: 'sp-1',
        sourceKind: 'plane_work_item',
        sourceId: 'wi-1',
        chunks: [
          expect.objectContaining({
            metadata: expect.objectContaining({
              workItemId: 'wi-1',
              projectId: 'proj-1',
              title: 'Login fails on Safari',
              sequenceId: 42,
              state: 'Backlog',
              labels: ['bug'],
              url: 'http://plane.test/conqr/projects/proj-1/issues/wi-1',
            }),
          }),
        ],
      }),
    );
  });

  it('returns unmapped (and does not index) when the project has no space mapping', async () => {
    const { svc, repo } = makeDeps({
      mappings: {
        findPrimaryForProjectAnyWorkspace: jest.fn().mockResolvedValue(undefined),
      },
    });
    const res = await svc.indexWorkItem('wi-1', 'proj-1');
    expect(res.status).toBe('unmapped');
    expect(repo.upsertChunks).not.toHaveBeenCalled();
  });

  it('returns ai_unavailable when no embedding provider is configured', async () => {
    const { svc } = makeDeps({
      aiProvider: { isAvailable: jest.fn().mockReturnValue(false) },
    });
    const res = await svc.indexWorkItem('wi-1', 'proj-1');
    expect(res.status).toBe('ai_unavailable');
  });

  it('deletes embeddings and reports deleted when Plane returns 404', async () => {
    const { svc, repo } = makeDeps({
      plane: {
        getWorkItem: jest
          .fn()
          .mockRejectedValue(new PlaneApiError('Not found', 404, false)),
      },
    });
    const res = await svc.indexWorkItem('wi-1', 'proj-1');
    expect(res.status).toBe('deleted');
    expect(repo.deleteBySource).toHaveBeenCalledWith('plane_work_item', 'wi-1');
  });

  it('skips when content hash is unchanged', async () => {
    const { svc, repo } = makeDeps({
      repo: { isContentUnchanged: jest.fn().mockResolvedValue(true) },
    });
    const res = await svc.indexWorkItem('wi-1', 'proj-1');
    expect(res.status).toBe('skipped');
    expect(repo.upsertChunks).not.toHaveBeenCalled();
  });

  it('treats archived work items as deletions', async () => {
    const { svc, repo } = makeDeps({
      plane: {
        getWorkItem: jest.fn().mockResolvedValue({
          id: 'wi-1',
          name: 'Old',
          archived_at: '2026-01-01T00:00:00Z',
          project: 'proj-1',
        }),
      },
    });
    const res = await svc.indexWorkItem('wi-1', 'proj-1');
    expect(res.status).toBe('deleted');
    expect(repo.deleteBySource).toHaveBeenCalledWith('plane_work_item', 'wi-1');
  });

  it('backfills a project across cursor pages, counting failures', async () => {
    const { svc, plane } = makeDeps();
    plane.listWorkItemsPage
      .mockResolvedValueOnce({
        results: [{ id: 'wi-1' }, { id: 'wi-2' }],
        nextCursor: '100:1:0',
      })
      .mockResolvedValueOnce({
        results: [{ id: 'wi-3' }],
        nextCursor: null,
      });
    const indexSpy = jest
      .spyOn(svc, 'indexWorkItem')
      .mockResolvedValueOnce({ workItemId: 'wi-1', status: 'indexed' })
      .mockResolvedValueOnce({ workItemId: 'wi-2', status: 'skipped' })
      .mockRejectedValueOnce(new Error('boom'));

    const res = await svc.backfillProject('proj-1');

    expect(indexSpy).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ indexed: 1, skipped: 1, failed: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- --testPathPattern=work-item-indexer`
Expected: FAIL — cannot find module `./work-item-indexer.service`.

- [ ] **Step 3: Implement the service**

```typescript
// apps/server/src/ee/ai/embeddings/work-item-indexer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  PlaneApiError,
  PlaneClientService,
} from '../../../core/integration/services/plane-client.service';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingRepository } from './embedding.repository';

export interface IndexWorkItemResult {
  workItemId: string;
  status:
    | 'indexed'
    | 'skipped'
    | 'deleted'
    | 'no_content'
    | 'ai_unavailable'
    | 'unmapped';
  chunksIndexed?: number;
}

const LABEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Indexes ConqrPlane work items into the suite semantic store (gap-analysis
 * A1). A work item is scoped to the Hub space its Plane project is mapped to,
 * so pgvector retrieval inherits the caller's space permissions; projects
 * without a mapping are deliberately never indexed.
 */
@Injectable()
export class WorkItemIndexerService {
  private readonly logger = new Logger(WorkItemIndexerService.name);
  /** projectId → { at, byId } — bounds label lookups under Plane's 60/min API limit. */
  private labelCache = new Map<
    string,
    { at: number; byId: Map<string, string> }
  >();

  constructor(
    private readonly plane: PlaneClientService,
    private readonly mappings: ProjectSpaceMappingRepo,
    private readonly aiProvider: AiProviderService,
    private readonly env: EnvironmentService,
    private readonly chunking: ChunkingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async indexWorkItem(
    workItemId: string,
    projectId: string,
  ): Promise<IndexWorkItemResult> {
    if (!this.aiProvider.isAvailable()) {
      return { workItemId, status: 'ai_unavailable' };
    }

    const mapping =
      await this.mappings.findPrimaryForProjectAnyWorkspace(projectId);
    if (!mapping) {
      return { workItemId, status: 'unmapped' };
    }

    let item;
    try {
      item = await this.plane.getWorkItem(projectId, workItemId);
    } catch (err) {
      if (err instanceof PlaneApiError && err.status === 404) {
        await this.repo.deleteBySource('plane_work_item', workItemId);
        return { workItemId, status: 'deleted' };
      }
      throw err;
    }

    if (item.archived_at) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'deleted' };
    }

    const text = [item.name, item.description_stripped]
      .filter(Boolean)
      .join('\n\n');
    if (!text.trim()) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'no_content' };
    }

    const model = this.env.getAiEmbeddingModel() || 'mistral-embed';
    const dim = this.aiProvider.getEmbeddingDimension();
    const contentHash = this.chunking.contentHash(text);

    const unchanged = await this.repo.isContentUnchanged(
      'plane_work_item',
      workItemId,
      model,
      contentHash,
    );
    if (unchanged) {
      return { workItemId, status: 'skipped' };
    }

    const chunks = this.chunking.chunk(text, {
      chunkChars: this.env.getAiEmbeddingChunkChars(),
      overlap: this.env.getAiEmbeddingChunkOverlap(),
    });
    if (chunks.length === 0) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'no_content' };
    }

    const batchSize = this.env.getAiEmbeddingBatchSize();
    const texts = chunks.map((c) => c.chunkText);
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const vectors = await this.aiProvider.embedMany(
        texts.slice(i, i + batchSize),
      );
      allEmbeddings.push(...vectors);
    }

    const labelNames = await this.resolveLabelNames(
      projectId,
      item.labels ?? [],
    );
    const appUrl = this.env.getPlaneAppUrl();
    const slug = this.env.getPlaneWorkspaceSlug();
    const url =
      appUrl && slug
        ? `${appUrl}/${slug}/projects/${projectId}/issues/${workItemId}`
        : null;

    const metadata = {
      workItemId,
      projectId,
      title: item.name ?? null,
      sequenceId: item.sequence_id ?? null,
      state: item.state_detail?.name ?? null,
      labels: labelNames,
      url,
    };

    await this.repo.upsertChunks({
      workspaceId: mapping.workspaceId,
      spaceId: mapping.spaceId,
      sourceKind: 'plane_work_item',
      sourceId: workItemId,
      model,
      dim,
      contentHash,
      chunks: chunks.map((c, i) => ({
        chunkIndex: c.chunkIndex,
        chunkText: c.chunkText,
        embedding: allEmbeddings[i],
        metadata,
      })),
    });

    this.logger.debug(
      `Indexed work item ${workItemId}: ${chunks.length} chunk(s) (model=${model})`,
    );
    return { workItemId, status: 'indexed', chunksIndexed: chunks.length };
  }

  async deleteWorkItemEmbeddings(workItemId: string): Promise<void> {
    await this.repo.deleteBySource('plane_work_item', workItemId);
  }

  /** Sequentially index every work item in a project (admin backfill). */
  async backfillProject(
    projectId: string,
  ): Promise<{ indexed: number; skipped: number; failed: number }> {
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    let cursor: string | undefined;

    do {
      const page = await this.plane.listWorkItemsPage(projectId, {
        perPage: 100,
        cursor,
      });
      for (const item of page.results) {
        try {
          const res = await this.indexWorkItem(item.id, projectId);
          if (res.status === 'indexed') indexed++;
          else skipped++;
        } catch (err) {
          failed++;
          this.logger.warn(
            `Backfill: failed work item ${item.id}: ${(err as Error).message}`,
          );
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return { indexed, skipped, failed };
  }

  private async resolveLabelNames(
    projectId: string,
    labelIds: string[],
  ): Promise<string[]> {
    if (labelIds.length === 0) return [];
    try {
      let cached = this.labelCache.get(projectId);
      if (!cached || Date.now() - cached.at > LABEL_CACHE_TTL_MS) {
        const labels = await this.plane.listLabels(projectId);
        cached = {
          at: Date.now(),
          byId: new Map(labels.map((l) => [l.id, l.name])),
        };
        this.labelCache.set(projectId, cached);
      }
      return labelIds
        .map((id) => cached!.byId.get(id))
        .filter((n): n is string => Boolean(n));
    } catch (err) {
      this.logger.warn(
        `Label lookup failed for project ${projectId}: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
```

- [ ] **Step 4: Wire into EmbeddingsModule**

In `embeddings.module.ts`: add imports at top —

```typescript
import { WorkItemIndexerService } from './work-item-indexer.service';
import { IntegrationModule } from '../../../core/integration/integration.module';
```

Add `IntegrationModule` to the module `imports` array, `WorkItemIndexerService` to `providers`, and `WorkItemIndexerService` to `exports`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern=work-item-indexer`
Expected: 7 tests PASS. Also run `pnpm exec tsc --noEmit` — no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ee/ai/embeddings/work-item-indexer.service.ts apps/server/src/ee/ai/embeddings/work-item-indexer.service.spec.ts apps/server/src/ee/ai/embeddings/embeddings.module.ts
git commit -m "feat(ai): work-item indexer — Plane items into the suite semantic store"
```

---

### Task 5: AI-queue jobs + processor cases

**Files:**
- Modify: `apps/server/src/integrations/queue/constants/queue.constants.ts`
- Modify: `apps/server/src/ee/ai/embeddings/ai-embedding-queue.processor.ts`
- Modify (extend): `apps/server/src/ee/ai/embeddings/ai-embedding-queue.processor.spec.ts`

**Interfaces:**
- Produces (used by Tasks 6 & 7): three job names and their payloads —

```typescript
QueueJob.INDEX_PLANE_WORK_ITEM = 'index-plane-work-item'            // { workItemId, projectId }
QueueJob.DELETE_PLANE_WORK_ITEM_EMBEDDINGS = 'delete-plane-work-item-embeddings' // { workItemId }
QueueJob.BACKFILL_PLANE_WORK_ITEMS = 'backfill-plane-work-items'    // { projectId }
```

- [ ] **Step 1: Add the enum values**

In `queue.constants.ts`, after the `GENERATE_INSIGHT_EMBEDDINGS`/`DELETE_INSIGHT_EMBEDDINGS` pair, add:

```typescript
  INDEX_PLANE_WORK_ITEM = 'index-plane-work-item',
  DELETE_PLANE_WORK_ITEM_EMBEDDINGS = 'delete-plane-work-item-embeddings',
  BACKFILL_PLANE_WORK_ITEMS = 'backfill-plane-work-items',
```

- [ ] **Step 2: Write the failing processor tests**

Open `ai-embedding-queue.processor.spec.ts`, follow its existing construction pattern (mocked services passed to the constructor), and add a mocked `WorkItemIndexerService` as the new constructor argument plus a new `describe` block. If the existing spec builds the processor differently, adapt mechanically — the assertions below are what matter:

```typescript
  describe('plane work item jobs', () => {
    it('INDEX_PLANE_WORK_ITEM delegates to the work-item indexer', async () => {
      await processor.process({
        name: 'index-plane-work-item',
        data: { workItemId: 'wi-1', projectId: 'proj-1' },
      } as any);
      expect(workItemIndexer.indexWorkItem).toHaveBeenCalledWith('wi-1', 'proj-1');
    });

    it('DELETE_PLANE_WORK_ITEM_EMBEDDINGS deletes by source', async () => {
      await processor.process({
        name: 'delete-plane-work-item-embeddings',
        data: { workItemId: 'wi-1' },
      } as any);
      expect(workItemIndexer.deleteWorkItemEmbeddings).toHaveBeenCalledWith('wi-1');
    });

    it('BACKFILL_PLANE_WORK_ITEMS backfills the project', async () => {
      await processor.process({
        name: 'backfill-plane-work-items',
        data: { projectId: 'proj-1' },
      } as any);
      expect(workItemIndexer.backfillProject).toHaveBeenCalledWith('proj-1');
    });
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm run test -- --testPathPattern=ai-embedding-queue`
Expected: FAIL (constructor arity / unhandled job names).

- [ ] **Step 4: Implement processor cases**

In `ai-embedding-queue.processor.ts`:

1. Import and inject the indexer (new last constructor param):

```typescript
import { WorkItemIndexerService } from './work-item-indexer.service';
// constructor(..., private readonly workItemIndexer: WorkItemIndexerService) { super(); }
```

2. Add a payload interface next to the others:

```typescript
interface WorkItemJobPayload {
  workItemId: string;
  projectId: string;
}
```

3. Add cases before `default:`:

```typescript
      case QueueJob.INDEX_PLANE_WORK_ITEM: {
        const { workItemId, projectId } = job.data as WorkItemJobPayload;
        const result = await this.workItemIndexer.indexWorkItem(
          workItemId,
          projectId,
        );
        this.logger.debug(
          `Work item ${workItemId}: ${result.status}` +
            (result.chunksIndexed ? ` (${result.chunksIndexed} chunks)` : ''),
        );
        break;
      }

      case QueueJob.DELETE_PLANE_WORK_ITEM_EMBEDDINGS: {
        const { workItemId } = job.data as Pick<WorkItemJobPayload, 'workItemId'>;
        await this.workItemIndexer.deleteWorkItemEmbeddings(workItemId);
        break;
      }

      case QueueJob.BACKFILL_PLANE_WORK_ITEMS: {
        const { projectId } = job.data as Pick<WorkItemJobPayload, 'projectId'>;
        const res = await this.workItemIndexer.backfillProject(projectId);
        this.logger.log(
          `Work-item backfill for project ${projectId}: ` +
            `${res.indexed} indexed, ${res.skipped} skipped, ${res.failed} failed`,
        );
        break;
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern=ai-embedding-queue`
Expected: PASS (all pre-existing cases + 3 new).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/integrations/queue/constants/queue.constants.ts apps/server/src/ee/ai/embeddings/ai-embedding-queue.processor.ts apps/server/src/ee/ai/embeddings/ai-embedding-queue.processor.spec.ts
git commit -m "feat(ai): AI-queue jobs for plane work-item indexing"
```

---

### Task 6: Webhook → index (core enqueues, licensing-safe)

**Files:**
- Modify: `apps/server/src/core/integration/services/plane-webhook-processor.service.ts`
- Modify: `apps/server/src/core/integration/integration.module.ts` (register the AI queue)
- Modify (extend): `apps/server/src/core/integration/services/plane-webhook-processor.service.spec.ts`

**Interfaces:**
- Consumes: `QueueJob.INDEX_PLANE_WORK_ITEM` / `DELETE_PLANE_WORK_ITEM_EMBEDDINGS` (Task 5).
- Produces: every verified Plane `issue` webhook now keeps the semantic index fresh. **No `ee/` import appears in any `core/` file — only the queue name string enum from `integrations/`.**

- [ ] **Step 1: Extend the existing spec**

The existing spec constructs the service with 3 mocks (`relationships`, `events`, `lifecycle`). Add a 4th mock — `aiQueue = { add: jest.fn() }` — to every construction site, and add:

```typescript
  it('enqueues semantic indexing for issue create/update events', async () => {
    await service.process(
      { event: 'issue', action: 'updated', data: { id: 'wi-1', project: 'proj-1' } },
      'delivery-1',
    );
    expect(aiQueue.add).toHaveBeenCalledWith('index-plane-work-item', {
      workItemId: 'wi-1',
      projectId: 'proj-1',
    });
  });

  it('enqueues embedding deletion for issue deleted events', async () => {
    await service.process(
      { event: 'issue', action: 'deleted', data: { id: 'wi-1', project: 'proj-1' } },
      'delivery-2',
    );
    expect(aiQueue.add).toHaveBeenCalledWith(
      'delete-plane-work-item-embeddings',
      { workItemId: 'wi-1' },
    );
  });

  it('still succeeds when the AI queue is unavailable', async () => {
    aiQueue.add.mockRejectedValueOnce(new Error('redis down'));
    const res = await service.process(
      { event: 'issue', action: 'updated', data: { id: 'wi-1', project: 'proj-1' } },
      'delivery-3',
    );
    expect(res).toBeDefined(); // refresh fan-out must not fail because indexing didn't enqueue
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm run test -- --testPathPattern=plane-webhook-processor`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `plane-webhook-processor.service.ts`:

1. Imports + constructor:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
// constructor gains:
//   @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
```

2. Inside `process()`, in the `issue` branch — after computing `subject` and before the `return` — add:

```typescript
    // Keep the suite semantic index fresh (gap-analysis A1). Enqueue-only:
    // the EE worker decides whether AI is available / the project is mapped.
    // Failure to enqueue must never break refresh fan-out.
    try {
      if (isDelete) {
        await this.aiQueue.add(QueueJob.DELETE_PLANE_WORK_ITEM_EMBEDDINGS, {
          workItemId: String(payload.data.id),
        });
      } else {
        await this.aiQueue.add(QueueJob.INDEX_PLANE_WORK_ITEM, {
          workItemId: String(payload.data.id),
          projectId: String(payload.data.project ?? ''),
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue semantic indexing for ${subject}: ${(err as Error).message}`,
      );
    }
```

Note: `isDelete` is declared after the relationships lookup in the current code — move `const isDelete = payload.action === 'deleted';` up so it's declared right after `const subject = ...`, before this block and before the existing loop that uses it.

3. In `integration.module.ts`, add:

```typescript
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
// imports: [CaslModule, SearchModule, PageModule, BullModule.registerQueue({ name: QueueName.AI_QUEUE })],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern=plane-webhook-processor`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/core/integration/services/plane-webhook-processor.service.ts apps/server/src/core/integration/services/plane-webhook-processor.service.spec.ts apps/server/src/core/integration/integration.module.ts
git commit -m "feat(integration): plane webhooks feed the suite semantic index"
```

---

### Task 7: EE Work-Intel endpoints (similar + predict-labels + backfill)

**Files:**
- Create: `apps/server/src/ee/ai/work-intel/work-intel.service.ts`
- Create: `apps/server/src/ee/ai/work-intel/dto/work-intel.dto.ts`
- Create: `apps/server/src/ee/ai/work-intel/work-intel.controller.ts`
- Create: `apps/server/src/ee/ai/work-intel/work-intel.module.ts`
- Test (create): `apps/server/src/ee/ai/work-intel/work-intel.service.spec.ts`
- Modify: `apps/server/src/ee/ai/ai.module.ts` — add `WorkIntelModule` to its `imports` (and `exports` if the module exports its imports; follow the file's existing style)

**Interfaces:**
- Consumes: `EmbeddingRepository.similaritySearch` (`sourceKind: 'plane_work_item'`), `AiProviderService.isAvailable()/embedMany()`, chunk metadata shape from Task 4, `QueueJob.BACKFILL_PLANE_WORK_ITEMS` (Task 5), `ProjectSpaceMappingRepo.listForWorkspace` (existing).
- Produces — **the contract the ConqrPlane web seam (fork ledger F9, Plan 2) will call**:

```
POST /api/ai/work-items/similar         { title, description?, limit? }        → { items: SimilarWorkItem[] }
POST /api/ai/work-items/predict-labels  { title, description?, limit? }        → { labels: { label, confidence }[] }
POST /api/ai/work-items/backfill        { projectId? }                          → { enqueued: number }
```

```typescript
export interface SimilarWorkItem {
  workItemId: string;
  projectId: string | null;
  title: string | null;
  sequenceId: number | null;
  state: string | null;
  labels: string[];
  url: string | null;
  score: number;
}
```

- [ ] **Step 1: Write the failing service tests**

```typescript
// apps/server/src/ee/ai/work-intel/work-intel.service.spec.ts
import { WorkIntelService } from './work-intel.service';

function chunk(
  sourceId: string,
  score: number,
  meta: Partial<Record<string, unknown>> = {},
) {
  return {
    sourceKind: 'plane_work_item' as const,
    sourceId,
    chunkIndex: 0,
    chunkText: 'text',
    score,
    metadata: {
      workItemId: sourceId,
      projectId: 'proj-1',
      title: `Item ${sourceId}`,
      sequenceId: 1,
      state: 'Backlog',
      labels: ['bug'],
      url: `http://plane.test/conqr/projects/proj-1/issues/${sourceId}`,
      ...meta,
    },
  };
}

function makeSvc(results: any[], overrides: Partial<Record<string, any>> = {}) {
  const aiProvider = {
    isAvailable: jest.fn().mockReturnValue(true),
    embedMany: jest.fn().mockResolvedValue([[0.1, 0.2]]),
    ...overrides.aiProvider,
  };
  const repo = {
    similaritySearch: jest.fn().mockResolvedValue(results),
    ...overrides.repo,
  };
  const svc = new WorkIntelService(aiProvider as any, repo as any);
  return { svc, aiProvider, repo };
}

describe('WorkIntelService', () => {
  it('groups chunks by work item, keeping the best score, capped at limit', async () => {
    const { svc } = makeSvc([
      chunk('a', 0.9),
      chunk('a', 0.7),
      chunk('b', 0.8),
      chunk('c', 0.5),
    ]);
    const items = await svc.findSimilar({
      workspaceId: 'ws-1',
      title: 'Login broken',
      limit: 2,
    });
    expect(items.map((i) => i.workItemId)).toEqual(['a', 'b']);
    expect(items[0].score).toBe(0.9);
    expect(items[0].url).toContain('/issues/a');
  });

  it('returns [] when the AI provider is unavailable', async () => {
    const { svc, repo } = makeSvc([], {
      aiProvider: { isAvailable: jest.fn().mockReturnValue(false) },
    });
    const items = await svc.findSimilar({ workspaceId: 'ws-1', title: 'x' });
    expect(items).toEqual([]);
    expect(repo.similaritySearch).not.toHaveBeenCalled();
  });

  it('searches only plane_work_item chunks in the caller workspace', async () => {
    const { svc, repo } = makeSvc([]);
    await svc.findSimilar({ workspaceId: 'ws-1', title: 'x', limit: 5 });
    expect(repo.similaritySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        sourceKind: 'plane_work_item',
        topK: 20, // limit * OVERSAMPLE(4)
      }),
    );
  });

  it('predicts labels weighted by similarity, normalized to confidences', async () => {
    const { svc } = makeSvc([
      chunk('a', 0.9, { labels: ['bug'] }),
      chunk('b', 0.6, { labels: ['bug', 'ui'] }),
      chunk('c', 0.5, { labels: ['story'] }),
    ]);
    const { labels } = await svc.predictLabels({
      workspaceId: 'ws-1',
      title: 'Login broken',
    });
    expect(labels[0].label).toBe('bug'); // 0.9 + 0.6 dominates
    const total = labels.reduce((s, l) => s + l.confidence, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(labels.map((l) => l.label)).toContain('story');
  });

  it('combines title and description into one query embedding', async () => {
    const { svc, aiProvider } = makeSvc([]);
    await svc.findSimilar({
      workspaceId: 'ws-1',
      title: 'Title',
      description: 'Desc',
    });
    expect(aiProvider.embedMany).toHaveBeenCalledWith(['Title\n\nDesc']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm run test -- --testPathPattern=work-intel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement service, DTOs, controller, module**

```typescript
// apps/server/src/ee/ai/work-intel/work-intel.service.ts
import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../providers/ai-provider.service';
import { EmbeddingRepository } from '../embeddings/embedding.repository';

export interface SimilarWorkItem {
  workItemId: string;
  projectId: string | null;
  title: string | null;
  sequenceId: number | null;
  state: string | null;
  labels: string[];
  url: string | null;
  score: number;
}

const OVERSAMPLE = 4; // chunks-per-item headroom before grouping
const DEFAULT_LIMIT = 5;

/**
 * Semantic work-item intelligence (gap-analysis A2): duplicate detection and
 * label prediction over the plane_work_item embedding space. Consumed by
 * ConqrPlane's create-work-item and intake surfaces.
 */
@Injectable()
export class WorkIntelService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async findSimilar(opts: {
    workspaceId: string;
    title: string;
    description?: string;
    limit?: number;
  }): Promise<SimilarWorkItem[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const raw = await this.retrieve(opts, limit);

    const byItem = new Map<string, SimilarWorkItem>();
    for (const r of raw) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const existing = byItem.get(r.sourceId);
      if (existing && existing.score >= r.score) continue;
      byItem.set(r.sourceId, {
        workItemId: r.sourceId,
        projectId: (meta.projectId as string) ?? null,
        title: (meta.title as string) ?? null,
        sequenceId: (meta.sequenceId as number) ?? null,
        state: (meta.state as string) ?? null,
        labels: (meta.labels as string[]) ?? [],
        url: (meta.url as string) ?? null,
        score: r.score,
      });
    }

    return Array.from(byItem.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async predictLabels(opts: {
    workspaceId: string;
    title: string;
    description?: string;
    limit?: number;
  }): Promise<{ labels: { label: string; confidence: number }[] }> {
    const raw = await this.retrieve(opts, opts.limit ?? DEFAULT_LIMIT);

    // Weight each label by the best chunk score per work item that carries it.
    const bestPerItem = new Map<string, { score: number; labels: string[] }>();
    for (const r of raw) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const labels = (meta.labels as string[]) ?? [];
      const existing = bestPerItem.get(r.sourceId);
      if (!existing || r.score > existing.score) {
        bestPerItem.set(r.sourceId, { score: r.score, labels });
      }
    }

    const weights = new Map<string, number>();
    let total = 0;
    for (const { score, labels } of bestPerItem.values()) {
      for (const label of labels) {
        weights.set(label, (weights.get(label) ?? 0) + score);
        total += score;
      }
    }
    if (total === 0) return { labels: [] };

    const labels = Array.from(weights.entries())
      .map(([label, w]) => ({ label, confidence: w / total }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return { labels };
  }

  private async retrieve(
    opts: { workspaceId: string; title: string; description?: string },
    limit: number,
  ) {
    if (!this.aiProvider.isAvailable()) return [];
    const query = [opts.title, opts.description].filter(Boolean).join('\n\n');
    if (!query.trim()) return [];
    const [embedding] = await this.aiProvider.embedMany([query]);
    return this.repo.similaritySearch({
      workspaceId: opts.workspaceId,
      queryEmbedding: embedding,
      sourceKind: 'plane_work_item',
      topK: limit * OVERSAMPLE,
    });
  }
}
```

```typescript
// apps/server/src/ee/ai/work-intel/dto/work-intel.dto.ts
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class WorkIntelQueryDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class WorkIntelBackfillDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
```

```typescript
// apps/server/src/ee/ai/work-intel/work-intel.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { WorkIntelService, SimilarWorkItem } from './work-intel.service';
import { WorkIntelBackfillDto, WorkIntelQueryDto } from './dto/work-intel.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai/work-items')
export class WorkIntelController {
  constructor(
    private readonly workIntel: WorkIntelService,
    private readonly mappings: ProjectSpaceMappingRepo,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('similar')
  async similar(
    @Body() dto: WorkIntelQueryDto,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ items: SimilarWorkItem[] }> {
    const items = await this.workIntel.findSimilar({
      workspaceId: workspace.id,
      title: dto.title,
      description: dto.description,
      limit: dto.limit,
    });
    return { items };
  }

  @HttpCode(HttpStatus.OK)
  @Post('predict-labels')
  async predictLabels(
    @Body() dto: WorkIntelQueryDto,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ labels: { label: string; confidence: number }[] }> {
    return this.workIntel.predictLabels({
      workspaceId: workspace.id,
      title: dto.title,
      description: dto.description,
      limit: dto.limit,
    });
  }

  /** Enqueue a semantic backfill for one mapped project, or all of them. */
  @HttpCode(HttpStatus.OK)
  @Post('backfill')
  async backfill(
    @Body() dto: WorkIntelBackfillDto,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ enqueued: number }> {
    let projectIds: string[];
    if (dto.projectId) {
      projectIds = [dto.projectId];
    } else {
      const mapped = await this.mappings.listForWorkspace(workspace.id);
      projectIds = Array.from(new Set(mapped.map((m) => m.planeProjectId)));
    }
    for (const projectId of projectIds) {
      await this.aiQueue.add(QueueJob.BACKFILL_PLANE_WORK_ITEMS, { projectId });
    }
    return { enqueued: projectIds.length };
  }
}
```

Note: `listForWorkspace(workspaceId, limit = 50, ...)` — the existing signature's default limit is fine here.

```typescript
// apps/server/src/ee/ai/work-intel/work-intel.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../../../integrations/queue/constants';
import { AiProviderModule } from '../providers/ai-provider.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { WorkIntelService } from './work-intel.service';
import { WorkIntelController } from './work-intel.controller';

@Module({
  imports: [
    AiProviderModule,
    EmbeddingsModule,
    BullModule.registerQueue({ name: QueueName.AI_QUEUE }),
  ],
  controllers: [WorkIntelController],
  providers: [WorkIntelService],
  exports: [WorkIntelService],
})
export class WorkIntelModule {}
```

Then open `apps/server/src/ee/ai/ai.module.ts` and add `WorkIntelModule` to its `imports` array (import from `./work-intel/work-intel.module`), matching the file's existing style. `ProjectSpaceMappingRepo` is provided globally by the DatabaseModule (same as other repos injected across modules) — no extra provider needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern=work-intel`
Expected: 5 tests PASS. Then `pnpm exec tsc --noEmit` — no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ee/ai/work-intel/ apps/server/src/ee/ai/ai.module.ts
git commit -m "feat(ai): work-intel endpoints — semantic duplicate detection + label prediction"
```

---

### Task 8: Full verification + docs note

**Files:**
- Create: `docs/integration/work-item-intelligence.md` (short reference)
- No source changes — this task is the gate.

- [ ] **Step 1: Run the whole server test suite**

Run (from `apps/server`): `pnpm run test`
Expected: **all suites green** (previously ~19 suites; now +3 new/extended). Any failure in untouched suites must be investigated before proceeding — do not skip.

- [ ] **Step 2: Typecheck server**

Run: `pnpm exec tsc --noEmit` (from `apps/server`)
Expected: clean.

- [ ] **Step 3: Write the reference doc**

```markdown
<!-- docs/integration/work-item-intelligence.md -->
# Work-item semantic intelligence (A1 + A2)

ConqrPlane work items are indexed into the suite semantic store
(`ai_embeddings`, source kind `plane_work_item`) and power duplicate
detection + label prediction.

## Data flow
1. Plane webhook (`issue` created/updated/deleted) → `PlaneWebhookProcessorService`
   → BullMQ `AI_QUEUE` job (`index-plane-work-item` / `delete-plane-work-item-embeddings`).
2. EE `AiEmbeddingQueueProcessor` → `WorkItemIndexerService`: fetches the fresh
   item from the Plane REST API, chunks + embeds, and upserts under the Hub
   space its project is mapped to (**unmapped projects are never indexed**).
   Archived/404 items delete their embeddings.
3. Backfill: `POST /api/ai/work-items/backfill { projectId? }` enqueues
   `backfill-plane-work-items` per mapped project (cursor-paginated).

## Endpoints (JWT, workspace-scoped)
- `POST /api/ai/work-items/similar` `{ title, description?, limit? (1–10) }`
  → `{ items: [{ workItemId, projectId, title, sequenceId, state, labels, url, score }] }`
- `POST /api/ai/work-items/predict-labels` same body
  → `{ labels: [{ label, confidence }] }` (confidences sum ≤ 1)
- Both return empty results when no AI provider is configured — callers
  (e.g. ConqrPlane's create modal, fork ledger F9) must degrade silently.

## Licensing boundary
`core/` never imports `ee/`. The webhook processor only enqueues queue jobs;
all embedding/AI code lives in `ee/ai/`.
```

- [ ] **Step 4: Live smoke (best-effort, environment-dependent)**

If the local stack is up (Hub on :5173/:3000, Plane containers, AI provider configured in `.env`): create/update a work item in a mapped Plane project, watch server logs for `Indexed work item`, then `curl -X POST http://localhost:3000/api/ai/work-items/similar` with a session cookie and a matching title.
If AI keys or the stack are absent, record "live smoke deferred — no AI provider configured locally" in the final report instead of faking it.

- [ ] **Step 5: Commit**

```bash
git add docs/integration/work-item-intelligence.md
git commit -m "docs: work-item semantic intelligence reference (A1+A2)"
```

---

## Self-review notes

- **Spec coverage:** A1 = Tasks 1–6 + backfill (7); A2 = Task 7 (endpoints; the Plane-side UI seam is deliberately Plan 2 / fork ledger F9 to avoid colliding with in-flight fork work). Federated keyword search stays untouched (core cannot depend on EE); RAG safely ignores the new kind (it filters on `page`/`expert_insight` explicitly).
- **Type consistency:** `IndexWorkItemResult.status` union matches processor logging; metadata keys (`workItemId/projectId/title/sequenceId/state/labels/url`) are identical in Task 4 (writer) and Task 7 (reader); queue payloads `{workItemId, projectId}` match producer (Task 6) and consumer (Task 5).
- **Known judgment calls:** one embedding row-set per work item (unique index), scoped to the *primary* mapping; label names frozen into metadata at index time (re-index refreshes them); webhook enqueue failures are logged, never fatal.
