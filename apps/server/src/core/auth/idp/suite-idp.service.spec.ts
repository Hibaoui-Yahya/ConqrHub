import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SuiteIdpService } from './suite-idp.service';

function make(redisSetResults: Array<'OK' | null> = ['OK']) {
  const jwt = new JwtService({ secret: 'test-secret' });
  const environment = { getAppUrl: () => 'http://localhost:5173' };
  const setResults = [...redisSetResults];
  const redis = {
    set: jest.fn(async () => setResults.shift() ?? null),
  };
  const redisService = { getOrThrow: () => redis };
  const service = new SuiteIdpService(
    jwt as any,
    environment as any,
    redisService as any,
  );
  return { service, redis };
}

const user = { id: 'u1', email: 'yahya@conqr.test', name: 'Yahya Hibaoui' } as any;

describe('SuiteIdpService (ConqrHub as suite IdP, §9.1)', () => {
  const CLIENTS = 'plane|plane-secret|http://localhost/auth/oidc/callback/';

  beforeEach(() => {
    process.env.SUITE_IDP_CLIENTS = CLIENTS;
  });
  afterEach(() => {
    delete process.env.SUITE_IDP_CLIENTS;
  });

  it('parses static clients and enforces exact redirect match', () => {
    const { service } = make();
    const client = service.findClient('plane')!;
    expect(client.clientSecret).toBe('plane-secret');
    expect(service.redirectUriAllowed(client, 'http://localhost/auth/oidc/callback/')).toBe(true);
    expect(service.redirectUriAllowed(client, 'http://evil.example/cb')).toBe(false);
    expect(service.findClient('nope')).toBeUndefined();
  });

  it('is disabled with no configured clients', () => {
    delete process.env.SUITE_IDP_CLIENTS;
    const { service } = make();
    expect(service.isEnabled()).toBe(false);
  });

  it('exchanges a code exactly once (replay rejected)', async () => {
    const { service } = make(['OK', null]);
    const client = service.findClient('plane')!;
    const code = service.issueCode(user, 'ws1', client);
    const first = await service.exchangeCode(code, client);
    expect(first).toEqual({ userId: 'u1', workspaceId: 'ws1' });
    await expect(service.exchangeCode(code, client)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a code issued for a different client', async () => {
    process.env.SUITE_IDP_CLIENTS = `${CLIENTS};other|s2|http://x/cb`;
    const { service } = make();
    const plane = service.findClient('plane')!;
    const other = service.findClient('other')!;
    const code = service.issueCode(user, 'ws1', plane);
    await expect(service.exchangeCode(code, other)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('access token round-trips and userinfo exposes verified OIDC claims', async () => {
    const { service } = make();
    const { access_token, token_type } = service.issueAccessToken('u1', 'ws1');
    expect(token_type).toBe('Bearer');
    const verified = await service.verifyAccessToken(access_token);
    expect(verified).toEqual({ userId: 'u1', workspaceId: 'ws1' });
    const claims = service.userinfo(user);
    expect(claims).toMatchObject({
      sub: 'u1',
      email: 'yahya@conqr.test',
      email_verified: true,
      given_name: 'Yahya',
      family_name: 'Hibaoui',
    });
  });

  it('rejects garbage access tokens', async () => {
    const { service } = make();
    await expect(service.verifyAccessToken('garbage')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('discovery splits browser-facing authorize from backchannel endpoints', () => {
    const { service } = make();
    const doc = service.discovery('http://host.docker.internal:5173');
    expect(doc.authorization_endpoint).toBe('http://localhost:5173/api/idp/authorize');
    expect(doc.token_endpoint).toBe('http://host.docker.internal:5173/api/idp/token');
    expect(doc.userinfo_endpoint).toBe('http://host.docker.internal:5173/api/idp/userinfo');
  });
});
