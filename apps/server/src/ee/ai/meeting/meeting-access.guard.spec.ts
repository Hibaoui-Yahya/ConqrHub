import { NotFoundException } from '@nestjs/common';
import { MeetingAccessGuard } from './meeting-access.guard';

describe('MeetingAccessGuard', () => {
  const meetings: Record<string, any> = {
    m1: { userId: 'annie', workspaceId: 'w1', spaceId: null, settings: { publishedBundle: { spaceId: 'lumen' } } },
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
  const ctx = (id: string | undefined, user: any, workspaceId = 'w1') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ params: id ? { id } : {}, user: { user, workspace: { id: workspaceId } } }),
      }),
    }) as any;

  it('lets the author, a member of the published space and an admin through', async () => {
    await expect(guard.canActivate(ctx('m1', { id: 'annie', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('m1', { id: 'marc', role: 'member' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('m1', { id: 'sophie', role: 'admin' }))).resolves.toBe(true);
  });

  it('answers 404 to another recruiter, another workspace or an unknown id', async () => {
    await expect(guard.canActivate(ctx('m1', { id: 'karim', role: 'member' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx('m1', { id: 'annie', role: 'owner' }, 'w2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(ctx('nope', { id: 'annie', role: 'owner' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not check routes without an id (list, start, upload)', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'karim', role: 'member' }))).resolves.toBe(true);
  });
});
