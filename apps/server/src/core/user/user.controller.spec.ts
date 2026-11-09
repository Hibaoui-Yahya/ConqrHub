import { UnauthorizedException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';

describe('UserController current account', () => {
  const staleUser = { id: 'user-1', name: 'Old name' } as User;
  const staleWorkspace = { id: 'company-1', name: 'Old company' } as Workspace;
  let findUser: jest.Mock;
  let findWorkspace: jest.Mock;
  let countMembers: jest.Mock;
  let controller: UserController;

  beforeEach(() => {
    findUser = jest.fn().mockResolvedValue({
      id: 'user-1',
      workspaceId: 'company-1',
      name: 'Current name',
      avatarUrl: 'current-photo.png',
      settings: { preferences: { theme: { theme: 'light' } } },
    });
    findWorkspace = jest.fn().mockResolvedValue({
      id: 'company-1',
      name: 'Current company',
      licenseKey: 'private',
    });
    countMembers = jest.fn().mockResolvedValue(3);
    controller = new UserController(
      { findById: findUser } as unknown as UserService,
      {
        findById: findWorkspace,
        getActiveUserCount: countMembers,
      } as unknown as WorkspaceRepo,
    );
  });

  it('returns fresh company-scoped profile instead of the authentication snapshot', async () => {
    const result = await controller.getUserInfo(staleUser, staleWorkspace);
    expect(findUser).toHaveBeenCalledWith('user-1', 'company-1');
    expect(findWorkspace).toHaveBeenCalledWith('company-1');
    expect(countMembers).toHaveBeenCalledWith('company-1');
    expect(result.user.name).toBe('Current name');
    expect(result.user.avatarUrl).toBe('current-photo.png');
    expect(result.user.settings).toEqual({
      preferences: { theme: { theme: 'light' } },
    });
    expect(result.workspace).toEqual({
      id: 'company-1',
      name: 'Current company',
      memberCount: 3,
    });
  });

  it.each([
    undefined,
    { deactivatedAt: new Date() },
    { deletedAt: new Date() },
  ])(
    'rejects a removed or disabled user even when authentication has cached their profile',
    async (user) => {
      findUser.mockResolvedValue(user);
      await expect(
        controller.getUserInfo(staleUser, staleWorkspace),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it('rejects a missing company', async () => {
    findWorkspace.mockResolvedValue(undefined);
    await expect(
      controller.getUserInfo(staleUser, staleWorkspace),
    ).rejects.toThrow(UnauthorizedException);
  });
});
