import { VerificationNotificationService } from './verification.notification';
import { NotificationType } from '../notification.constants';

/**
 * Table-aware Kysely stub: `selectFrom(table)` returns a chain whose
 * execute() and executeTakeFirst() resolve to `rows[table]`. Builder
 * methods are chainable no-ops.
 */
function tableDb(rows: Record<string, any[]>) {
  const chain = (table: string) => {
    const qb: any = {};
    for (const m of ['select', 'selectAll', 'where', 'orderBy', 'limit']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.execute = jest.fn(async () => rows[table] ?? []);
    qb.executeTakeFirst = jest.fn(async () => (rows[table] ?? [])[0]);
    return qb;
  };
  return { selectFrom: jest.fn((t: string) => chain(t)) } as any;
}

function makeSvc(db: any, accessible: string[] | 'all' = 'all') {
  const notificationService = {
    create: jest.fn().mockImplementation(async (d) => ({ id: 'n-1', ...d })),
    queueEmail: jest.fn(),
  };
  const spaceMemberRepo = {
    getUserIdsWithSpaceAccess: jest.fn(async (ids: string[]) =>
      new Set(accessible === 'all' ? ids : ids.filter((i) => accessible.includes(i))),
    ),
  };
  const pagePermissionRepo = {
    getUserIdsWithPageAccess: jest.fn(async (_pageId: string, ids: string[]) => ids),
  };
  const svc = new VerificationNotificationService(
    db,
    notificationService as any,
    spaceMemberRepo as any,
    pagePermissionRepo as any,
  );
  return { svc, notificationService };
}

const JOB = { pageId: 'p1', spaceId: 's1', workspaceId: 'ws-1', verificationId: 'v1' };
const draft = (extra: Record<string, unknown> = {}) => ({
  id: 'v1', pageId: 'p1', spaceId: 's1', workspaceId: 'ws-1', status: 'draft',
  verifiedAt: new Date('2026-09-01T00:00:00Z'), ...extra,
});

describe('VerificationNotificationService.processVerificationInvalidated', () => {
  it('notifies every accessible verifier except the editor, once', async () => {
    const db = tableDb({
      pageVerifications: [draft()],
      pageVerifiers: [{ userId: 'editor' }, { userId: 'v-a' }, { userId: 'v-b' }],
      pages: [{ lastUpdatedById: 'editor' }],
      notifications: [],
    });
    const { svc, notificationService } = makeSvc(db);

    await svc.processVerificationInvalidated(JOB);

    expect(notificationService.create).toHaveBeenCalledTimes(2);
    const recipients = notificationService.create.mock.calls.map((c) => c[0].userId).sort();
    expect(recipients).toEqual(['v-a', 'v-b']);
    expect(notificationService.create.mock.calls[0][0]).toMatchObject({
      type: NotificationType.PAGE_VERIFICATION_INVALIDATED,
      actorId: 'editor',
      pageId: 'p1',
      spaceId: 's1',
      workspaceId: 'ws-1',
      pageVerificationId: 'v1',
    });
    expect(notificationService.queueEmail).not.toHaveBeenCalled();
  });

  it('skips verifiers already told during this draft period', async () => {
    const db = tableDb({
      pageVerifications: [draft()],
      pageVerifiers: [{ userId: 'v-a' }, { userId: 'v-b' }],
      pages: [{ lastUpdatedById: 'someone' }],
      notifications: [{ userId: 'v-a' }],
    });
    const { svc, notificationService } = makeSvc(db);

    await svc.processVerificationInvalidated(JOB);

    expect(notificationService.create).toHaveBeenCalledTimes(1);
    expect(notificationService.create.mock.calls[0][0].userId).toBe('v-b');
  });

  it('is a no-op when the verification was re-verified before the job ran', async () => {
    const db = tableDb({
      pageVerifications: [draft({ status: 'verified' })],
      pageVerifiers: [{ userId: 'v-a' }],
      pages: [{ lastUpdatedById: null }],
      notifications: [],
    });
    const { svc, notificationService } = makeSvc(db);

    await svc.processVerificationInvalidated(JOB);

    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it('drops verifiers who lost access to the space', async () => {
    const db = tableDb({
      pageVerifications: [draft()],
      pageVerifiers: [{ userId: 'v-a' }, { userId: 'v-gone' }],
      pages: [{ lastUpdatedById: null }],
      notifications: [],
    });
    const { svc, notificationService } = makeSvc(db, ['v-a']);

    await svc.processVerificationInvalidated(JOB);

    expect(notificationService.create).toHaveBeenCalledTimes(1);
    expect(notificationService.create.mock.calls[0][0].userId).toBe('v-a');
  });
});
