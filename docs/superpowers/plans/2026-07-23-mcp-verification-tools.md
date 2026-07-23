# MCP Verification Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose ConqrHub's page-verification lifecycle over MCP so an authorized client can see verification state and make pages retrievable by `rag_retrieve`/Ask HR.

**Architecture:** Six new `ChatTool` injectables (self-registering via `onModuleInit`), thin adapters over the existing `PageVerificationService`, surfaced automatically by the MCP layer. Plus a `listUnverifiedPages` query on the service, a `verify-space` MCP prompt, a `verification` guide section, and model guidance in `SERVER_INSTRUCTIONS`.

**Tech Stack:** NestJS, Kysely, zod, Jest, the AI SDK `ChatToolRegistry` pattern.

## Global Constraints

- All new tools live in `apps/server/src/ee/ai/chat/tools/` and follow the existing `ChatTool` pattern: `@Injectable`, `implements ChatTool, OnModuleInit`, `readonly name/description/parameters (zod)`, `onModuleInit() { this.registry.register(this); }`, `execute(args, ctx)`.
- `ChatToolContext` provides only `{ user, workspaceId }`. Where the verification service needs a `Workspace`, pass `{ id: ctx.workspaceId } as any` (same as `create-space.tool.ts` — `WorkspaceAbilityFactory.createForUser` reads only `user.role`).
- Resolve a page ref (UUID or slugId) with `pageService.findById(args.pageId, true)`; reject if `!page || page.workspaceId !== ctx.workspaceId`. Pass the resolved **`page.id`** (real UUID) to `PageVerificationService`.
- Verification `type` is only `'expiring'` or `'qms'` (no `'standard'`). `createVerification` requires 1–5 `verifierIds`; default to `[ctx.user.id]` when the client omits them. `mode: 'indefinite'` ⇒ `expiresAt = null` ⇒ permanent (the knowledge-base default).
- Let service exceptions (`ForbiddenException`, `BadRequestException`, `NotFoundException`) propagate unchanged — the registry/MCP layer surfaces their messages.
- Run server unit tests from `apps/server`: `pnpm run test <path>`. Build check: `pnpm run build` (nest build).
- Deploy: commit on `feat/meeting-intelligence-foundation`, push, fast-forward `main` (`git push origin feat/meeting-intelligence-foundation:main`); Railway auto-deploys ConqrHub.

---

### Task 1: Wire PageVerificationModule into AiChatModule + add `listUnverifiedPages` service method

**Files:**
- Modify: `apps/server/src/ee/ai/chat/ai-chat.module.ts` (add import of `PageVerificationModule` to `imports`)
- Modify: `apps/server/src/ee/page-verification/page-verification.service.ts` (add `listUnverifiedPages`)
- Test: `apps/server/src/ee/page-verification/page-verification.service.spec.ts` (create — focused test for the new method only)

**Interfaces:**
- Produces: `PageVerificationService.listUnverifiedPages(workspaceId: string, spaceIds: string[] | undefined, limit: number): Promise<Array<{ id: string; title: string | null; spaceId: string; status: string }>>` — pages with no *effectively-valid* verification. `spaceIds === []` returns `[]` without a DB call. `status` is `'none'` when there is no verification row, else the raw row status.
- Consumes (Task 2–5): `PageVerificationService` injected into tools (available once `PageVerificationModule` is imported and exports it — it already does).

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ee/page-verification/page-verification.service.spec.ts`:

```typescript
import { PageVerificationService } from './page-verification.service';

/** Minimal chainable Kysely stub: every builder method returns `this`;
 *  `execute()` resolves to the queued rows. */
