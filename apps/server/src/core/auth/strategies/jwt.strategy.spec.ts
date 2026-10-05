import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtType } from '../dto/jwt-payload';
import {
  MCP_EXPECTED_AUDIENCE_KEY,
  MCP_REQUIRED_SCOPE_KEY,
} from '../../../ee/ai/mcp/oauth/oauth.constants';

/**
 * F27 — audience-bound (MCP OAuth) access tokens are `type: 'api_key'` JWTs
 * that additionally carry `aud` and `scope`. They must authenticate ONLY on
 * routes that declare the matching expected audience (the MCP resource). On
 * every other route the strategy must reject them before any API-key/user
 * lookup happens — there is no fallback to a generic user identity.
 */
function makeStrategy(opts: {
  validateApiKey?: jest.Mock;
  redisGet?: jest.Mock;
  user?: any;
  workspace?: any;
  session?: any;
} = {}) {
  const user = 'user' in opts ? opts.user : { id: 'u1', workspaceId: 'ws1', role: 'member' };
  const workspace = 'workspace' in opts ? opts.workspace : { id: 'ws1' };
  const session = 'session' in opts ? opts.session : { id: 's1', userId: 'u1', workspaceId: 'ws1' };
  const validateApiKey =
    opts.validateApiKey ??
    jest.fn().mockResolvedValue({ user, workspace });

  const userRepo = { findById: jest.fn().mockResolvedValue(user) } as any;
  const workspaceRepo = { findById: jest.fn().mockResolvedValue(workspace) } as any;
  const userSessionRepo = { findActiveById: jest.fn().mockResolvedValue(session) } as any;
  const sessionActivityService = { trackActivity: jest.fn() } as any;
  const environmentService = { getAppSecret: () => 'x'.repeat(32) } as any;
  const moduleRef = { get: jest.fn().mockReturnValue({ validateApiKey }) } as any;
  const redis = {
    get: opts.redisGet ?? jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
  const redisService = { getOrThrow: () => redis } as any;

  const strategy = new JwtStrategy(
    userRepo,
    workspaceRepo,
    userSessionRepo,
    sessionActivityService,
    environmentService,
    moduleRef,
    redisService,
  );
  return { strategy, validateApiKey, userRepo, workspaceRepo, redis };
}

const MCP_RESOURCE = 'https://hub.example.com/mcp';

function req(raw: Record<string, unknown> = {}) {
  return { raw: { ...raw }, cookies: {}, headers: {} } as any;
}

const mcpToken = {
  sub: 'u1',
  workspaceId: 'ws1',
  apiKeyId: 'k-mcp',
  type: JwtType.API_KEY,
  aud: MCP_RESOURCE,
  scope: 'mcp offline_access',
};

const manualApiKey = {
  sub: 'u1',
  workspaceId: 'ws1',
  apiKeyId: 'k-manual',
  type: JwtType.API_KEY,
};

describe('JwtStrategy — audience-bound MCP tokens (F27)', () => {
  it('rejects an MCP token on an ordinary route (no expected audience) without consulting the API-key service', async () => {
    const { strategy, validateApiKey } = makeStrategy();
    await expect(strategy.validate(req(), mcpToken as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('accepts an MCP token on the MCP route whose expected audience matches', async () => {
    const { strategy, validateApiKey } = makeStrategy();
    const result = await strategy.validate(
      req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE }),
      mcpToken as any,
    );
    expect(result.user.id).toBe('u1');
    expect(validateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'k-mcp', aud: MCP_RESOURCE }),
    );
  });

  it('rejects an MCP token whose audience is a different host', async () => {
    const { strategy, validateApiKey } = makeStrategy();
    await expect(
      strategy.validate(
        req({ [MCP_EXPECTED_AUDIENCE_KEY]: 'https://other.example.com/mcp' }),
        mcpToken as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('rejects an MCP token whose audience array does not contain the expected resource', async () => {
    const { strategy } = makeStrategy();
    await expect(
      strategy.validate(
        req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE }),
        { ...mcpToken, aud: ['https://evil.example.com/mcp'] } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an MCP token that lacks the required scope even on the MCP route', async () => {
    // McpAuthGuard stamps both markers; mirror that here.
    const { strategy, validateApiKey } = makeStrategy();
    await expect(
      strategy.validate(
        req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE, [MCP_REQUIRED_SCOPE_KEY]: 'mcp' }),
        { ...mcpToken, scope: 'offline_access' } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('accepts an MCP token carrying the required scope when both markers are set', async () => {
    const { strategy } = makeStrategy();
    const result = await strategy.validate(
      req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE, [MCP_REQUIRED_SCOPE_KEY]: 'mcp' }),
      mcpToken as any,
    );
    expect(result.user.id).toBe('u1');
  });

  it('still accepts a manual API key (no aud) on the MCP route', async () => {
    const { strategy, validateApiKey } = makeStrategy();
    const result = await strategy.validate(
      req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE }),
      manualApiKey as any,
    );
    expect(result.user.id).toBe('u1');
    expect(validateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'k-manual' }),
    );
  });

  it('still accepts a manual API key (no aud) on ordinary routes', async () => {
    const { strategy } = makeStrategy();
    const result = await strategy.validate(req(), manualApiKey as any);
    expect(result.user.id).toBe('u1');
  });

  it('propagates a revoked/expired verdict from the API-key service (no fallback identity)', async () => {
    const validateApiKey = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('API key not found'));
    const { strategy } = makeStrategy({ validateApiKey });
    await expect(
      strategy.validate(req({ [MCP_EXPECTED_AUDIENCE_KEY]: MCP_RESOURCE }), mcpToken as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('normal session (access) tokens are unaffected', async () => {
    const { strategy } = makeStrategy();
    const result = await strategy.validate(req(), {
      sub: 'u1',
      email: 'u1@example.com',
      workspaceId: 'ws1',
      type: JwtType.ACCESS,
      sessionId: 's1',
    } as any);
    expect(result.user.id).toBe('u1');
    expect(result.workspace.id).toBe('ws1');
  });

  it('a session token with an unexpected aud is not treated as an MCP token and still requires type access', async () => {
    const { strategy } = makeStrategy();
    // type-less tokens with a foreign aud are rejected (only the suite-IdP aud is special-cased)
    await expect(
      strategy.validate(req(), { sub: 'u1', workspaceId: 'ws1', aud: MCP_RESOURCE } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
