import { JwtService } from '@nestjs/jwt';
import { parseSuiteIdpClients, SuiteIdpService } from './suite-idp.service';

/**
 * F28 — client registry validation and constant-time client authentication.
 */
function makeService(raw: string) {
  const jwt = new JwtService({ secret: 'test-secret' });
  const environment = {
    getAppUrl: () => 'http://localhost:5173',
    getSuiteIdpClientsRaw: () => raw,
  };
  const redisService = { getOrThrow: () => ({ set: jest.fn(), getdel: jest.fn() }) };
  return new SuiteIdpService(jwt as any, environment as any, redisService as any);
}

const LEGACY = 'plane|plane-suite-secret|http://localhost/auth/oidc/callback/';

describe('parseSuiteIdpClients (F28)', () => {
  it('parses the legacy compose format and a trailing separator', () => {
    const clients = parseSuiteIdpClients(`${LEGACY};conqrmeet|s3cret|http://localhost:5273/auth/callback;`);
    expect(clients.map((c) => c.clientId)).toEqual(['plane', 'conqrmeet']);
    expect(clients[0].redirectUri).toBe('http://localhost/auth/oidc/callback/');
  });

  it('returns no clients for an empty or undefined registry', () => {
    expect(parseSuiteIdpClients('')).toEqual([]);
    expect(parseSuiteIdpClients(undefined)).toEqual([]);
  });

  it.each([
    ['missing secret', 'plane||http://localhost/cb', 'client secret is missing'],
    ['missing redirect', 'plane|top-secret-value|', 'not an absolute URL'],
    ['non-http scheme', 'plane|top-secret-value|javascript:alert(1)', 'must use http or https'],
    ['fragment', 'plane|top-secret-value|https://plane.example/cb#frag', 'must not contain a fragment'],
    ['bad id', 'pl ane|top-secret-value|https://plane.example/cb', 'invalid characters'],
    ['duplicate id', `${LEGACY};plane|other-secret-value|https://plane.example/cb`, 'duplicate client id'],
    ['too few parts', 'plane|only-two', 'not an absolute URL'],
  ])('rejects a malformed entry (%s) without echoing the secret', (_name, raw, fragment) => {
    let message = '';
    try {
      parseSuiteIdpClients(raw);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(fragment);
    expect(message).not.toContain('top-secret-value');
    expect(message).not.toContain('other-secret-value');
  });
});

describe('SuiteIdpService.verifyClientSecret (F28)', () => {
  it('accepts the exact secret and rejects any other value', () => {
    const svc = makeService(LEGACY);
    const client = svc.findClient('plane');
    expect(svc.verifyClientSecret(client, 'plane-suite-secret')).toBe(true);
    expect(svc.verifyClientSecret(client, 'plane-suite-secreT')).toBe(false);
    expect(svc.verifyClientSecret(client, 'plane-suite-secret ')).toBe(false);
  });

  it('is safe for different-length, empty and non-string inputs', () => {
    const svc = makeService(LEGACY);
    const client = svc.findClient('plane');
    expect(() => svc.verifyClientSecret(client, 'x')).not.toThrow();
    expect(svc.verifyClientSecret(client, 'x')).toBe(false);
    expect(svc.verifyClientSecret(client, 'plane-suite-secret-with-a-much-longer-tail')).toBe(false);
    expect(svc.verifyClientSecret(client, '')).toBe(false);
    expect(svc.verifyClientSecret(client, undefined)).toBe(false);
    expect(svc.verifyClientSecret(client, 42)).toBe(false);
  });

  it('always fails for an unknown client, even with an empty presented secret', () => {
    const svc = makeService(LEGACY);
    expect(svc.verifyClientSecret(undefined, '')).toBe(false);
    expect(svc.verifyClientSecret(undefined, 'anything')).toBe(false);
  });

  it('parses the registry once at construction (later env changes are ignored)', () => {
    process.env.SUITE_IDP_CLIENTS = LEGACY;
    const svc = makeService(process.env.SUITE_IDP_CLIENTS);
    process.env.SUITE_IDP_CLIENTS = 'evil|x|http://evil.example/cb';
    expect(svc.findClient('evil')).toBeUndefined();
    expect(svc.findClient('plane')).toBeDefined();
    delete process.env.SUITE_IDP_CLIENTS;
  });

  it('fails construction on a malformed registry', () => {
    expect(() => makeService('plane|top-secret-value|not a url')).toThrow(/not an absolute URL/);
  });
});
