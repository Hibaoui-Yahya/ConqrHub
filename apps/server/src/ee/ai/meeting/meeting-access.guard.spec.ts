import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingAccessGuard } from './meeting-access.guard';
import { MEETING_READ_ONLY_MESSAGE } from './meeting-access.util';

describe('MeetingAccessGuard', () => {
  const M1 = '0192f1a0-0000-7000-8000-000000000001';
  const DELETED = '0192f1a0-0000-7000-8000-000000000002';
  const meetings: Record<string, any> = {
    [M1]: { userId: 'annie', workspaceId: 'w1', deletedAt: null },
    [DELETED]: { userId: 'annie', workspaceId: 'w1', deletedAt: new Date() },
  };
  const queried: string[] = [];
  const db: any = {
    selectFrom: () => {
      let id = '';
      let liveOnly = false;
      const q: any = {
        select: () => q,
        where: (col: string, _op: string, val: any) => {
          if (col === 'id') id = val;
          if (col === 'deletedAt') liveOnly = val === null;
          return q;
        },
        executeTakeFirst: async () => {
          queried.push(id);
          const m = meetings[id];
          return m && (!liveOnly || !m.deletedAt) ? m : undefined;
        },
      };
      return q;
    },
  };
  const guard = new MeetingAccessGuard(db);
  const ctx = (id: string | undefined, user: any, workspaceId = 'w1', method = 'GET') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, params: id ? { id } : {}, user: { user, workspace: { id: workspaceId } } }),
      }),
    }) as any;

  it('lets every member of the company read, not only the author or a space member', async () => {
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'karim', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'sophie', role: 'admin' }))).resolves.toBe(true);
  });

  it('lets readers read but not change: 403 in French for a coworker, creator and managers pass', async () => {
    for (const method of ['DELETE', 'POST', 'PATCH']) {
      await expect(guard.canActivate(ctx(M1, { id: 'karim', role: 'member' }, 'w1', method))).rejects.toThrow(
        new ForbiddenException(MEETING_READ_ONLY_MESSAGE),
      );
    }
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'member' }, 'w1', 'DELETE'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'sophie', role: 'admin' }, 'w1', 'PATCH'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'olivier', role: 'owner' }, 'w1', 'POST'))).resolves.toBe(true);
  });

  it('answers 404 to another company (even an owner), a deleted meeting or an unknown id', async () => {
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'owner' }, 'w2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'owner' }, 'w2', 'DELETE'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx(DELETED, { id: 'annie', role: 'owner' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      guard.canActivate(ctx('0192f1a0-0000-7000-8000-00000000ffff', { id: 'annie', role: 'owner' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 to a malformed id without querying, and lets database errors through', async () => {
    queried.length = 0;
    await expect(guard.canActivate(ctx('nope', { id: 'annie', role: 'owner' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(queried).toEqual([]);
    const broken: any = {
      selectFrom: () => {
        const q: any = { select: () => q, where: () => q, executeTakeFirst: async () => { throw new Error('db down'); } };
        return q;
      },
    };
    await expect(new MeetingAccessGuard(broken).canActivate(ctx(M1, { id: 'annie', role: 'owner' }))).rejects.toThrow('db down');
  });

  it('answers 404 without an authenticated user', async () => {
    await expect(guard.canActivate(ctx(M1, undefined))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not check routes without an id (list, start, upload)', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'karim', role: 'member' }, 'w1', 'POST'))).resolves.toBe(true);
  });
});