function fakeDb(rows: any[]) {
  const qb: any = {};
  for (const m of [
    'selectFrom', 'leftJoin', 'select', 'where', 'limit', 'orderBy', '$if',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.execute = jest.fn(async () => rows);
  return { qb, db: { selectFrom: () => qb } as any };
}

function makeService(db: any): PageVerificationService {
  // Only `db` is exercised by listUnverifiedPages; other deps are unused here.
  return new PageVerificationService(
    db, undefined as any, undefined as any, undefined as any,
    undefined as any, undefined as any,
  );
}

describe('PageVerificationService.listUnverifiedPages', () => {
  it('short-circuits to [] when spaceIds is an empty array (no DB call)', async () => {
    const { db } = fakeDb([]);
    const svc = makeService(db);
    const spy = jest.spyOn(db, 'selectFrom');
    const result = await svc.listUnverifiedPages('ws1', [], 50);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps rows, defaulting a null verification status to "none"', async () => {
    const { db } = fakeDb([
      { id: 'p1', title: 'A', spaceId: 's1', verificationStatus: null },
      { id: 'p2', title: 'B', spaceId: 's1', verificationStatus: 'draft' },
    ]);
    const svc = makeService(db);
    const result = await svc.listUnverifiedPages('ws1', ['s1'], 50);
    expect(result).toEqual([
      { id: 'p1', title: 'A', spaceId: 's1', status: 'none' },
      { id: 'p2', title: 'B', spaceId: 's1', status: 'draft' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/page-verification/page-verification.service.spec.ts`
Expected: FAIL — `listUnverifiedPages is not a function`.

- [ ] **Step 3: Add the method**

In `page-verification.service.ts`, add this public method (place it just after `listVerifications`):

```typescript
/**
 * Pages that are NOT effectively verified — i.e. invisible to RAG /
 * rag_retrieve / Ask HR. A page counts as verified only when its
 * verification row has status 'verified' or 'expiring' AND has no past
 * expiry (mirrors isEffectivelyVerified in embedding-indexer.service.ts).
 * Scoped to the caller's accessible spaces; spaceIds === [] => [].
 */
async listUnverifiedPages(
  workspaceId: string,
  spaceIds: string[] | undefined,
  limit: number,
): Promise<
  Array<{ id: string; title: string | null; spaceId: string; status: string }>
> {
  if (spaceIds && spaceIds.length === 0) return [];

  const now = new Date();
  const rows = await (this.db as any)
    .selectFrom('pages as p')
    .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
    .select([
      'p.id as id',
      'p.title as title',
      'p.spaceId as spaceId',
      'pv.status as verificationStatus',
    ])
    .where('p.workspaceId', '=', workspaceId)
    .where('p.deletedAt', 'is', null)
    .$if(!!spaceIds, (qb: any) => qb.where('p.spaceId', 'in', spaceIds))
    .where((eb: any) =>
      eb.or([
        eb('pv.status', 'is', null),
        eb('pv.status', 'not in', ['verified', 'expiring']),
        eb.and([
          eb('pv.expiresAt', 'is not', null),
          eb('pv.expiresAt', '<=', now),
        ]),
      ]),
    )
    .orderBy('p.updatedAt', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title ?? null,
    spaceId: r.spaceId,
    status: r.verificationStatus ?? 'none',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm run test src/ee/page-verification/page-verification.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Import PageVerificationModule into AiChatModule**

In `ai-chat.module.ts`, add the import near the other module imports (after line 11):

```typescript
import { PageVerificationModule } from '../../page-verification/page-verification.module';
```

and add `PageVerificationModule` to the `imports:` array (after `IntegrationModule,`).

- [ ] **Step 6: Build to verify wiring compiles**

Run: `cd apps/server && pnpm run build`
Expected: builds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/ee/page-verification/page-verification.service.ts \
        apps/server/src/ee/page-verification/page-verification.service.spec.ts \
        apps/server/src/ee/ai/chat/ai-chat.module.ts
git commit -m "feat(mcp): listUnverifiedPages service query + wire PageVerificationModule into AiChatModule"
```

---

### Task 2: `get_verification_status` tool

**Files:**
- Create: `apps/server/src/ee/ai/chat/tools/get-verification-status.tool.ts`
- Test: `apps/server/src/ee/ai/chat/tools/get-verification-status.tool.spec.ts`
- Modify: `ai-chat.module.ts` (register provider)

**Interfaces:**
- Consumes: `PageService.findById`, `PageVerificationService.getVerificationInfo(dto, user)`, `ChatToolRegistry`.
- Produces: tool `get_verification_status` returning `{ pageId, status, inRag, permissions }`. `inRag` is `true` iff `status` is `'verified'` or `'expiring'`.

- [ ] **Step 1: Write the failing test**

Create `get-verification-status.tool.spec.ts`:

```typescript
import { GetVerificationStatusTool } from './get-verification-status.tool';

describe('GetVerificationStatusTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function make(info: any) {
    const pageService = { findById: jest.fn(async () => page) } as any;
    const verification = { getVerificationInfo: jest.fn(async () => info) } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new GetVerificationStatusTool(pageService, verification, registry),
      pageService, verification,
    };
  }

  it('reports inRag=true for a verified page and resolves the page ref', async () => {
    const { tool, pageService, verification } = make({
      status: 'verified', permissions: { canManage: true },
    });
    const res: any = await tool.execute({ pageId: 'slug123' }, ctx);
    expect(pageService.findById).toHaveBeenCalledWith('slug123', true);
    expect(verification.getVerificationInfo).toHaveBeenCalledWith(
      { pageId: 'real-uuid' }, ctx.user,
    );
    expect(res).toEqual({
      pageId: 'real-uuid', status: 'verified', inRag: true,
      permissions: { canManage: true },
    });
  });

  it('reports inRag=false for an unverified page', async () => {
    const { tool } = make({ status: 'none', permissions: {} });
    const res: any = await tool.execute({ pageId: 'p' }, ctx);
    expect(res.inRag).toBe(false);
    expect(res.status).toBe('none');
  });

  it('throws when the page is not in the workspace', async () => {
    const { tool, pageService } = make({ status: 'none' });
    pageService.findById.mockResolvedValueOnce({ ...page, workspaceId: 'other' });
    await expect(tool.execute({ pageId: 'p' }, ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/get-verification-status.tool.spec.ts`
Expected: FAIL — cannot find module `./get-verification-status.tool`.

- [ ] **Step 3: Implement the tool**

Create `get-verification-status.tool.ts`:

```typescript
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

const RETRIEVABLE = new Set(['verified', 'expiring']);

@Injectable()
export class GetVerificationStatusTool implements ChatTool, OnModuleInit {
  readonly name = 'get_verification_status';
  readonly description =
    'Get a page\'s verification status and whether it is currently in the knowledge base (retrievable by rag_retrieve / Ask HR). A page is retrievable ONLY when verified. Accepts the page UUID or short slugId.';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{
    pageId: string;
    status: string;
    inRag: boolean;
    permissions: unknown;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass the page UUID or short slugId.`,
      );
    }
    const info: any = await this.verification.getVerificationInfo(
      { pageId: page.id }, ctx.user,
    );
    return {
      pageId: page.id,
      status: info.status,
      inRag: RETRIEVABLE.has(info.status),
      permissions: info.permissions,
    };
  }
}
```

- [ ] **Step 4: Register the provider**

In `ai-chat.module.ts`, add the import:

```typescript
import { GetVerificationStatusTool } from './tools/get-verification-status.tool';
```

and add `GetVerificationStatusTool,` to the `providers:` array (start a `// Verification tools` group before `// Self-documenting guide tool`).

- [ ] **Step 5: Run test + build**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/get-verification-status.tool.spec.ts && pnpm run build`
Expected: PASS (3 tests), build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ee/ai/chat/tools/get-verification-status.tool.ts \
        apps/server/src/ee/ai/chat/tools/get-verification-status.tool.spec.ts \
        apps/server/src/ee/ai/chat/ai-chat.module.ts
git commit -m "feat(mcp): get_verification_status tool"
```

---

### Task 3: `list_unverified_pages` tool

**Files:**
- Create: `apps/server/src/ee/ai/chat/tools/list-unverified-pages.tool.ts`
- Test: `apps/server/src/ee/ai/chat/tools/list-unverified-pages.tool.spec.ts`
- Modify: `ai-chat.module.ts`

**Interfaces:**
- Consumes: `PageVerificationService.listUnverifiedPages` (Task 1), `SpaceMemberRepo.getUserSpaceIds`, `SpaceAbilityFactory`, `ChatToolRegistry`.
- Produces: tool `list_unverified_pages` returning `{ pages: Array<{ id; title; spaceId; status }>; count }`.

- [ ] **Step 1: Write the failing test**

Create `list-unverified-pages.tool.spec.ts`:

```typescript
import { ListUnverifiedPagesTool } from './list-unverified-pages.tool';

describe('ListUnverifiedPagesTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };

  function make(pages: any[], userSpaceIds = ['s1', 's2']) {
    const verification = { listUnverifiedPages: jest.fn(async () => pages) } as any;
    const spaceMemberRepo = { getUserSpaceIds: jest.fn(async () => userSpaceIds) } as any;
    const spaceAbility = {
      createForUser: jest.fn(async () => ({ cannot: () => false })),
    } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new ListUnverifiedPagesTool(
        verification, spaceMemberRepo, spaceAbility, registry,
      ),
      verification, spaceMemberRepo,
    };
  }

  it('lists unverified pages scoped to the user\'s spaces', async () => {
    const { tool, verification } = make([
      { id: 'p1', title: 'A', spaceId: 's1', status: 'none' },
    ]);
    const res: any = await tool.execute({}, ctx);
    expect(verification.listUnverifiedPages).toHaveBeenCalledWith('ws1', ['s1', 's2'], 50);
    expect(res).toEqual({
      pages: [{ id: 'p1', title: 'A', spaceId: 's1', status: 'none' }],
      count: 1,
    });
  });

  it('scopes to a single space when spaceId is given', async () => {
    const { tool, verification } = make([]);
    await tool.execute({ spaceId: 's1' }, ctx);
    expect(verification.listUnverifiedPages).toHaveBeenCalledWith('ws1', ['s1'], 50);
  });

  it('returns empty when the user has no accessible spaces', async () => {
    const { tool, verification } = make([], []);
    const res: any = await tool.execute({}, ctx);
    expect(res).toEqual({ pages: [], count: 0 });
    expect(verification.listUnverifiedPages).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/list-unverified-pages.tool.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the tool**

Create `list-unverified-pages.tool.ts`:

```typescript
import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListUnverifiedPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_unverified_pages';
  readonly description =
    'List pages that are NOT verified and therefore invisible to rag_retrieve / Ask HR. Use this to find what needs verifying before it can be retrieved. Optionally scope to one space.';
  readonly parameters = z.object({
    spaceId: z.string().optional().describe('Optional space ID to scope to.'),
    limit: z.number().int().min(1).max(200).optional()
      .describe('Max pages to return (default 50).'),
  });

  constructor(
    private readonly verification: PageVerificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { spaceId?: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{
    pages: Array<{ id: string; title: string | null; spaceId: string; status: string }>;
    count: number;
  }> {
    const limit = args.limit ?? 50;

    let spaceIds: string[];
    if (args.spaceId) {
      let ability;
      try {
        ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
      } catch {
        throw new ForbiddenException(
          `You do not have access to space ${args.spaceId}`,
        );
      }
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException(
          `You do not have access to space ${args.spaceId}`,
        );
      }
      spaceIds = [args.spaceId];
    } else {
      spaceIds = await this.spaceMemberRepo.getUserSpaceIds(ctx.user.id);
      if (spaceIds.length === 0) return { pages: [], count: 0 };
    }

    const pages = await this.verification.listUnverifiedPages(
      ctx.workspaceId, spaceIds, limit,
    );
    return { pages, count: pages.length };
  }
}
```

- [ ] **Step 4: Register the provider**

In `ai-chat.module.ts`, add import `import { ListUnverifiedPagesTool } from './tools/list-unverified-pages.tool';` and add `ListUnverifiedPagesTool,` to the Verification tools group in `providers:`.

- [ ] **Step 5: Run test + build**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/list-unverified-pages.tool.spec.ts && pnpm run build`
Expected: PASS (3 tests), build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ee/ai/chat/tools/list-unverified-pages.tool.ts \
        apps/server/src/ee/ai/chat/tools/list-unverified-pages.tool.spec.ts \
        apps/server/src/ee/ai/chat/ai-chat.module.ts
git commit -m "feat(mcp): list_unverified_pages tool"
```

---

### Task 4: `verify_page` tool (auto-create + verify)

**Files:**
- Create: `apps/server/src/ee/ai/chat/tools/verify-page.tool.ts`
- Test: `apps/server/src/ee/ai/chat/tools/verify-page.tool.spec.ts`
- Modify: `ai-chat.module.ts`

**Interfaces:**
- Consumes: `PageService.findById`, `PageVerificationService.getVerificationInfo` / `.createVerification` / `.verifyPage`, `ChatToolRegistry`.
- Produces: tool `verify_page` returning `{ pageId, status: 'verified', created: boolean, note: string }`.

Behaviour: resolve page → `getVerificationInfo`; if `status === 'none'`, `createVerification` with type `expiring`, `mode` = `indefinite` (or `period`/`day` when `expiresInDays` given) and `verifierIds: [ctx.user.id]` (`created = true`); then `verifyPage`. `note` states embeddings are enqueued and retrieval is eventual.

- [ ] **Step 1: Write the failing test**

Create `verify-page.tool.spec.ts`:

```typescript
import { VerifyPageTool } from './verify-page.tool';

describe('VerifyPageTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function make(status: string) {
    const pageService = { findById: jest.fn(async () => page) } as any;
    const verification = {
      getVerificationInfo: jest.fn(async () => ({ status })),
      createVerification: jest.fn(async () => {}),
      verifyPage: jest.fn(async () => {}),
    } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new VerifyPageTool(pageService, verification, registry),
      verification,
    };
  }

  it('auto-creates a permanent expiring verification then verifies when none exists', async () => {
    const { tool, verification } = make('none');
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(verification.createVerification).toHaveBeenCalledWith(
      { pageId: 'real-uuid', type: 'expiring', mode: 'indefinite', verifierIds: ['u1'] },
      ctx.user, { id: 'ws1' },
    );
    expect(verification.verifyPage).toHaveBeenCalledWith('real-uuid', ctx.user, { id: 'ws1' });
    expect(res.status).toBe('verified');
    expect(res.created).toBe(true);
  });

  it('does NOT create when a verification already exists, just verifies', async () => {
    const { tool, verification } = make('draft');
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(verification.createVerification).not.toHaveBeenCalled();
    expect(verification.verifyPage).toHaveBeenCalledWith('real-uuid', ctx.user, { id: 'ws1' });
    expect(res.created).toBe(false);
  });

  it('uses a period expiry when expiresInDays is given', async () => {
    const { tool, verification } = make('none');
    await tool.execute({ pageId: 'slug', expiresInDays: 30 }, ctx);
    expect(verification.createVerification).toHaveBeenCalledWith(
      {
        pageId: 'real-uuid', type: 'expiring', mode: 'period',
        periodAmount: 30, periodUnit: 'day', verifierIds: ['u1'],
      },
      ctx.user, { id: 'ws1' },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/verify-page.tool.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the tool**

Create `verify-page.tool.ts`:

```typescript
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class VerifyPageTool implements ChatTool, OnModuleInit {
  readonly name = 'verify_page';
  readonly description =
    'Verify a page so it enters the knowledge base and becomes retrievable by rag_retrieve / Ask HR. If the page has no verification yet, one is created automatically (you become its verifier). Requires space-manage permission. Retrieval is available seconds after verifying (embeddings are generated asynchronously).';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
    expiresInDays: z.number().int().min(1).optional()
      .describe('Optional: verification expires after N days (default: never).'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string; expiresInDays?: number },
    ctx: ChatToolContext,
  ): Promise<{ pageId: string; status: string; created: boolean; note: string }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass the page UUID or short slugId.`,
      );
    }
    const workspace = { id: ctx.workspaceId } as any;

    const info: any = await this.verification.getVerificationInfo(
      { pageId: page.id }, ctx.user,
    );

    let created = false;
    if (info.status === 'none') {
      const dto: any = {
        pageId: page.id,
        type: 'expiring',
        verifierIds: [ctx.user.id],
        ...(args.expiresInDays
          ? { mode: 'period', periodAmount: args.expiresInDays, periodUnit: 'day' }
          : { mode: 'indefinite' }),
      };
      await this.verification.createVerification(dto, ctx.user, workspace);
      created = true;
    }

    await this.verification.verifyPage(page.id, ctx.user, workspace);

    return {
      pageId: page.id,
      status: 'verified',
      created,
      note: 'Verified. Embeddings are being generated; the page will be retrievable by rag_retrieve / Ask HR within seconds.',
    };
  }
}
```

- [ ] **Step 4: Register the provider**

In `ai-chat.module.ts`, add import `import { VerifyPageTool } from './tools/verify-page.tool';` and add `VerifyPageTool,` to the Verification tools group.

- [ ] **Step 5: Run test + build**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/verify-page.tool.spec.ts && pnpm run build`
Expected: PASS (3 tests), build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ee/ai/chat/tools/verify-page.tool.ts \
        apps/server/src/ee/ai/chat/tools/verify-page.tool.spec.ts \
        apps/server/src/ee/ai/chat/ai-chat.module.ts
git commit -m "feat(mcp): verify_page tool (auto-create + verify -> RAG)"
```

---

### Task 5: `create_verification`, `submit_for_approval`, `mark_obsolete` tools

**Files:**
- Create: `apps/server/src/ee/ai/chat/tools/verification-lifecycle.tools.ts` (all three, exported as an array — small wrappers that share the same deps)
- Test: `apps/server/src/ee/ai/chat/tools/verification-lifecycle.tools.spec.ts`
- Modify: `ai-chat.module.ts`

**Interfaces:**
- Consumes: `PageService.findById`, `PageVerificationService.createVerification` / `.submitForApproval` / `.markObsolete`, `ChatToolRegistry`.
- Produces: `VERIFICATION_LIFECYCLE_TOOLS: Provider[]` — three tools `create_verification`, `submit_for_approval`, `mark_obsolete`. Note `submitForApproval(pageId, user)` takes NO workspace; `markObsolete(pageId, user, workspace)` and `createVerification(dto, user, workspace)` do.

- [ ] **Step 1: Write the failing test**

Create `verification-lifecycle.tools.spec.ts`:

```typescript
import {
  CreateVerificationTool,
  SubmitForApprovalTool,
  MarkObsoleteTool,
} from './verification-lifecycle.tools';

describe('verification lifecycle tools', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function deps() {
    return {
      pageService: { findById: jest.fn(async () => page) } as any,
      verification: {
        createVerification: jest.fn(async () => {}),
        submitForApproval: jest.fn(async () => {}),
        markObsolete: jest.fn(async () => {}),
      } as any,
      registry: { register: jest.fn() } as any,
    };
  }

  it('create_verification defaults verifierIds to the caller and type to expiring', async () => {
    const d = deps();
    const tool = new CreateVerificationTool(d.pageService, d.verification, d.registry);
    await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.createVerification).toHaveBeenCalledWith(
      { pageId: 'real-uuid', type: 'expiring', mode: 'indefinite', verifierIds: ['u1'] },
      ctx.user, { id: 'ws1' },
    );
  });

  it('submit_for_approval calls the service with (pageId, user) only', async () => {
    const d = deps();
    const tool = new SubmitForApprovalTool(d.pageService, d.verification, d.registry);
    await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.submitForApproval).toHaveBeenCalledWith('real-uuid', ctx.user);
  });

  it('mark_obsolete calls the service and reports it dropped from RAG', async () => {
    const d = deps();
    const tool = new MarkObsoleteTool(d.pageService, d.verification, d.registry);
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.markObsolete).toHaveBeenCalledWith('real-uuid', ctx.user, { id: 'ws1' });
    expect(res.status).toBe('obsolete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/verification-lifecycle.tools.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the tools**

Create `verification-lifecycle.tools.ts`:

```typescript
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

async function resolvePageId(
  pageService: PageService, pageId: string, workspaceId: string,
): Promise<string> {
  const page = await pageService.findById(pageId, true);
  if (!page || page.workspaceId !== workspaceId) {
    throw new NotFoundException(
      `Page not found for id "${pageId}". Pass the page UUID or short slugId.`,
    );
  }
  return page.id;
}

@Injectable()
export class CreateVerificationTool implements ChatTool, OnModuleInit {
  readonly name = 'create_verification';
  readonly description =
    'Create a verification on a page (does NOT verify it yet — use verify_page for the one-step path, or submit_for_approval for the QMS flow). Defaults: type "expiring", never expires, you as sole verifier.';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
    type: z.enum(['expiring', 'qms']).optional().describe('Verification type (default expiring).'),
    verifierIds: z.array(z.string()).optional()
      .describe('User UUIDs allowed to verify (default: you).'),
    expiresInDays: z.number().int().min(1).optional()
      .describe('Optional: expires after N days (default never).'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void { this.registry.register(this); }

  async execute(
    args: { pageId: string; type?: 'expiring' | 'qms'; verifierIds?: string[]; expiresInDays?: number },
    ctx: ChatToolContext,
  ): Promise<{ pageId: string; status: string }> {
    const pageId = await resolvePageId(this.pageService, args.pageId, ctx.workspaceId);
    const dto: any = {
      pageId,
      type: args.type ?? 'expiring',
      verifierIds: args.verifierIds ?? [ctx.user.id],
      ...(args.expiresInDays
        ? { mode: 'period', periodAmount: args.expiresInDays, periodUnit: 'day' }
        : { mode: 'indefinite' }),
    };
    await this.verification.createVerification(dto, ctx.user, { id: ctx.workspaceId } as any);
    return { pageId, status: 'draft' };
  }
}

@Injectable()
export class SubmitForApprovalTool implements ChatTool, OnModuleInit {
  readonly name = 'submit_for_approval';
  readonly description =
    'Submit a draft QMS verification for approval. Only valid for pages whose verification is in draft status.';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void { this.registry.register(this); }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{ pageId: string; status: string }> {
    const pageId = await resolvePageId(this.pageService, args.pageId, ctx.workspaceId);
    await this.verification.submitForApproval(pageId, ctx.user);
    return { pageId, status: 'in_approval' };
  }
}

@Injectable()
export class MarkObsoleteTool implements ChatTool, OnModuleInit {
  readonly name = 'mark_obsolete';
  readonly description =
    'Mark a page\'s verification obsolete. This removes the page from the knowledge base (it will no longer be retrievable by rag_retrieve / Ask HR). Requires space-manage permission.';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void { this.registry.register(this); }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{ pageId: string; status: string; note: string }> {
    const pageId = await resolvePageId(this.pageService, args.pageId, ctx.workspaceId);
    await this.verification.markObsolete(pageId, ctx.user, { id: ctx.workspaceId } as any);
    return {
      pageId, status: 'obsolete',
      note: 'Marked obsolete and removed from the knowledge base.',
    };
  }
}

export const VERIFICATION_LIFECYCLE_TOOLS = [
  CreateVerificationTool,
  SubmitForApprovalTool,
  MarkObsoleteTool,
];
```

- [ ] **Step 4: Register the providers**

In `ai-chat.module.ts`, add import `import { VERIFICATION_LIFECYCLE_TOOLS } from './tools/verification-lifecycle.tools';` and add `...VERIFICATION_LIFECYCLE_TOOLS,` to the Verification tools group in `providers:`.

- [ ] **Step 5: Run test + build**

Run: `cd apps/server && pnpm run test src/ee/ai/chat/tools/verification-lifecycle.tools.spec.ts && pnpm run build`
Expected: PASS (3 tests), build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ee/ai/chat/tools/verification-lifecycle.tools.ts \
        apps/server/src/ee/ai/chat/tools/verification-lifecycle.tools.spec.ts \
        apps/server/src/ee/ai/chat/ai-chat.module.ts
git commit -m "feat(mcp): create_verification, submit_for_approval, mark_obsolete tools"
```

---

### Task 6: Guide content, `verify-space` prompt, and Verification category

**Files:**
- Modify: `apps/server/src/ee/ai/mcp/mcp-guide.ts` (SERVER_INSTRUCTIONS line, overview tool-group, DEEPER GUIDANCE topics, new `verification` GUIDE_SECTION, `verify-space` MCP_PROMPT)
- Modify: `apps/server/src/ee/ai/mcp/mcp.service.ts` (add `Verification` branch to `categorizeTool`)
- Modify: `apps/server/src/ee/ai/mcp/mcp.service.spec.ts` (assert new prompt + guide section advertised)

**Interfaces:**
- Consumes: `MCP_PROMPTS`, `GUIDE_SECTIONS` (already consumed by `mcp.service.ts` and `get-guide.tool.ts` — adding entries requires no wiring change).

- [ ] **Step 1: Write the failing test**

Add to `mcp.service.spec.ts` inside the existing `describe('McpService prompts & resources (the skill layer)', ...)` block:

```typescript
it('advertises the verification guide section and verify-space prompt', async () => {
  const resList: any = await svc.handleRequest(
    { method: 'resources/list', params: {} }, ctx,
  );
  expect(resList.resources.some((r: any) => r.uri === 'conqrhub://guide/verification')).toBe(true);

  const promptList: any = await svc.handleRequest(
    { method: 'prompts/list', params: {} }, ctx,
  );
  expect(promptList.prompts.some((p: any) => p.name === 'verify-space')).toBe(true);
});
```

(If `ctx` / `svc` are named differently in the file, match the existing tests in that describe block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm run test src/ee/ai/mcp/mcp.service.spec.ts`
Expected: FAIL — no `conqrhub://guide/verification` resource / no `verify-space` prompt.

- [ ] **Step 3a: Add the SERVER_INSTRUCTIONS gate line**

In `mcp-guide.ts`, in `SERVER_INSTRUCTIONS` under `CORE RULES`, add after the "Ground every answer" bullet:

```
- Knowledge-base gate: rag_retrieve / Ask HR only return VERIFIED pages. Creating or editing a page does NOT index it, and editing a verified page resets it to draft and drops it from RAG. If a search returns nothing, check get_verification_status / list_unverified_pages and use verify_page to make content retrievable — do not assume "indexing lag".
```

And in the DEEPER GUIDANCE line, extend the topic list to include `verification`:

```
Call get_conqrhub_guide (topic = search | pages | attachments | diagrams | conqrplane | comments | spaces | verification), ...
```

- [ ] **Step 3b: Add verification to the overview tool-groups**

In the `overview` GUIDE_SECTION body, add a line to the tool-groups list:

```
- Verification (controls RAG eligibility): get_verification_status, list_unverified_pages, verify_page, create_verification, submit_for_approval, mark_obsolete
```

- [ ] **Step 3c: Add the `verification` GUIDE_SECTION**

Append to the `GUIDE_SECTIONS` array:

```typescript
{
  slug: 'verification',
  title: 'Verification (what makes a page retrievable)',
  description: 'How pages enter and leave the knowledge base.',
  body: `The knowledge base (rag_retrieve / Ask HR) contains ONLY verified pages. A page is retrievable exactly when its verification status is "verified" (or "expiring" but not past its expiry). Everything else — no verification, draft, in_approval, approved, expired, obsolete — is invisible to retrieval.

Key rules:
- Creating or editing a page does NOT index it. Editing a verified page resets it to draft and removes it from RAG until re-verified.
- To make a page retrievable: verify_page (one step — auto-creates a verification with you as verifier if none exists, then verifies). Retrieval is available seconds later (embeddings are async).
- To see state: get_verification_status (one page) or list_unverified_pages (everything not yet retrievable, optionally per space).
- QMS flow: create_verification (draft) -> submit_for_approval -> verify_page (approve) -> verify_page again (final verify).
- To remove a page from the knowledge base: mark_obsolete.
- Permissions: verifying/creating/obsoleting requires space-manage (or workspace-manage). If you get a permission error, the API user needs manage rights on that space.`,
},
```

- [ ] **Step 3d: Add the `verify-space` prompt**

Append to the `MCP_PROMPTS` array:

```typescript
{
  name: 'verify-space',
  title: 'Verify all pages in a space',
  description: 'Find every unverified page in a space and verify them so they become retrievable.',
  arguments: [
    { name: 'space', description: 'Space name, slug, or id to verify.', required: true },
  ],
  build: (v) =>
    `Verify all unverified pages in the ConqrHub space "${arg(v, 'space', '<space>')}" so they enter the knowledge base.\n\n` +
    `Steps:\n` +
    `1. list_spaces to resolve the space id if you were given a name/slug.\n` +
    `2. list_unverified_pages with that spaceId to see what is not yet retrievable.\n` +
    `3. Show me the list and confirm before proceeding.\n` +
    `4. For each page, call verify_page.\n` +
    `5. Report which pages are now verified (and any that failed on permissions).`,
},
```

- [ ] **Step 3e: Add the Verification category**

In `mcp.service.ts`, at the TOP of `categorizeTool` (before the `attachment` check), add:

```typescript
  if (
    name.includes('verif') ||
    name === 'submit_for_approval' ||
    name === 'mark_obsolete'
  ) {
    return 'Verification';
  }
```

- [ ] **Step 4: Run tests + build**

Run: `cd apps/server && pnpm run test src/ee/ai/mcp/mcp.service.spec.ts && pnpm run build`
Expected: PASS (existing + new assertion), build clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ee/ai/mcp/mcp-guide.ts \
        apps/server/src/ee/ai/mcp/mcp.service.ts \
        apps/server/src/ee/ai/mcp/mcp.service.spec.ts
git commit -m "feat(mcp): verification guide section, verify-space prompt, gate instructions, Verification category"
```

---

### Task 7: Full test run, deploy, and live verification

**Files:** none (build + deploy + verify).

- [ ] **Step 1: Run the full MCP + verification test suites**

Run: `cd apps/server && pnpm run test src/ee/ai/mcp src/ee/ai/chat/tools src/ee/page-verification`
Expected: all PASS.

- [ ] **Step 2: Full build**

Run: `cd apps/server && pnpm run build`
Expected: clean.

- [ ] **Step 3: Push + fast-forward main (triggers Railway deploy)**

```bash
git push origin feat/meeting-intelligence-foundation
git fetch origin main
git push origin feat/meeting-intelligence-foundation:main
```

- [ ] **Step 4: Wait for the ConqrHub deploy to go SUCCESS**

Poll: `railway deployment list -s ConqrHub </dev/null` until the newest is `SUCCESS`.

- [ ] **Step 5: Verify the live tools catalog reports 45 tools incl. the six verification tools**

```bash
KEY=$(railway variables -s ConqrService --kv </dev/null | grep '^HUB_API_KEY=' | cut -d= -f2-)
curl -s -H "Authorization: Bearer $KEY" https://app.conqrhub.com/api/ai/mcp/tools \
  | python -c "import json,sys; d=json.load(sys.stdin)['data']; names=[t['name'] for t in d['tools']]; want=['get_verification_status','list_unverified_pages','verify_page','create_verification','submit_for_approval','mark_obsolete']; print(len(names),'tools'); print('missing:',[w for w in want if w not in names] or 'none')"
```
Expected: `45 tools` and `missing: none`.

---

## Notes for the executor

- The `ai-chat.module.ts` providers array is edited across Tasks 2–5. Add all verification tools under one `// Verification tools` comment group so the diffs stack cleanly.
- Do NOT verify the 9 existing CW pages in this plan — that is a separate operational step the user chose to do themselves.
- Prerequisite for live end-to-end (Ask HR): the ConqrService `HUB_API_KEY` principal must have space-manage on the target space, or `verify_page` returns a `ForbiddenException`.
