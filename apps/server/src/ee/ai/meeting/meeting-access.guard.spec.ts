import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingAccessGuard } from './meeting-access.guard';

describe('MeetingAccessGuard', () => {
  const meetings: Record<string, any> = {
    '11111111-1111-4111-8111-111111111111': { userId: 'annie', workspaceId: 'w1', spaceId: null, settings: { publishedBundle: { spaceId: 'lumen' } } },
  };
  const db: any = {
    selectFrom: () => {
      let id = '';
      const q: any = {
        select: () => q,
        where: (col: string, _op: string, val: any) => {
          if (col === 'id') id = val;
          return q;
        },
        executeTakeFirst: async () => meetings[id],
      };
      return q;
    },
  };
  const spaces: Record<string, string[]> = { marc: ['lumen'], karim: ['rh'] };
  const spaceMembers: any = { getUserSpaceIds: jest.fn(async (u: string) => spaces[u] ?? []) };
  const guard = new MeetingAccessGuard(db, spaceMembers);
  const M1 = '11111111-1111-4111-8111-111111111111';
  const ctx = (id: string | undefined, user: any, workspaceId = 'w1', method = 'GET') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, params: id ? { id } : {}, user: { user, workspace: { id: workspaceId } } }),
      }),
    }) as any;

  it('lets the author, a member of the published space and an admin through', async () => {
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'marc', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'sophie', role: 'admin' }))).resolves.toBe(true);
  });

  it('answers 404 to another recruiter, another workspace or an unknown id', async () => {
    await expect(guard.canActivate(ctx(M1, { id: 'karim', role: 'member' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'owner' }, 'w2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx('22222222-2222-4222-8222-222222222222', { id: 'annie', role: 'owner' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets readers read but not change: 403 on writes for space members', async () => {
    await expect(guard.canActivate(ctx(M1, { id: 'marc', role: 'member' }, 'w1', 'DELETE'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(M1, { id: 'marc', role: 'member' }, 'w1', 'POST'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(M1, { id: 'annie', role: 'member' }, 'w1', 'DELETE'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(M1, { id: 'sophie', role: 'admin' }, 'w1', 'PATCH'))).resolves.toBe(true);
  });

  it('answers 404 to a malformed id without querying, and lets database errors through', async () => {
    await expect(guard.canActivate(ctx('not-a-uuid', { id: 'annie', role: 'owner' }))).rejects.toBeInstanceOf(NotFoundException);
    const broken: any = { selectFrom: () => { const q: any = { select: () => q, where: () => q, executeTakeFirst: async () => { throw new Error('db down'); } }; return q; } };
    await expect(new MeetingAccessGuard(broken, spaceMembers).canActivate(ctx(M1, { id: 'annie', role: 'owner' }))).rejects.toThrow('db down');
  });

  it('does not check routes without an id (list, start, upload)', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'karim', role: 'member' }))).resolves.toBe(true);
  });
});
