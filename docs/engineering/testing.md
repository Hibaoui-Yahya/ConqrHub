# Testing

How to run, write, and reason about tests in ConqrAI Wiki.

## Test pyramid

```
                ┌──────────────────┐
                │  E2E (supertest) │     thin layer; covers happy paths and auth
                ├──────────────────┤
                │  Integration     │     module + DB; permission and queue paths
                ├──────────────────┤
                │  Unit (Jest)     │     services, utilities, repos with mocked DB
                └──────────────────┘
```

## Commands

From `apps/server`:

```bash
pnpm test                # Jest unit tests (*.spec.ts)
pnpm test:watch          # Watch mode
pnpm test:e2e            # E2E tests (supertest)
pnpm test:cov            # Coverage report
```

From `apps/client`:

```bash
pnpm test                # Vitest (when present)
```

(Frontend test infrastructure is lightweight — most behavior is verified through E2E and manual QA.)

## What's covered

| Area | Coverage |
|---|---|
| Auth (JWT, password, refresh) | Unit + E2E |
| Workspace / Space / Page CRUD | Unit + Integration |
| Permission checks (CASL + page restriction) | Unit (priority) — these are security-critical |
| Search service | Unit + Integration |
| Comment threads | Unit |
| Audit emission | Unit |
| Queue producers | Unit (mocked queue) |
| Queue processors | Integration |
| Real-time auth (Hocuspocus) | Integration |
| AI / EE features | Tests live in EE submodule (private) |

## Writing a unit test

Follow the project's existing pattern: `*.spec.ts` next to the file under test.

```ts
// apps/server/src/core/page/services/page.service.spec.ts
describe('PageService', () => {
  let service: PageService;
  let pageRepo: jest.Mocked<PageRepo>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PageService,
        { provide: PageRepo, useValue: createMock<PageRepo>() },
        { provide: PageAccessService, useValue: createMock<PageAccessService>() },
      ],
    }).compile();
    service = module.get(PageService);
    pageRepo = module.get(PageRepo);
  });

  it('returns a page the user can view', async () => {
    pageRepo.findById.mockResolvedValueOnce(stubPage());
    const result = await service.getPage('id', stubUser());
    expect(result).toMatchObject({ id: 'id' });
  });

  it('throws when user cannot view the page', async () => {
    pageRepo.findById.mockResolvedValueOnce(stubPage({ restricted: true }));
    await expect(service.getPage('id', stubUser())).rejects.toThrow(ForbiddenException);
  });
});
```

## Writing an integration test

Integration tests use the real Postgres + Redis from Docker-Compose. Each test cleans up via transaction rollback or per-test database truncation.

Key principles:
- **Don't mock the database.** Permission queries must execute against real SQL — that's what we're protecting against in production.
- **Don't mock the queue.** Use BullMQ's in-memory mode or the real queue.
- **Reset state between tests.** Either rollback transactions or truncate at the start of each test.

## Writing an E2E test

E2E tests use `supertest` against a running app instance. They cover:

- Authentication flows
- Permission enforcement at the HTTP boundary
- Multi-step user journeys (sign up → create workspace → create page → invite user)

```ts
describe('Pages E2E', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    cookie = await loginAs('owner@test.com');
  });

  it('creates a page in a space the user owns', async () => {
    const res = await request(app.getHttpServer())
      .post('/pages/create')
      .set('Cookie', cookie)
      .send({ spaceId: 'space-1', title: 'Test' });
    expect(res.status).toBe(201);
  });
});
```

## What we *don't* test (and why)

- **Tiptap rendering.** Tiptap's own test suite is comprehensive; we test the conversion paths (MD ↔ JSON, JSON → text) but not the editor itself.
- **External SaaS calls.** Stripe, OpenAI, Google OAuth — these are mocked. Real calls only happen in dedicated integration tests against test accounts.
- **The collaboration WebSocket message-by-message.** It's covered at the **auth** boundary and the **persistence** boundary; the CRDT itself is well-tested upstream.

## Running with the EE submodule

When the EE submodule is present, additional EE-only tests run alongside the OSS suite. Without the submodule, those test files are skipped (Jest's `testPathIgnorePatterns` includes the EE directory when it's empty).

## CI

Each PR runs:

1. Lint (`pnpm lint`)
2. Type check (`pnpm typecheck`)
3. Unit tests (`pnpm test`)
4. E2E tests (`pnpm test:e2e`) — against a fresh Postgres + Redis
5. Build (`pnpm build`)

Coverage reports are generated but not enforced as a hard gate.

## Related

- Adding a feature end-to-end (with tests): [`./adding-a-feature.md`](./adding-a-feature.md)
- DB / migration testing notes: [`./database-and-migrations.md`](./database-and-migrations.md)
