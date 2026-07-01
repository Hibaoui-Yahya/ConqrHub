import { McpOauthService } from './mcp-oauth.service';
import { resolveOAuthUrls } from './oauth-url.util';

function makeService(): McpOauthService {
  const redisService = { getOrThrow: () => ({}) } as any;
  return new McpOauthService(
    {} as any, // clientRepo
    {} as any, // refreshRepo
    {} as any, // apiKeyRepo
    {} as any, // tokenService
    {} as any, // userRepo
    { isHttps: () => true } as any, // environmentService
    redisService,
  );
}

const URLS = resolveOAuthUrls({ headers: { host: 'app.conqrhub.com' } } as any, {
  defaultHttps: true,
});

describe('McpOauthService discovery docs', () => {
  const svc = makeService();

  it('protected-resource metadata points at the AS and canonical resource', () => {
    const prm = svc.buildProtectedResourceMetadata(URLS);
    expect(prm.resource).toBe('https://app.conqrhub.com/mcp');
    expect(prm.authorization_servers).toEqual(['https://app.conqrhub.com']);
    expect(prm.bearer_methods_supported).toEqual(['header']);
    expect(prm.scopes_supported).toContain('mcp');
  });

  it('AS metadata advertises S256-only PKCE and public clients', () => {
    const as = svc.buildAuthorizationServerMetadata(URLS);
    expect(as.issuer).toBe('https://app.conqrhub.com');
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(as.grant_types_supported).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(as.authorization_response_iss_parameter_supported).toBe(true);
    expect(as.authorization_endpoint).toBe(
      'https://app.conqrhub.com/oauth/authorize',
    );
  });
});

describe('McpOauthService.resolveScope', () => {
  const svc = makeService();

  it('always grants mcp', () => {
    expect(svc.resolveScope(undefined)).toBe('mcp');
    expect(svc.resolveScope('')).toBe('mcp');
  });

  it('keeps supported scopes and drops unknown ones', () => {
    expect(svc.resolveScope('mcp offline_access').split(' ').sort()).toEqual([
      'mcp',
      'offline_access',
    ]);
    expect(svc.resolveScope('offline_access bogus admin')).toContain('mcp');
    expect(svc.resolveScope('bogus admin')).toBe('mcp');
  });
});

describe('McpOauthService.clientRedirectUris', () => {
  const svc = makeService();

  it('parses a jsonb string column', () => {
    const uris = svc.clientRedirectUris({
      redirectUris: JSON.stringify(['https://claude.ai/api/mcp/auth_callback']),
    } as any);
    expect(uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });

  it('parses an already-materialised array', () => {
    const uris = svc.clientRedirectUris({
      redirectUris: ['https://chatgpt.com/connector/oauth/x'],
    } as any);
    expect(uris).toEqual(['https://chatgpt.com/connector/oauth/x']);
  });

  it('returns [] on garbage', () => {
    expect(svc.clientRedirectUris({ redirectUris: 42 } as any)).toEqual([]);
  });
});
