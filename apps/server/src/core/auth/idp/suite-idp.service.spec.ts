import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SuiteIdpService } from './suite-idp.service';

/**
 * Unit tests of the IdP service's own logic. The token-family semantics
 * (locks, rotation, replay, revocation through the triggers) are tested
 * against a real Postgres in suite-token-family.integration.spec.ts — a
 * double here would only mirror the queries.
 */
function make(
  opts: {
    redisSetResults?: Array<'OK' | null>;
    families?: Record<string, jest.Mock>;
  } = {},
) {
  const jwt = new JwtService({ secret: 'test-secret' });
  const environment = {
    getAppUrl: () => 'http://localhost:5173',
    getSuiteIdpClientsRaw: () => process.env.SUITE_IDP_CLIENTS ?? '',
  };
  const setResults = [...(opts.redisSetResults ?? ['OK'])];
  const redis = { set: jest.fn(async () => setResults.shift() ?? null) };
  const families = {
    createForSession: jest.fn(async () => ({
      id: 'f1',
      expiresAt: new Date(Date.now() + 3600_000),
    })),
    rotate: jest.fn(),
    findForRequest: jest.fn(),
    endSessionForFamily: jest.fn(),
    ...(opts.families ?? {}),
  };
  const service = new SuiteIdpService(
    jwt as any,
    environment as any,
    { getOrThrow: () => redis } as any,
    families as any,
  );
  return { service, redis, families, jwt };
}

const user = {
  id: 'u1',
  email: 'yahya@conqr.test',
  name: 'Yahya Hibaoui',
} as any;
const CLIENTS =
  'plane|plane-secret|http://localhost/auth/oidc/callback/;conqrmeet|meet-secret|http://localhost:5273/auth/callback';

beforeEach(() => {
  process.env.SUITE_IDP_CLIENTS = CLIENTS;
  delete process.env.SUITE_TOKEN_EPOCH;
});
afterEach(() => {
  delete process.env.SUITE_IDP_CLIENTS;
  delete process.env.SUITE_TOKEN_EPOCH;
});

