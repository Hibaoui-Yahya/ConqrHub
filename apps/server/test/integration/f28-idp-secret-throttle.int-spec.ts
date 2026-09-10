/**
 * F28 — real HTTP path for the suite IdP: constant-time client authentication with one public
 * error shape, startup validation of the client registry, and runtime (Redis-backed) throttling.
 */
import { bootTestApp, http, recordMintedToken, resetDatabase, setupWorkspace, TestApp } from './helpers/app';

const PLANE_SECRET = 'ci-plane-client-secret-value-0001';
const MEET_SECRET = 'ci-meet-client-secret-value-0002';
const REGISTRY = `plane|${PLANE_SECRET}|http://client.test/auth/oidc/callback/;meet|${MEET_SECRET}|http://meet.test/auth/callback`;

describe('F28 — suite IdP client registry validation at startup', () => {
  it.each([
    ['redirect URI not absolute', `plane|${PLANE_SECRET}|not a url`, /not an absolute URL/],
    ['redirect URI scheme', `plane|${PLANE_SECRET}|javascript:alert(1)`, /must use http or https/],
    ['duplicate client id', `plane|${PLANE_SECRET}|http://a.test/cb;plane|${MEET_SECRET}|http://b.test/cb`, /duplicate client id/],
    ['missing secret', 'plane||http://a.test/cb', /client secret is missing/],
  ])('refuses to start on a malformed registry (%s) without exposing the secret', async (_n, registry, pattern) => {
    let error: Error | undefined;
    try {
      const app = await bootTestApp({ SUITE_IDP_CLIENTS: registry }, { isolateModules: true });
      await app.close();
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(pattern);
    expect(error!.message).not.toContain(PLANE_SECRET);
    expect(error!.message).not.toContain(MEET_SECRET);
  });
});

describe('F28 — suite IdP token endpoint over HTTP (PostgreSQL, Redis)', () => {
  let t: TestApp;
  let cookie: string;
  let tokenCalls = 0;

  const token = (body: Record<string, unknown>) => {
    tokenCalls++;
    return http(t.server).post('/api/idp/token').send(body);
  };
  const authorize = (clientId: string, redirectUri: string) =>
    http(t.server)
      .get(`/api/idp/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=s1`)
      .set('Cookie', cookie);

  beforeAll(async () => {
    t = await bootTestApp({ SUITE_IDP_CLIENTS: REGISTRY }, { isolateModules: true });
    await resetDatabase(t);
    ({ cookie } = await setupWorkspace(t));
  });

  afterAll(async () => {
    await t?.close();
  });

  it('a valid legacy authorization-code exchange still completes (client_secret_post, JSON body)', async () => {
    const auth = await authorize('plane', 'http://client.test/auth/oidc/callback/');
    expect(auth.status).toBe(302);
    const location = new URL(auth.headers.location);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(location.searchParams.get('state')).toBe('s1');

    const res = await token({ grant_type: 'authorization_code', code, client_id: 'plane', client_secret: PLANE_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    recordMintedToken(res.body.access_token);
    recordMintedToken(res.body.refresh_token);

    // The access token is accepted at userinfo (legacy relying-party flow).
    const info = await http(t.server).get('/api/idp/userinfo').set('Authorization', `Bearer ${res.body.access_token}`);
    expect(info.status).toBe(200);
    expect(info.body.sub).toBeTruthy();

    // Refresh rotation works and the consumed refresh token is refused on replay.
    const rotated = await token({ grant_type: 'refresh_token', refresh_token: res.body.refresh_token, client_id: 'plane', client_secret: PLANE_SECRET });
    expect(rotated.status).toBe(200);
    recordMintedToken(rotated.body.access_token);
    recordMintedToken(rotated.body.refresh_token);
    const replay = await token({ grant_type: 'refresh_token', refresh_token: res.body.refresh_token, client_id: 'plane', client_secret: PLANE_SECRET });
    expect(replay.status).toBe(400);
    expect(replay.body).toEqual({ error: 'invalid_grant' });
  });

  it('unknown client, wrong secret, missing secret and different-length secret produce one indistinguishable response', async () => {
    const cases = [
      { client_id: 'nope', client_secret: PLANE_SECRET },
      { client_id: 'plane', client_secret: 'wrong' },
      { client_id: 'plane', client_secret: `${PLANE_SECRET}-with-a-longer-tail` },
      { client_id: 'plane' },
      { client_id: 'plane', client_secret: { $ne: '' } },
    ];
    const bodies: string[] = [];
    for (const c of cases) {
      const res = await token({ grant_type: 'authorization_code', code: 'x', ...c });
      expect(res.status).toBe(401);
      bodies.push(JSON.stringify(res.body));
      expect(JSON.stringify(res.body)).not.toContain(PLANE_SECRET);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(JSON.stringify({ error: 'invalid_client' }));
  });

  it('authorize gives the same 400 for an unknown client and for a wrong redirect_uri', async () => {
    const unknown = await authorize('nope', 'http://client.test/auth/oidc/callback/');
    const bad = await authorize('plane', 'http://evil.test/cb');
    expect(unknown.status).toBe(400);
    expect(bad.status).toBe(400);
    expect(unknown.body).toEqual(bad.body);
  });

  it('a different legitimate client is not affected by another client\'s failures', async () => {
    const auth = await authorize('meet', 'http://meet.test/auth/callback');
    expect(auth.status).toBe(302);
    const code = new URL(auth.headers.location).searchParams.get('code');
    const res = await token({ grant_type: 'authorization_code', code, client_id: 'meet', client_secret: MEET_SECRET });
    expect(res.status).toBe(200);
    recordMintedToken(res.body.access_token);
    recordMintedToken(res.body.refresh_token);
  });

  it('the token endpoint is rate limited per IP (real 429 after the configured 60/min) and other routes stay usable', async () => {
    let first429 = -1;
    for (let i = 0; i < 80; i++) {
      const res = await token({ grant_type: 'authorization_code', code: 'x', client_id: 'plane', client_secret: 'wrong' });
      if (res.status === 429) {
        first429 = tokenCalls;
        expect(res.body.message ?? res.body.error ?? JSON.stringify(res.body)).toMatch(/Too many requests|ThrottlerException/i);
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(first429).toBeGreaterThan(0);
    // 61st request in the window is the first refused one (all token calls so far count).
    expect(first429).toBe(61);
    // Isolation: the authorize route has its own bucket and still works while token is throttled.
    const auth = await authorize('plane', 'http://client.test/auth/oidc/callback/');
    expect(auth.status).toBe(302);
    // A normal session request is unaffected.
    await http(t.server).post('/api/users/me').set('Cookie', cookie).send({}).expect(200);
  });

  it('the limit resets after the window', async () => {
    await new Promise((r) => setTimeout(r, 61_000));
    const res = await token({ grant_type: 'authorization_code', code: 'x', client_id: 'plane', client_secret: 'wrong' });
    expect(res.status).toBe(401);
  });
});
