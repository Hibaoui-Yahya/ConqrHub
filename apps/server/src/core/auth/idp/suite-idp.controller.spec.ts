import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SuiteIdpController } from './suite-idp.controller';
import { SuiteIdpService } from './suite-idp.service';
import { AUTH_THROTTLER } from '../../../integrations/throttle/throttler-names';

/**
 * F28 — no client enumeration through error responses, constant-time secret
 * verification on the token endpoint, and explicit throttling on every IdP route.
 */
const LEGACY = 'plane|plane-suite-secret|http://localhost/auth/oidc/callback/';

function fakeReply() {
  const reply: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    code(c: number) {
      this.statusCode = c;
      return this;
    },
    header(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    send(b?: unknown) {
      this.body = b;
      return this;
    },
  };
  return reply;
}

function makeController(raw = LEGACY) {
  const jwt = new JwtService({ secret: 'test-secret' });
  const environment = {
    getAppUrl: () => 'http://localhost:5173',
    getSuiteIdpClientsRaw: () => raw,
    isHttps: () => false,
  } as any;
  const redis = { set: jest.fn(async () => 'OK'), getdel: jest.fn(async () => '1') };
  const idp = new SuiteIdpService(jwt as any, environment, { getOrThrow: () => redis } as any);
  const tokenService = { verifyJwt: jest.fn() } as any;
  const userRepo = { findById: jest.fn() } as any;
  return { controller: new SuiteIdpController(idp, tokenService, userRepo, environment), idp };
}

describe('SuiteIdpController token endpoint (F28)', () => {
  it('returns the same invalid_client response for an unknown client and for a wrong secret', async () => {
    const { controller } = makeController();
    const unknown = fakeReply();
    await controller.token({ client_id: 'nope', client_secret: 'plane-suite-secret', grant_type: 'authorization_code', code: 'x' }, unknown);
    const wrongSecret = fakeReply();
    await controller.token({ client_id: 'plane', client_secret: 'wrong', grant_type: 'authorization_code', code: 'x' }, wrongSecret);
    expect(unknown.statusCode).toBe(401);
    expect(wrongSecret.statusCode).toBe(401);
    expect(unknown.body).toEqual(wrongSecret.body);
    expect(unknown.body).toEqual({ error: 'invalid_client' });
  });

  it('rejects a missing secret and a non-string secret with invalid_client', async () => {
    const { controller } = makeController();
    const missing = fakeReply();
    await controller.token({ client_id: 'plane', grant_type: 'authorization_code', code: 'x' } as any, missing);
    const object = fakeReply();
    await controller.token({ client_id: 'plane', client_secret: { $ne: '' }, grant_type: 'authorization_code', code: 'x' } as any, object);
    expect(missing.statusCode).toBe(401);
    expect(object.statusCode).toBe(401);
    expect(missing.body).toEqual({ error: 'invalid_client' });
    expect(object.body).toEqual({ error: 'invalid_client' });
  });

  it('authenticates the legacy client with the correct secret and reaches grant handling', async () => {
    const { controller } = makeController();
    const reply = fakeReply();
    await controller.token({ client_id: 'plane', client_secret: 'plane-suite-secret', grant_type: 'client_credentials' }, reply);
    // Past client authentication: the unsupported grant is what fails now.
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toEqual({ error: 'unsupported_grant_type' });
  });
});

describe('SuiteIdpController authorize endpoint (F28)', () => {
  it('gives an identical 400 for an unknown client and for a wrong redirect_uri (no enumeration)', async () => {
    const { controller } = makeController();
    const unknown = fakeReply();
    await controller.authorize({ cookies: {} } as any, unknown, { client_id: 'nope', redirect_uri: 'http://localhost/auth/oidc/callback/', response_type: 'code' });
    const badRedirect = fakeReply();
    await controller.authorize({ cookies: {} } as any, badRedirect, { client_id: 'plane', redirect_uri: 'http://evil.example/cb', response_type: 'code' });
    expect(unknown.statusCode).toBe(400);
    expect(badRedirect.statusCode).toBe(400);
    expect(unknown.body).toEqual(badRedirect.body);
    expect(unknown.headers.Location).toBeUndefined();
    expect(badRedirect.headers.Location).toBeUndefined();
  });
});

describe('SuiteIdpController throttling (F28)', () => {
  it('is guarded by ThrottlerGuard at class level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SuiteIdpController) ?? [];
    expect(guards).toContain(ThrottlerGuard);
  });

  it.each([
    ['discovery', 'discovery', 60],
    ['authorize', 'authorize', 30],
    ['token', 'token', 60],
    ['userinfo', 'userinfo', 60],
  ])('declares an explicit auth throttle on %s', (_n, method, limit) => {
    const handler = (SuiteIdpController.prototype as any)[method];
    expect(Reflect.getMetadata(`THROTTLER:LIMIT${AUTH_THROTTLER}`, handler)).toBe(limit);
    expect(Reflect.getMetadata(`THROTTLER:TTL${AUTH_THROTTLER}`, handler)).toBe(60_000);
  });
});
