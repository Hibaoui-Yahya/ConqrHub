import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard';
import { MCP_EXPECTED_AUDIENCE_KEY } from './oauth.constants';

/**
 * F27 — the MCP guard must (a) declare the expected audience on the request
 * before the JWT strategy runs, so audience-bound tokens can only pass here,
 * and (b) keep enforcing audience and scope on the decoded token.
 */
function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function fakeJwt(payload: Record<string, unknown>) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

function makeCtx(headers: Record<string, string>) {
  const raw: any = { headers: { host: 'hub.example.com', ...headers } };
  const req: any = { raw, headers: raw.headers, cookies: {} };
  const res: any = { header: jest.fn() };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

describe('McpAuthGuard (F27)', () => {
  const env = { isHttps: () => true } as any;

  it('canActivate stamps the expected MCP audience on the raw request before passport runs', async () => {
    const guard = new McpAuthGuard(env);
    // Short-circuit passport: we only care about the request decoration.
    jest
      .spyOn(Object.getPrototypeOf(McpAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true as any);
    const { ctx, req } = makeCtx({});
    await guard.canActivate(ctx);
    expect(req.raw[MCP_EXPECTED_AUDIENCE_KEY]).toBe('https://hub.example.com/mcp');
    jest.restoreAllMocks();
  });

  it('handleRequest accepts an OAuth token whose aud is this host and whose scope includes mcp', () => {
    const guard = new McpAuthGuard(env);
    const { ctx } = makeCtx({
      authorization: `Bearer ${fakeJwt({ aud: 'https://hub.example.com/mcp', scope: 'mcp' })}`,
    });
    const user = { user: { id: 'u1' }, workspace: { id: 'ws1' } };
    expect(guard.handleRequest(null, user, null, ctx)).toBe(user);
  });

  it('handleRequest rejects a wrong audience with an invalid_token challenge', () => {
    const guard = new McpAuthGuard(env);
    const { ctx, res } = makeCtx({
      authorization: `Bearer ${fakeJwt({ aud: 'https://other.example.com/mcp', scope: 'mcp' })}`,
    });
    expect(() => guard.handleRequest(null, { user: {} }, null, ctx)).toThrow(
      UnauthorizedException,
    );
    expect(res.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('error="invalid_token"'),
    );
  });

  it('handleRequest rejects an OAuth token without the mcp scope (insufficient_scope)', () => {
    const guard = new McpAuthGuard(env);
    const { ctx, res } = makeCtx({
      authorization: `Bearer ${fakeJwt({ aud: 'https://hub.example.com/mcp', scope: 'offline_access' })}`,
    });
    expect(() => guard.handleRequest(null, { user: {} }, null, ctx)).toThrow(
      UnauthorizedException,
    );
    expect(res.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('error="insufficient_scope"'),
    );
  });

  it('handleRequest accepts a manual API key (no aud) unchanged', () => {
    const guard = new McpAuthGuard(env);
    const { ctx } = makeCtx({
      authorization: `Bearer ${fakeJwt({ sub: 'u1', type: 'api_key' })}`,
    });
    const user = { user: { id: 'u1' } };
    expect(guard.handleRequest(null, user, null, ctx)).toBe(user);
  });

  it('handleRequest emits the discovery challenge when authentication failed', () => {
    const guard = new McpAuthGuard(env);
    const { ctx, res } = makeCtx({});
    expect(() => guard.handleRequest(null, null, null, ctx)).toThrow(UnauthorizedException);
    expect(res.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('resource_metadata='),
    );
  });
});