describe('SuiteIdpService (ConqrHub as suite IdP, §9.1)', () => {
  it('parses static clients and enforces exact redirect match', () => {
    const { service } = make();
    const client = service.findClient('plane')!;
    expect(client.clientSecret).toBe('plane-secret');
    expect(
      service.redirectUriAllowed(
        client,
        'http://localhost/auth/oidc/callback/',
      ),
    ).toBe(true);
    expect(service.redirectUriAllowed(client, 'http://evil.example/cb')).toBe(
      false,
    );
    expect(service.findClient('nope')).toBeUndefined();
  });

  it('is disabled with no configured clients', () => {
    delete process.env.SUITE_IDP_CLIENTS;
    const { service } = make();
    expect(service.isEnabled()).toBe(false);
  });

  it('exchanges a code exactly once and returns the authorizing Hub session', async () => {
    const { service } = make({ redisSetResults: ['OK', null] });
    const client = service.findClient('plane')!;
    const code = service.issueCode(user, 'ws1', client, 's1');
    await expect(service.exchangeCode(code, client)).resolves.toEqual({
      userId: 'u1',
      workspaceId: 'ws1',
      sessionId: 's1',
    });
    await expect(service.exchangeCode(code, client)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a code that names no Hub session (cannot be revoked with it)', async () => {
    const { service } = make();
    const client = service.findClient('plane')!;
    const code = service.issueCode(user, 'ws1', client);
    await expect(service.exchangeCode(code, client)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a code issued for a different client', async () => {
    const { service } = make();
    const code = service.issueCode(
      user,
      'ws1',
      service.findClient('plane')!,
      's1',
    );
    await expect(
      service.exchangeCode(code, service.findClient('conqrmeet')!),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('access token carries client, family and epoch; userinfo exposes OIDC claims', async () => {
    const { service } = make();
    const client = service.findClient('conqrmeet')!;
    const { access_token, token_type } = service.issueAccessToken(
      'u1',
      'ws1',
      client,
      'f1',
    );
    expect(token_type).toBe('Bearer');
    await expect(service.verifyAccessToken(access_token)).resolves.toEqual({
      userId: 'u1',
      workspaceId: 'ws1',
      familyId: 'f1',
      clientId: 'conqrmeet',
    });
    expect(service.userinfo(user)).toMatchObject({
      sub: 'u1',
      email: 'yahya@conqr.test',
      given_name: 'Yahya',
      family_name: 'Hibaoui',
    });
  });

  it('refuses access tokens minted under an older epoch (emergency revocation)', async () => {
    const { service } = make();
    const client = service.findClient('conqrmeet')!;
    const { access_token } = service.issueAccessToken(
      'u1',
      'ws1',
      client,
      'f1',
    );
    process.env.SUITE_TOKEN_EPOCH = '1';
    await expect(service.verifyAccessToken(access_token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects garbage access tokens', async () => {
    const { service } = make();
    await expect(service.verifyAccessToken('garbage')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('keeps the discovery document shape (consumers depend on it)', () => {
    const { service } = make();
    const doc = service.discovery('http://host.docker.internal:5173');
    expect(doc.authorization_endpoint).toBe(
      'http://localhost:5173/api/idp/authorize',
    );
    expect(doc.token_endpoint).toBe(
      'http://host.docker.internal:5173/api/idp/token',
    );
    expect(doc.userinfo_endpoint).toBe(
      'http://host.docker.internal:5173/api/idp/userinfo',
    );
    expect(doc.grant_types_supported).toEqual(['authorization_code']);
  });
});

describe('SuiteIdpService token families (service mapping)', () => {
  it('ties the first pair to the Hub session, and refuses when the session is gone', async () => {
    const { service, families } = make();
    const client = service.findClient('conqrmeet')!;
    const pair = await service.issueTokenPair('u1', 'ws1', client, 's1');
    expect(families.createForSession).toHaveBeenCalledWith(
      expect.objectContaining({
        hubSessionId: 's1',
        clientId: 'conqrmeet',
        userId: 'u1',
      }),
    );
    expect(pair.refresh_token).toBeTruthy();

    families.createForSession.mockResolvedValueOnce(null);
    await expect(
      service.issueTokenPair('u1', 'ws1', client, 's-gone'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('maps rotation outcomes: rotated → new jti, reused → current generation, replay/invalid → invalid_grant', async () => {
    const { service, families, jwt } = make();
    const client = service.findClient('conqrmeet')!;
    const pair = await service.issueTokenPair('u1', 'ws1', client, 's1');
    const base = {
      userId: 'u1',
      workspaceId: 'ws1',
      expiresAt: new Date(Date.now() + 3600_000),
    };

    families.rotate.mockResolvedValueOnce({ status: 'rotated', ...base });
    const rotated = await service.rotateRefreshToken(
      pair.refresh_token,
      client,
    );
    const newJti = (jwt.decode(rotated.refresh_token) as any).jti;
    expect(families.rotate.mock.calls[0][0].newJti).toBe(newJti);

    families.rotate.mockResolvedValueOnce({
      status: 'reused',
      ...base,
      currentJti: 'current-jti',
    });
    const reused = await service.rotateRefreshToken(pair.refresh_token, client);
    expect((jwt.decode(reused.refresh_token) as any).jti).toBe('current-jti');

    for (const status of ['replay', 'invalid']) {
      families.rotate.mockResolvedValueOnce({ status });
      await expect(
        service.rotateRefreshToken(pair.refresh_token, client),
      ).rejects.toThrow(UnauthorizedException);
    }
  });

  it('refuses refresh tokens without a family, from another client, or used as access tokens', async () => {
    const { service, families, jwt } = make();
    const meet = service.findClient('conqrmeet')!;
    const legacy = jwt.sign(
      {
        sub: 'u1',
        workspaceId: 'ws1',
        aud: 'conqr-suite-idp-refresh',
        client_id: 'conqrmeet',
        jti: 'j',
      },
      { expiresIn: 60 },
    );
    await expect(service.rotateRefreshToken(legacy, meet)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(families.rotate).not.toHaveBeenCalled();

    const pair = await service.issueTokenPair('u1', 'ws1', meet, 's1');
    await expect(
      service.rotateRefreshToken(
        pair.refresh_token,
        service.findClient('plane')!,
      ),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.rotateRefreshToken(pair.access_token, meet),
    ).rejects.toThrow(UnauthorizedException);
    await expect(service.verifyAccessToken(pair.refresh_token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ends a session by any token of the family, even an expired one', async () => {
    const { service, families, jwt } = make();
    const meet = service.findClient('conqrmeet')!;
    families.endSessionForFamily.mockResolvedValue({
      result: 'ended',
      userId: 'u1',
      workspaceId: 'ws1',
      hubSessionId: 's1',
    });
    const expired = jwt.sign({
      sub: 'u1',
      workspaceId: 'ws1',
      aud: 'conqr-suite-idp-refresh',
      client_id: 'conqrmeet',
      jti: 'old',
      fid: 'f1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(service.endSession(expired, meet)).resolves.toMatchObject({
      result: 'ended',
    });
    expect(families.endSessionForFamily).toHaveBeenCalledWith(
      'f1',
      'conqrmeet',
    );
    await expect(
      service.endSession(expired, service.findClient('plane')!),
    ).rejects.toThrow(UnauthorizedException);
  });
});
