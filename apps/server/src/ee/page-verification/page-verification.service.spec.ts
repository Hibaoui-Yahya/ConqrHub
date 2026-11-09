import { ForbiddenException } from '@nestjs/common';
import { PageVerificationService } from './page-verification.service';

/** Minimal chainable Kysely stub: every builder method returns `this`;
 *  `execute()` resolves to the queued rows. */
function fakeDb(rows: any[]) {
  const qb: any = {};
  for (const m of [
    'selectFrom',
    'leftJoin',
    'select',
    'where',
    'limit',
    'orderBy',
    '$if',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.execute = jest.fn(async () => rows);
  return { qb, db: { selectFrom: () => qb } as any };
}

function makeService(db: any): PageVerificationService {
  // Only `db` is exercised by listUnverifiedPages; other deps are unused here.
  return new PageVerificationService(
    db,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
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

// ---------------------------------------------------------------------------
// Table-aware stub for the overview / paged / bulk endpoints. `selectFrom`
// (and insertInto / updateTable) hand back a chain that records its where()
// calls; execute* resolve through the per-table handler so one test can
// serve different rows for pages vs pageVerifications vs pageVerifiers.
// ---------------------------------------------------------------------------

type Handler = (where: Array<[string, string, unknown]>) => any[];

function tableDb(handlers: Record<string, Handler | any[]>) {
  const calls: Array<{ table: string; where: Array<[string, string, unknown]> }> = [];
  const inserts: Array<{ table: string; values: unknown }> = [];

  const resolve = (table: string, where: Array<[string, string, unknown]>) => {
    const h = handlers[table];
    if (h === undefined) throw new Error(`no handler for table ${table}`);
    return typeof h === 'function' ? h(where) : h;
  };

  // Expression-builder stub: callable for eb('col', op, val) and exposes
  // or/and so predicate callbacks run without throwing.
  const eb: any = Object.assign((c: string, o: string, v: unknown) => [c, o, v], {
    or: (xs: unknown[]) => ({ or: xs }),
    and: (xs: unknown[]) => ({ and: xs }),
    fn: { max: (c: string) => ({ as: () => ({ max: c }) }) },
  });

  const chain = (table: string) => {
    const where: Array<[string, string, unknown]> = [];
    const record = { table, where };
    calls.push(record);
    const qb: any = {};
    for (const m of ['innerJoin', 'leftJoin', 'limit', 'orderBy', '$if', 'returning', 'set']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.select = jest.fn((sel: unknown) => {
      if (typeof sel === 'function') sel(eb);
      return qb;
    });
    qb.where = jest.fn((...args: any[]) => {
      if (typeof args[0] === 'function') args[0](eb);
      else where.push([args[0], args[1], args[2]]);
      return qb;
    });
    qb.values = jest.fn((v: unknown) => {
      inserts.push({ table, values: v });
      return qb;
    });
    qb.execute = jest.fn(async () => resolve(table, where));
    qb.executeTakeFirst = jest.fn(async () => resolve(table, where)[0]);
    qb.executeTakeFirstOrThrow = jest.fn(async () => {
      const r = resolve(table, where)[0];
      if (!r) throw new Error('no rows');
      return r;
    });
    return qb;
  };

  const db: any = {
    selectFrom: jest.fn((t: string) => chain(t.split(' as ')[0])),
    insertInto: jest.fn((t: string) => chain(t)),
    updateTable: jest.fn((t: string) => chain(t)),
  };
  return { db, calls, inserts };
}

const WORKSPACE: any = { id: 'ws-1' };
const USER: any = { id: 'u-1', workspaceId: 'ws-1' };

function makeFullService(
  db: any,
  opts: {
    memberSpaceIds?: string[];
    canReadSpace?: boolean;
    isSpaceAdmin?: boolean;
    isWorkspaceAdmin?: boolean;
  } = {},
) {
  const spaceAbility = {
    createForUser: jest.fn().mockResolvedValue({
      can: jest.fn().mockReturnValue(opts.isSpaceAdmin ?? false),
      cannot: jest.fn().mockReturnValue(!(opts.canReadSpace ?? true)),
    }),
  };
  const workspaceAbility = {
    createForUser: jest.fn().mockReturnValue({
      can: jest.fn().mockReturnValue(opts.isWorkspaceAdmin ?? false),
      cannot: jest.fn().mockReturnValue(!(opts.isWorkspaceAdmin ?? false)),
    }),
  };
  const notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const aiQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const audit = { logWithContext: jest.fn().mockResolvedValue(undefined) };
  const spaceMemberRepo = {
    getUserSpaceIds: jest.fn().mockResolvedValue(opts.memberSpaceIds ?? ['s1', 's2']),
  };
  const svc = new PageVerificationService(
    db,
    spaceAbility as any,
    workspaceAbility as any,
    notificationQueue as any,
    aiQueue as any,
    audit as any,
    spaceMemberRepo as any,
  );
  return { svc, spaceAbility, workspaceAbility, notificationQueue, aiQueue, spaceMemberRepo };
}

const DAY = 24 * 3600 * 1000;

describe('PageVerificationService.invalidateOnContentChange', () => {
  it('enqueues one PAGE_VERIFICATION_INVALIDATED job per reset row and returns the pageIds', async () => {
    const { db } = tableDb({
      pageVerifications: [
        { pageId: 'p1', spaceId: 's1', workspaceId: 'ws-1', id: 'v1' },
        { pageId: 'p2', spaceId: 's1', workspaceId: 'ws-1', id: 'v2' },
      ],
    });
    const { svc, notificationQueue } = makeFullService(db);

    const out = await svc.invalidateOnContentChange(['p1', 'p2', 'p3']);

    expect(out).toEqual(['p1', 'p2']);
    expect(notificationQueue.add).toHaveBeenCalledTimes(2);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      'page-verification-invalidated',
      { pageId: 'p1', spaceId: 's1', workspaceId: 'ws-1', verificationId: 'v1' },
    );
  });

  it('does nothing for an empty input', async () => {
    const { db } = tableDb({});
    const { svc, notificationQueue } = makeFullService(db);
    expect(await svc.invalidateOnContentChange([])).toEqual([]);
    expect(db.updateTable).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});

describe('PageVerificationService.getVerificationOverview', () => {
  const pages = [
    { spaceId: 's1', status: 'verified', expiresAt: new Date(Date.now() + 60 * DAY) },
    { spaceId: 's1', status: 'verified', expiresAt: new Date(Date.now() + 2 * DAY) }, // expiring window
    { spaceId: 's1', status: 'verified', expiresAt: new Date(Date.now() - DAY) }, // expired
    { spaceId: 's1', status: 'draft', expiresAt: null },
    { spaceId: 's2', status: 'in_approval', expiresAt: null },
    { spaceId: 's2', status: 'obsolete', expiresAt: null },
    { spaceId: 's2', status: null, expiresAt: null },
    { spaceId: 's2', status: 'verified', expiresAt: null }, // indefinite
  ];
  const spaces = [
    { id: 's1', name: 'RH', slug: 'rh' },
    { id: 's2', name: 'Juridique', slug: 'legal' },
  ];

  it('counts effective statuses across the accessible spaces and per space', async () => {
    const { db, calls } = tableDb({
      pages,
      spaces,
      aiEmbeddings: [{ max: new Date('2026-10-01T10:00:00Z') }],
    });
    const { svc, spaceMemberRepo } = makeFullService(db, { memberSpaceIds: ['s1', 's2'] });

    const o = await svc.getVerificationOverview({}, USER, WORKSPACE);

    expect(spaceMemberRepo.getUserSpaceIds).toHaveBeenCalledWith('u-1');
    expect(o).toMatchObject({
      verified: 2, expiring: 1, expired: 1, draft: 1, inApproval: 1,
      obsolete: 1, none: 1, total: 8, unverified: 5,
      lastIndexedAt: '2026-10-01T10:00:00.000Z',
    });
    expect(o.spaces).toEqual([
      { spaceId: 's2', spaceName: 'Juridique', spaceSlug: 'legal', total: 4, verified: 1, unverified: 3 },
      { spaceId: 's1', spaceName: 'RH', spaceSlug: 'rh', total: 4, verified: 2, unverified: 2 },
    ]);
    const pagesCall = calls.find((c) => c.table === 'pages');
    expect(pagesCall?.where).toEqual(
      expect.arrayContaining([
        ['p.workspaceId', '=', 'ws-1'],
        ['p.deletedAt', 'is', null],
        ['p.spaceId', 'in', ['s1', 's2']],
      ]),
    );
  });

  it('scopes to one space after a Read check and rejects a space the user cannot read', async () => {
    const { db, calls } = tableDb({ pages: [], spaces: [], aiEmbeddings: [] });
    const { svc, spaceMemberRepo } = makeFullService(db, { canReadSpace: true });

    const o = await svc.getVerificationOverview({ spaceId: 's1' }, USER, WORKSPACE);
    expect(o.total).toBe(0);
    expect(o.spaces).toEqual([
      { spaceId: 's1', spaceName: null, spaceSlug: null, total: 0, verified: 0, unverified: 0 },
    ]);
    expect(spaceMemberRepo.getUserSpaceIds).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === 'pages')?.where).toContainEqual(['p.spaceId', 'in', ['s1']]);

    const denied = makeFullService(tableDb({}).db, { canReadSpace: false });
    await expect(
      denied.svc.getVerificationOverview({ spaceId: 's1' }, USER, WORKSPACE),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns zeros without querying when the user is in no space', async () => {
    const { db } = tableDb({});
    const { svc } = makeFullService(db, { memberSpaceIds: [] });
    const o = await svc.getVerificationOverview({}, USER, WORKSPACE);
    expect(o.total).toBe(0);
    expect(o.lastIndexedAt).toBeNull();
    expect(db.selectFrom).not.toHaveBeenCalled();
  });
});

describe('PageVerificationService.listUnverifiedPagesPaged', () => {
  const row = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `p${i}`, title: `Page ${i}`, slugId: `slug${i}`, icon: null, spaceId: 's1',
    updatedAt: new Date(Date.now() - i * 1000), spaceName: 'RH', spaceSlug: 'rh',
    verificationStatus: null, expiresAt: null, verifiedAt: null, updatedByName: 'Nadia',
    ...extra,
  });

  it('maps rows, applies the title filter and emits a keyset cursor when more rows exist', async () => {
    const rows = [row(1), row(2, { verificationStatus: 'draft', verifiedAt: new Date('2026-09-01T00:00:00Z') }), row(3)];
    const { db, calls } = tableDb({ pages: rows });
    const { svc } = makeFullService(db, { memberSpaceIds: ['s1'] });

    const out = await svc.listUnverifiedPagesPaged({ limit: 2, query: 'Pa%ge' }, USER, WORKSPACE);

    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({
      id: 'p1', title: 'Page 1', slugId: 'slug1', spaceName: 'RH', spaceSlug: 'rh',
      status: 'none', lastVerifiedAt: null, updatedByName: 'Nadia',
    });
    expect(out.items[1]).toMatchObject({ status: 'draft', lastVerifiedAt: '2026-09-01T00:00:00.000Z' });
    expect(out.nextCursor).toBeTruthy();
    const decoded = Buffer.from(out.nextCursor as string, 'base64url').toString('utf8');
    expect(decoded).toBe(`${rows[1].updatedAt.toISOString()}|p2`);

    const pagesCall = calls.find((c) => c.table === 'pages');
    // LIKE metacharacters in the query are escaped.
    expect(pagesCall?.where).toContainEqual(['p.title', 'ilike', '%Pa\\%ge%']);
  });

  it('returns nextCursor null on the last page and accepts the cursor back', async () => {
    const first = tableDb({ pages: [row(1)] });
    const { svc } = makeFullService(first.db, { memberSpaceIds: ['s1'] });
    const out = await svc.listUnverifiedPagesPaged({ limit: 5 }, USER, WORKSPACE);
    expect(out.nextCursor).toBeNull();

    const cursor = Buffer.from('2026-10-01T00:00:00.000Z|p9', 'utf8').toString('base64url');
    const second = tableDb({ pages: [] });
    const again = makeFullService(second.db, { memberSpaceIds: ['s1'] });
    await expect(
      again.svc.listUnverifiedPagesPaged({ cursor }, USER, WORKSPACE),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('rejects a malformed cursor and short-circuits with no spaces', async () => {
    const { db } = tableDb({ pages: [] });
    const { svc } = makeFullService(db, { memberSpaceIds: ['s1'] });
    await expect(
      svc.listUnverifiedPagesPaged({ cursor: 'not-a-cursor' }, USER, WORKSPACE),
    ).rejects.toThrow('Invalid cursor');

    const none = makeFullService(tableDb({}).db, { memberSpaceIds: [] });
    await expect(none.svc.listUnverifiedPagesPaged({}, USER, WORKSPACE)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});

describe('PageVerificationService.bulkVerify', () => {
  function pagesHandler(known: Record<string, { spaceId: string; workspaceId: string }>): Handler {
    return (where) => {
      const id = where.find(([c]) => c === 'id')?.[2] as string;
      return known[id] ? [{ id, ...known[id] }] : [];
    };
  }

  it('creates a verification then verifies when none exists and the caller can manage', async () => {
    const { db } = tableDb({
      pages: pagesHandler({ p1: { spaceId: 's1', workspaceId: 'ws-1' } }),
      pageVerifications: [],
    });
    const { svc } = makeFullService(db, { isSpaceAdmin: true });
    const create = jest.spyOn(svc, 'createVerification').mockResolvedValue(undefined);
    const verify = jest.spyOn(svc, 'verifyPage').mockResolvedValue(undefined);

    const out = await svc.bulkVerify({ pageIds: ['p1', 'p1'], expiresInDays: 30 }, USER, WORKSPACE);

    expect(out).toEqual({ verified: ['p1'], failed: [] });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      pageId: 'p1', type: 'expiring', verifierIds: ['u-1'], mode: 'period', periodAmount: 30, periodUnit: 'day',
    });
    expect(verify).toHaveBeenCalledWith('p1', USER, WORKSPACE);
  });

  it('uses an indefinite verification when expiresInDays is omitted', async () => {
    const { db } = tableDb({
      pages: pagesHandler({ p1: { spaceId: 's1', workspaceId: 'ws-1' } }),
      pageVerifications: [],
    });
    const { svc } = makeFullService(db, { isWorkspaceAdmin: true });
    const create = jest.spyOn(svc, 'createVerification').mockResolvedValue(undefined);
    jest.spyOn(svc, 'verifyPage').mockResolvedValue(undefined);

    await svc.bulkVerify({ pageIds: ['p1'] }, USER, WORKSPACE);

    expect(create.mock.calls[0][0]).toMatchObject({ mode: 'indefinite' });
  });

  it('collects per-page failures instead of throwing', async () => {
    const { db } = tableDb({
      pages: pagesHandler({
        'p-ok': { spaceId: 's1', workspaceId: 'ws-1' },
        'p-other-ws': { spaceId: 's1', workspaceId: 'ws-2' },
        'p-boom': { spaceId: 's1', workspaceId: 'ws-1' },
      }),
      pageVerifications: [],
    });
    const { svc } = makeFullService(db, { isSpaceAdmin: true });
    jest.spyOn(svc, 'createVerification').mockResolvedValue(undefined);
    jest
      .spyOn(svc, 'verifyPage')
      .mockImplementation(async (pageId: string) => {
        if (pageId === 'p-boom') throw new ForbiddenException('nope');
      });

    const out = await svc.bulkVerify(
      { pageIds: ['p-ok', 'p-missing', 'p-other-ws', 'p-boom'] },
      USER,
      WORKSPACE,
    );

    expect(out.verified).toEqual(['p-ok']);
    expect(out.failed).toEqual([
      { pageId: 'p-missing', reason: 'not_found' },
      { pageId: 'p-other-ws', reason: 'not_found' },
      { pageId: 'p-boom', reason: 'forbidden' },
    ]);
  });

  it('refuses to create a verification for a non-manager but lets an existing verifier verify', async () => {
    const { db } = tableDb({
      pages: pagesHandler({
        'p-new': { spaceId: 's1', workspaceId: 'ws-1' },
        'p-existing': { spaceId: 's1', workspaceId: 'ws-1' },
      }),
      pageVerifications: (where) =>
        where.find(([c]) => c === 'pageId')?.[2] === 'p-existing'
          ? [{ id: 'v1', status: 'draft' }]
          : [],
      pageVerifiers: [{ userId: 'u-1' }],
    });
    const { svc } = makeFullService(db, { isSpaceAdmin: false, isWorkspaceAdmin: false });
    const create = jest.spyOn(svc, 'createVerification').mockResolvedValue(undefined);
    const verify = jest.spyOn(svc, 'verifyPage').mockResolvedValue(undefined);

    const out = await svc.bulkVerify({ pageIds: ['p-new', 'p-existing'] }, USER, WORKSPACE);

    expect(out).toEqual({
      verified: ['p-existing'],
      failed: [{ pageId: 'p-new', reason: 'forbidden' }],
    });
    expect(create).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('adds a space admin to the verifier list of an existing verification before verifying', async () => {
    const { db, inserts } = tableDb({
      pages: pagesHandler({ p1: { spaceId: 's1', workspaceId: 'ws-1' } }),
      pageVerifications: [{ id: 'v1', status: 'draft' }],
      pageVerifiers: [{ userId: 'someone-else' }],
    });
    const { svc } = makeFullService(db, { isSpaceAdmin: true });
    jest.spyOn(svc, 'verifyPage').mockResolvedValue(undefined);

    const out = await svc.bulkVerify({ pageIds: ['p1'] }, USER, WORKSPACE);

    expect(out.verified).toEqual(['p1']);
    expect(inserts).toEqual([
      { table: 'pageVerifiers', values: { pageVerificationId: 'v1', userId: 'u-1', addedById: 'u-1' } },
    ]);
  });
});
