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
