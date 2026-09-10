import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { GRANT_TYPE_MCP_OAUTH } from '../ai/mcp/oauth/oauth.constants';

/**
 * F27 — an api_keys row records whether it is a manual key (`default`) or an
 * OAuth-issued MCP grant (`mcp_oauth`). The token presented must match the
 * row: an audience-bound token must map to an MCP grant row, and a manual
 * key token must not be able to ride on an MCP grant row. Revoked and
 * expired rows are refused with no fallback identity.
 */
function makeService(apiKey: any) {
  const repo = {
    findById: jest.fn().mockResolvedValue(apiKey),
    update: jest.fn().mockResolvedValue(undefined),
  } as any;
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'u1', workspaceId: 'ws1', role: 'member' }),
  } as any;
  const workspaceRepo = { findById: jest.fn().mockResolvedValue({ id: 'ws1' }) } as any;
  return { svc: new ApiKeyService(repo, {} as any, userRepo, workspaceRepo), repo };
}

const base = { sub: 'u1', workspaceId: 'ws1', apiKeyId: 'k1' };

describe('ApiKeyService.validateApiKey — grant type consistency (F27)', () => {
  it('accepts an audience-bound token against an mcp_oauth grant row', async () => {
    const { svc } = makeService({ id: 'k1', workspaceId: 'ws1', type: GRANT_TYPE_MCP_OAUTH, expiresAt: null });
    const result = await svc.validateApiKey({ ...base, aud: 'https://hub.example.com/mcp', scope: 'mcp' });
    expect(result.user.id).toBe('u1');
  });

  it('accepts a manual token against a default row (existing behaviour)', async () => {
    const { svc } = makeService({ id: 'k1', workspaceId: 'ws1', type: 'default', expiresAt: null });
    const result = await svc.validateApiKey(base);
    expect(result.user.id).toBe('u1');
  });

  it('accepts a manual token against a legacy row with no type column value', async () => {
    const { svc } = makeService({ id: 'k1', workspaceId: 'ws1', expiresAt: null });
    const result = await svc.validateApiKey(base);
    expect(result.user.id).toBe('u1');
  });

  it('rejects an audience-bound token whose row is a manual key', async () => {
    const { svc, repo } = makeService({ id: 'k1', workspaceId: 'ws1', type: 'default', expiresAt: null });
    await expect(
      svc.validateApiKey({ ...base, aud: 'https://hub.example.com/mcp', scope: 'mcp' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects a token without aud whose row is an mcp_oauth grant', async () => {
    const { svc } = makeService({ id: 'k1', workspaceId: 'ws1', type: GRANT_TYPE_MCP_OAUTH, expiresAt: null });
    await expect(svc.validateApiKey(base)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked (soft-deleted → not found) grant', async () => {
    const { svc } = makeService(undefined);
    await expect(
      svc.validateApiKey({ ...base, aud: 'https://hub.example.com/mcp', scope: 'mcp' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired grant row', async () => {
    const { svc } = makeService({
      id: 'k1', workspaceId: 'ws1', type: GRANT_TYPE_MCP_OAUTH, expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      svc.validateApiKey({ ...base, aud: 'https://hub.example.com/mcp', scope: 'mcp' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
