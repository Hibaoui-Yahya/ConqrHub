/**
 * F27 — real HTTP path: an MCP OAuth access token must authenticate on `/mcp` only.
 * Boots the actual Nest app against PostgreSQL + Redis and drives it over HTTP.
 */
import { v7 as uuid7 } from 'uuid';
import {
  bootTestApp,
  decodeJwtPayload,
  http,
  recordMintedToken,
  resetDatabase,
  setupWorkspace,
  TestApp,
  TEST_HOST,
} from './helpers/app';
import { ApiKeyRepo } from '../../src/ee/api-key/api-key.repo';
import { ApiKeyService } from '../../src/ee/api-key/api-key.service';
import { TokenService } from '../../src/core/auth/services/token.service';
import { UserRepo } from '../../src/database/repos/user/user.repo';
import { WorkspaceRepo } from '../../src/database/repos/workspace/workspace.repo';

const MCP_RESOURCE = `http://${TEST_HOST}/mcp`;
const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '0' } },
};

describe('F27 — MCP token audience boundary (HTTP, PostgreSQL, Redis)', () => {
  let t: TestApp;
  let cookie: string;
  let workspaceId: string;
  let user: any;

  const mintMcp = async (opts: { audience?: string; scope?: string; expiresInSeconds?: number; rowType?: string } = {}) => {
    const apiKeyRepo = t.get<ApiKeyRepo>(ApiKeyRepo);
    const tokenService = t.get<TokenService>(TokenService);
    const id = uuid7();
    await apiKeyRepo.insert({
      id,
      name: `ci-mcp-${id.slice(-6)}`,
      creatorId: user.id,
      workspaceId,
      expiresAt: null,
      type: opts.rowType ?? 'mcp_oauth',
      clientId: 'mcp_ci_client',
    } as any);
    const token = await tokenService.generateMcpAccessToken({
      apiKeyId: id,
      user,
      workspaceId,
      audience: opts.audience ?? MCP_RESOURCE,
      scope: opts.scope ?? 'mcp offline_access',
      expiresInSeconds: opts.expiresInSeconds ?? 3600,
    });
    recordMintedToken(token);
    return { id, token };
  };

  beforeAll(async () => {
    t = await bootTestApp();
    await resetDatabase(t);
    const s = await setupWorkspace(t);
    cookie = s.cookie;
    const claims = decodeJwtPayload<{ sub: string; workspaceId: string }>(s.token);
    workspaceId = claims.workspaceId;
    user = await t.get<UserRepo>(UserRepo).findById(claims.sub, workspaceId);
    // The MCP surface is disabled by default; enable it for this synthetic workspace.
    await t.get<WorkspaceRepo>(WorkspaceRepo).updateWorkspace({ settings: { ai: { mcp: true } } } as any, workspaceId);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('a valid MCP token succeeds on POST /mcp', async () => {
    const { token } = await mintMcp();
    const res = await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE);
    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.error).toBeUndefined();
  });

  it('the same MCP token is rejected on an ordinary /api route before any API-key lookup', async () => {
    const { id, token } = await mintMcp();
    const res = await http(t.server).post('/api/users/me').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(401);
    // validateApiKey stamps last_used_at on every accepted lookup; an audience rejection must
    // happen before that, so the grant row stays untouched.
    const row = await t.get<ApiKeyRepo>(ApiKeyRepo).findById(id, workspaceId);
    expect(row.lastUsedAt).toBeNull();
    // Sanity: the same token on /mcp does reach the lookup.
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(200);
    const after = await t.get<ApiKeyRepo>(ApiKeyRepo).findById(id, workspaceId);
    expect(after.lastUsedAt).not.toBeNull();
  });

  it('wrong audience is rejected on /mcp and on /api', async () => {
    const { token } = await mintMcp({ audience: 'http://other.test/mcp' });
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(401);
    await http(t.server).post('/api/users/me').set('Authorization', `Bearer ${token}`).send({}).expect(401);
  });

  it('an mcp_oauth grant presented without an audience (manual-key-shaped token) is rejected everywhere', async () => {
    const apiKeyRepo = t.get<ApiKeyRepo>(ApiKeyRepo);
    const tokenService = t.get<TokenService>(TokenService);
    const id = uuid7();
    await apiKeyRepo.insert({ id, name: 'ci-noaud', creatorId: user.id, workspaceId, expiresAt: null, type: 'mcp_oauth', clientId: 'mcp_ci_client' } as any);
    const token = await tokenService.generateApiToken({ apiKeyId: id, user, workspaceId });
    recordMintedToken(token);
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(401);
    await http(t.server).post('/api/users/me').set('Authorization', `Bearer ${token}`).send({}).expect(401);
  });

  it('missing the mcp scope is rejected on /mcp with an insufficient_scope challenge', async () => {
    const { token } = await mintMcp({ scope: 'offline_access' });
    const res = await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE);
    expect(res.status).toBe(401);
    expect(String(res.headers['www-authenticate'] ?? '')).toContain('insufficient_scope');
  });

  it('a revoked grant is rejected on /mcp', async () => {
    const { id, token } = await mintMcp();
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(200);
    await t.get<ApiKeyService>(ApiKeyService).revoke(id, workspaceId);
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(401);
  });

  it('an expired token is rejected on /mcp', async () => {
    const { token } = await mintMcp({ expiresInSeconds: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(401);
  });

  it('a normal browser session still works on /api', async () => {
    await http(t.server).post('/api/users/me').set('Cookie', cookie).send({}).expect(200);
  });

  it('a manually created API key still works on /api and on /mcp', async () => {
    const { token } = await t.get<ApiKeyService>(ApiKeyService).create({ name: 'ci-manual', userId: user.id, workspaceId });
    recordMintedToken(token);
    await http(t.server).post('/api/users/me').set('Authorization', `Bearer ${token}`).send({}).expect(200);
    await http(t.server).post('/mcp').set('Authorization', `Bearer ${token}`).send(INITIALIZE).expect(200);
  });
});
