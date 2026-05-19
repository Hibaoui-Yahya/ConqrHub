import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

function makeService(overrides: {
  apiKey?: any;
  user?: any;
  workspace?: any;
} = {}) {
  const apiKey = 'apiKey' in overrides ? overrides.apiKey : { id: 'k1', workspaceId: 'ws1', expiresAt: null };
  const user = 'user' in overrides ? overrides.user : { id: 'u1', workspaceId: 'ws1', role: 'owner' };
  const workspace = 'workspace' in overrides ? overrides.workspace : { id: 'ws1' };

  const repo = {
    findById: jest.fn().mockResolvedValue(apiKey),
    update: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tokenService = {} as any;
  const userRepo = {
    findById: jest.fn().mockResolvedValue(user),
  } as any;
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue(workspace),
  } as any;
  return new ApiKeyService(repo, tokenService, userRepo, workspaceRepo);
}

describe('ApiKeyService.validateApiKey', () => {
  const payload = { sub: 'u1', workspaceId: 'ws1', apiKeyId: 'k1' };

  it('returns the full user (with role) and workspace from the repos', async () => {
    const svc = makeService();
    const result = await svc.validateApiKey(payload);

    expect(result.user).toEqual(
      expect.objectContaining({ id: 'u1', role: 'owner' }),
    );
    expect(result.workspace).toEqual(expect.objectContaining({ id: 'ws1' }));
  });

  it('rejects when the user is deleted/disabled', async () => {
    const svc = makeService({
      user: { id: 'u1', workspaceId: 'ws1', role: 'owner', deletedAt: new Date() },
    });
    await expect(svc.validateApiKey(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the workspace is missing', async () => {
    const svc = makeService({ workspace: null });
    await expect(svc.validateApiKey(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the api key is expired', async () => {
    const svc = makeService({
      apiKey: { id: 'k1', workspaceId: 'ws1', expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(svc.validateApiKey(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
