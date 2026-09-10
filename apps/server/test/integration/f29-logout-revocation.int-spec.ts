/**
 * F29 — real HTTP path with PostgreSQL + Redis: logout and revocation stop a session
 * immediately (cache entry removed), cookies are cleared with matching attributes, logout is
 * idempotent, and other users' sessions are untouched.
 */
import {
  ADMIN,
  bootTestApp,
  cookieHeader,
  decodeJwtPayload,
  http,
  login,
  recordMintedToken,
  resetDatabase,
  setupWorkspace,
  TestApp,
} from './helpers/app';
import { UserSessionRepo } from '../../src/database/repos/session/user-session.repo';
import { UserRepo } from '../../src/database/repos/user/user.repo';
import { SignupService } from '../../src/core/auth/services/signup.service';
import { SessionService } from '../../src/core/session/session.service';
import { TokenService } from '../../src/core/auth/services/token.service';

type Claims = { sub: string; workspaceId: string; sessionId: string };
const cacheKey = (c: Claims) => `jwt:auth:${c.workspaceId}:${c.sessionId}`;

describe('F29 — logout and revocation (HTTP, PostgreSQL, Redis)', () => {
  let t: TestApp;
  let admin: { cookie: string; token: string; claims: Claims };

  const me = (cookie: string) => http(t.server).post('/api/users/me').set('Cookie', cookie).send({});
  const warmCache = async (cookie: string, claims: Claims) => {
    await me(cookie).expect(200);
    expect(await t.redis.exists(cacheKey(claims))).toBe(1);
  };
  const newLogin = async () => {
    const s = await login(t, ADMIN.email, ADMIN.password);
    return { ...s, claims: decodeJwtPayload<Claims>(s.token) };
  };

  beforeAll(async () => {
    t = await bootTestApp();
    await resetDatabase(t);
    const s = await setupWorkspace(t);
    admin = { ...s, claims: decodeJwtPayload<Claims>(s.token) };
  });

  afterAll(async () => {
    await t?.close();
  });

  it('logout revokes the row, removes the Redis cache key, the session fails immediately, and the cookie is cleared with matching attributes', async () => {
    const s = await newLogin();
    await warmCache(s.cookie, s.claims);

    const out = await http(t.server).post('/api/auth/logout').set('Cookie', s.cookie).send({});
    expect(out.status).toBe(200);

    const cleared = cookieHeader(out.headers['set-cookie'], 'authToken');
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/authToken=;/);
    expect(cleared).toMatch(/Path=\//);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toMatch(/SameSite=Lax/i);
    expect(cleared).not.toMatch(/Secure/); // APP_URL is http in this environment
    expect(cleared).toMatch(/Expires=|Max-Age=0/);

    expect(await t.redis.exists(cacheKey(s.claims))).toBe(0);
    const row = await t.get<UserSessionRepo>(UserSessionRepo).findActiveById(s.claims.sessionId);
    expect(row).toBeUndefined();
    // Immediately, not after the 30 s cache TTL.
    await me(s.cookie).expect(401);
  });

  it('repeated logout is idempotent (200 and cookie cleared again)', async () => {
    const s = await newLogin();
    await http(t.server).post('/api/auth/logout').set('Cookie', s.cookie).send({}).expect(200);
    const second = await http(t.server).post('/api/auth/logout').set('Cookie', s.cookie).send({});
    expect(second.status).toBe(200);
    expect(cookieHeader(second.headers['set-cookie'], 'authToken')).toMatch(/authToken=;/);
    // No cookie at all is also fine.
    await http(t.server).post('/api/auth/logout').send({}).expect(200);
  });

  it('revoke-one ends exactly the targeted session', async () => {
    const a = await newLogin();
    const b = await newLogin();
    await warmCache(a.cookie, a.claims);
    await warmCache(b.cookie, b.claims);

    await http(t.server).post('/api/sessions/revoke').set('Cookie', a.cookie).send({ sessionId: b.claims.sessionId }).expect(200);

    expect(await t.redis.exists(cacheKey(b.claims))).toBe(0);
    await me(b.cookie).expect(401);
    expect(await t.redis.exists(cacheKey(a.claims))).toBe(1);
    await me(a.cookie).expect(200);
  });

  it('revoke-all ends every other session of the user and returns the affected ids from the repository', async () => {
    const current = await newLogin();
    const s2 = await newLogin();
    const s3 = await newLogin();
    for (const s of [current, s2, s3]) await warmCache(s.cookie, s.claims);

    await http(t.server).post('/api/sessions/revoke-all').set('Cookie', current.cookie).send({}).expect(200);

    expect(await t.redis.exists(cacheKey(s2.claims))).toBe(0);
    expect(await t.redis.exists(cacheKey(s3.claims))).toBe(0);
    await me(s2.cookie).expect(401);
    await me(s3.cookie).expect(401);
    expect(await t.redis.exists(cacheKey(current.claims))).toBe(1);
    await me(current.cookie).expect(200);

    // `.returning('id')` against the real database: a fresh pair revoked directly through the repo.
    const x = await newLogin();
    const y = await newLogin();
    const repo = t.get<UserSessionRepo>(UserSessionRepo);
    // Typed loosely on purpose: on unfixed code the repository returns void, and the assertion
    // below must fail behaviourally rather than at compile time.
    const ids: unknown = await repo.revokeAllExceptCurrent(current.claims.sessionId, current.claims.sub, current.claims.workspaceId);
    expect(Array.isArray(ids)).toBe(true);
    expect([...(ids as string[])].sort()).toEqual([x.claims.sessionId, y.claims.sessionId].sort());
    const again: unknown = await repo.revokeAllExceptCurrent(current.claims.sessionId, current.claims.sub, current.claims.workspaceId);
    expect(again).toEqual([]);
  });

  it("another user's session remains valid across the admin's logout and revoke-all", async () => {
    const ws = admin.claims.workspaceId;
    const signup = t.get<SignupService>(SignupService);
    const sessions = t.get<SessionService>(SessionService);
    const other = await signup.signup({ name: 'Other User', email: 'other@hub.test', password: 'Other-Passw0rd!!' } as any, ws);
    const otherToken = await sessions.createSessionAndToken(other);
    recordMintedToken(otherToken);
    const otherCookie = `authToken=${otherToken}`;
    const otherClaims = decodeJwtPayload<Claims>(otherToken);
    await warmCache(otherCookie, otherClaims);

    const a = await newLogin();
    await http(t.server).post('/api/sessions/revoke-all').set('Cookie', a.cookie).send({}).expect(200);
    await http(t.server).post('/api/auth/logout').set('Cookie', a.cookie).send({}).expect(200);

    expect(await t.redis.exists(cacheKey(otherClaims))).toBe(1);
    await me(otherCookie).expect(200);
  });

  it('an expired session is rejected, and logging it out is a harmless 200', async () => {
    const ws = admin.claims.workspaceId;
    const user = await t.get<UserRepo>(UserRepo).findById(admin.claims.sub, ws);
    const repo = t.get<UserSessionRepo>(UserSessionRepo);
    const session = await repo.insertSession({
      userId: user.id,
      workspaceId: ws,
      deviceName: 'ci-expired',
      ipAddress: null,
      expiresAt: new Date(Date.now() - 60_000),
    } as any);
    const token = await t.get<TokenService>(TokenService).generateAccessToken(user, session.id);
    recordMintedToken(token);
    const cookie = `authToken=${token}`;
    await me(cookie).expect(401);
    const out = await http(t.server).post('/api/auth/logout').set('Cookie', cookie).send({});
    expect(out.status).toBe(200);
    expect(cookieHeader(out.headers['set-cookie'], 'authToken')).toMatch(/authToken=;/);
  });
});
