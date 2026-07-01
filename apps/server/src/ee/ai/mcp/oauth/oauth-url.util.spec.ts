import {
  isRegistrableRedirectUri,
  redirectUriMatches,
  resolveOAuthUrls,
} from './oauth-url.util';

function req(headers: Record<string, string>): any {
  return { headers };
}

describe('resolveOAuthUrls', () => {
  it('derives issuer + resource from the request host', () => {
    const urls = resolveOAuthUrls(req({ host: 'app.conqrhub.com' }), {
      defaultHttps: true,
    });
    expect(urls.issuer).toBe('https://app.conqrhub.com');
    expect(urls.resource).toBe('https://app.conqrhub.com/mcp');
    expect(urls.prmUrl).toBe(
      'https://app.conqrhub.com/.well-known/oauth-protected-resource/mcp',
    );
    expect(urls.tokenEndpoint).toBe('https://app.conqrhub.com/oauth/token');
  });

  it('honours x-forwarded-proto/host and different tenants (cloud)', () => {
    const urls = resolveOAuthUrls(
      req({
        host: 'internal:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'acme.conqrhub.com',
      }),
      { defaultHttps: false },
    );
    expect(urls.resource).toBe('https://acme.conqrhub.com/mcp');
  });
});

describe('isRegistrableRedirectUri', () => {
  it('accepts https and http loopback', () => {
    expect(isRegistrableRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isRegistrableRedirectUri('https://chatgpt.com/connector/oauth/x')).toBe(true);
    expect(isRegistrableRedirectUri('http://localhost:3118/callback')).toBe(true);
    expect(isRegistrableRedirectUri('http://127.0.0.1:5000/callback')).toBe(true);
  });

  it('rejects plain http to a remote host, custom schemes, and fragments', () => {
    expect(isRegistrableRedirectUri('http://evil.com/callback')).toBe(false);
    expect(isRegistrableRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isRegistrableRedirectUri('cursor://callback')).toBe(false);
    expect(isRegistrableRedirectUri('https://ok.com/cb#frag')).toBe(false);
    expect(isRegistrableRedirectUri('not a url')).toBe(false);
  });
});

describe('redirectUriMatches', () => {
  it('requires exact match for non-loopback URIs', () => {
    const reg = ['https://claude.ai/api/mcp/auth_callback'];
    expect(redirectUriMatches(reg, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(redirectUriMatches(reg, 'https://claude.ai/api/mcp/auth_callback/')).toBe(false);
    expect(redirectUriMatches(reg, 'https://evil.ai/api/mcp/auth_callback')).toBe(false);
  });

  it('matches loopback port-agnostically', () => {
    const reg = ['http://localhost/callback'];
    expect(redirectUriMatches(reg, 'http://localhost:3118/callback')).toBe(true);
    expect(redirectUriMatches(reg, 'http://localhost:9999/callback')).toBe(true);
    expect(redirectUriMatches(reg, 'http://localhost:3118/other')).toBe(false);
  });

  it('does not treat a remote host as loopback', () => {
    const reg = ['http://localhost/callback'];
    expect(redirectUriMatches(reg, 'http://evil.com/callback')).toBe(false);
  });
});
