import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SuiteTokenFamilyRepo } from '@docmost/db/repos/auth/suite-token-family.repo';
import { TokenService } from '../services/token.service';
import { HubSessionValidator } from '../services/hub-session-validator.service';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { SuiteIdpService } from './suite-idp.service';
import { SuiteIdpController } from './suite-idp.controller';

/**
 * Token families against a REAL Postgres (migrated, incl.
 * 20261016T100000-suite-token-families) and Redis — ADR-HM-001 v3 G1–G10.
 * Concurrency is reproduced deterministically: a second connection holds
 * the row locks while the operation under test waits on them.
 *
 * Opt-in: AUTH_TEST_DATABASE_URL + AUTH_TEST_REDIS_URL.
 */
const dbUrl = process.env.AUTH_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
const describeDb = dbUrl && redisUrl ? describe : describe.skip;

const SECRET = 'family-test-secret-family-test-secret-family';
const MEET_REDIRECT = 'https://meet.test/auth/callback';
const PLAN_REDIRECT = 'https://plan.test/auth/oidc/callback/';

function fakeReply() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    cleared: [] as string[],
    code(n: number) {
      this.statusCode = n;
      return this;
    },
    header(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    send(b?: unknown) {
      this.body = b;
      return this;
    },
    clearCookie(name: string) {
      this.cleared.push(name);
      return this;
    },
  };
}

describeDb('suite token families (real Postgres + Redis)', () => {
  let db: Kysely<any>;
  let raw: any; // a second, independent connection to hold locks
  let redis: Redis;
  let ws: string;
  let userRepo: UserRepo;
  let sessionRepo: UserSessionRepo;
  let families: SuiteTokenFamilyRepo;
  let tokens: TokenService;
  let idp: SuiteIdpService;
  let controller: SuiteIdpController;
  let strategy: JwtStrategy;
  const environment: any = {
    getAppSecret: () => SECRET,
    getAppUrl: () => 'https://hub.test',
    isHttps: () => true,
    getAuthCookieSameSite: () => 'none',
    getCookieExpiresIn: () => new Date(Date.now() + 86_400_000),
    getSuiteIdpClientsRaw: () =>
      `conqrmeet|meet-secret|${MEET_REDIRECT};plane|plane-secret|${PLAN_REDIRECT}`,
  };
  const setReuse = (window: number, max = 3) => {
    process.env.SUITE_IDP_REFRESH_REUSE_WINDOW_SECONDS = String(window);
    process.env.SUITE_IDP_REFRESH_MAX_REUSE = String(max);
  };

  async function addUser() {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({
        id,
        email: `${id}@example.test`,
        name: 'U',
        role: 'member',
        workspaceId: ws,
      })
      .execute();
    return userRepo.findById(id, ws);
  }
  async function hubSignIn(user: any) {
    const session = await sessionRepo.insertSession({
      userId: user.id,
      workspaceId: ws,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    return {
      session,
      cookie: await tokens.generateAccessToken(user, session.id),
    };
  }
  /** The full Meet sign-in: authorize with the Hub cookie, then the code exchange. */
  async function suiteSignIn(
    cookie: string,
    client = 'conqrmeet',
    secret = 'meet-secret',
    redirect = MEET_REDIRECT,
  ) {
    const reply = fakeReply();
    await controller.authorize(
      { cookies: { authToken: cookie }, raw: { workspaceId: ws } } as any,
      reply as any,
      {
        client_id: client,
        redirect_uri: redirect,
        response_type: 'code',
        state: 'x',
      },
    );
    const code = new URL(reply.headers.location).searchParams.get('code');
    expect(code).toBeTruthy();
    const tokenReply = fakeReply();
    await controller.token(
      {
        client_id: client,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
      },
      tokenReply as any,
    );
    expect(tokenReply.statusCode).toBe(200);
    return tokenReply.body as { access_token: string; refresh_token: string };
  }
  async function refresh(
    refreshToken: string,
    client = 'conqrmeet',
    secret = 'meet-secret',
  ) {
    const reply = fakeReply();
    await controller.token(
      {
        client_id: client,
        client_secret: secret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      reply as any,
    );
    return reply;
  }
  async function endSession(refreshToken: string) {
    const reply = fakeReply();
    await controller.endSession(
      {
        client_id: 'conqrmeet',
        client_secret: 'meet-secret',
        refresh_token: refreshToken,
      },
      reply as any,
    );
    return reply;
  }
  /** What the API guard does with a suite access token on a given route. */
  async function api(
    accessToken: string,
    method = 'POST',
    url = '/api/ai/meeting',
    body: unknown = {},
  ) {
    const payload = await new JwtService({ secret: SECRET }).verifyAsync(
      accessToken,
    );
    return strategy.validate(
      { raw: { workspaceId: ws, url }, method, body },
      payload,
    );
  }
  const fidOf = (token: string) =>
    (new JwtService({}).decode(token) as any).fid as string;
  const familyRow = (id: string) =>
    db
      .selectFrom('suiteTokenFamilies')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  const events = (fid: string) =>
    db
      .selectFrom('suiteSessionEvents')
      .select(['event', 'reason'])
      .where('familyId', '=', fid)
      .orderBy('id')
      .execute();

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({
        postgres: (postgres as any)(dbUrl, { max: 8 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
    raw = (postgres as any)(dbUrl, { max: 2 });
    redis = new Redis(redisUrl!);
    ws = randomUUID();
    await db.insertInto('workspaces').values({ id: ws, name: 'LTC' }).execute();
    userRepo = new UserRepo(db as any);
    sessionRepo = new UserSessionRepo(db as any);
    families = new SuiteTokenFamilyRepo(db as any);
    const jwt = new JwtService({ secret: SECRET });
    tokens = new TokenService(jwt, environment);
    const validator = new HubSessionValidator(userRepo, sessionRepo);
    idp = new SuiteIdpService(
      jwt,
      environment,
      { getOrThrow: () => redis } as any,
      families,
    );
    controller = new SuiteIdpController(
      idp,
      tokens,
      userRepo,
      environment,
      validator,
    );
    strategy = new JwtStrategy(
      userRepo,
      new WorkspaceRepo(db as any),
      sessionRepo,
      { trackActivity: () => undefined } as any,
      environment,
      {} as any,
      { getOrThrow: () => redis } as any,
      validator,
      families,
    );
  });
  beforeEach(() => {
    setReuse(30, 3);
    delete process.env.SUITE_TOKEN_EPOCH;
    delete process.env.SUITE_IDP_CLIENT_POLICY_MODE;
  });
  afterAll(async () => {
    await redis?.quit();
    await raw?.end();
    await db?.destroy();
  });

  describe('creation and per-request enforcement', () => {
    it('ties a new family to the authorizing Hub session and accepts its access token on Meet routes', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      const fam = await familyRow(fidOf(pair.access_token));
      expect(fam).toMatchObject({
        hubSessionId: session.id,
        clientId: 'conqrmeet',
        state: 'active',
        userId: user.id,
      });
      expect((await events(fam!.id)).map((e) => e.event)).toEqual([
        'family_created',
      ]);
      await expect(api(pair.access_token)).resolves.toMatchObject({
        user: { id: user.id },
      });
    });

    it('G10: refuses a Meet token outside its route profile, and profile writes beyond preferences', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      await expect(
        api(pair.access_token, 'POST', '/api/spaces/delete'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        api(pair.access_token, 'POST', '/api/workspace/invites/create'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        api(pair.access_token, 'POST', '/api/users/update', { theme: 'dark' }),
      ).resolves.toBeTruthy();
      await expect(
        api(pair.access_token, 'POST', '/api/users/update', {
          email: 'x@evil.test',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('G10: a sign-in-only client (Plan) cannot call the Hub API with its token, but userinfo works', async () => {
      const user = await addUser();
      const pair = await suiteSignIn(
        (await hubSignIn(user)).cookie,
        'plane',
        'plane-secret',
        PLAN_REDIRECT,
      );
      await expect(
        api(pair.access_token, 'POST', '/api/ai/meeting'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const reply = fakeReply();
      await controller.userinfo(`Bearer ${pair.access_token}`, reply as any);
      expect(reply.statusCode).toBe(200);
      expect(reply.body.sub).toBe(user.id);
    });
  });

  describe('G1 / I1: every revocation path ends the family, including access tokens already issued', () => {
    const paths: Array<
      [string, (user: any, sessionId: string) => Promise<unknown>]
    > = [
      [
        'Hub logout / device revocation',
        (u, s) => sessionRepo.revokeById(s, u.id, ws),
      ],
      [
        'log out other devices',
        async (u) => {
          const other = await hubSignIn(u);
          return sessionRepo.revokeAllExceptCurrent(other.session.id, u.id, ws);
        },
      ],
      [
        'password change (other sessions deleted)',
        async (u) => {
          const other = await hubSignIn(u);
          return sessionRepo.deleteAllExceptCurrent(other.session.id, u.id, ws);
        },
      ],
      [
        'password reset (all sessions deleted)',
        (u) => sessionRepo.deleteByUserId(u.id, ws),
      ],
      [
        'user deactivation',
        (u) =>
          db
            .updateTable('users')
            .set({ deactivatedAt: new Date() })
            .where('id', '=', u.id)
            .execute(),
      ],
      [
        'user deletion (anonymisation)',
        (u) =>
          db
            .updateTable('users')
            .set({ deletedAt: new Date() })
            .where('id', '=', u.id)
            .execute(),
      ],
      [
        'session cleanup job',
        (u, s) =>
          db
            .updateTable('userSessions')
            .set({ revokedAt: new Date(Date.now() - 30 * 86_400_000) })
            .where('id', '=', s)
            .execute()
            .then(() => sessionRepo.deleteStale(7)),
      ],
    ];

    it.each(paths)('%s', async (_name, revoke) => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      const fid = fidOf(pair.access_token);
      await api(pair.access_token); // live before

      await revoke(user, session.id);

      const fam = await familyRow(fid);
      expect(fam?.state).toBe('revoked');
      await expect(api(pair.access_token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
      // G9: the trail survives even when the session row was deleted.
      expect(
        (await events(fid)).some((e) => e.event === 'family_revoked'),
      ).toBe(true);
    });

    it('I3: reactivating a user does not bring a family back', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      await db
        .updateTable('users')
        .set({ deactivatedAt: new Date() })
        .where('id', '=', user.id)
        .execute();
      await db
        .updateTable('users')
        .set({ deactivatedAt: null })
        .where('id', '=', user.id)
        .execute();
      expect((await familyRow(fidOf(pair.access_token)))?.state).toBe(
        'revoked',
      );
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
    });
  });

  describe('rotation, retry and replay (ADR-HM-001 v3 §4)', () => {
    it('rotates; the previous token inside the window re-issues the CURRENT generation (no branch)', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const r1 = await refresh(pair.refresh_token);
      expect(r1.statusCode).toBe(200);
      const v2 = (new JwtService({}).decode(r1.body.refresh_token) as any).jti;
      // Lost response: the client retries with v1.
      const retry = await refresh(pair.refresh_token);
      expect(retry.statusCode).toBe(200);
      expect(
        (new JwtService({}).decode(retry.body.refresh_token) as any).jti,
      ).toBe(v2);
      // The chain continues normally from v2.
      expect((await refresh(retry.body.refresh_token)).statusCode).toBe(200);
      const evs = (await events(fidOf(pair.access_token))).map((e) => e.event);
      expect(evs).toContain('refresh_reuse_window');
    });

    it('strict rotation (W=0) turns the same lost response into a false logout — why W > 0', async () => {
      setReuse(0);
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      expect((await refresh(pair.refresh_token)).statusCode).toBe(200);
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
      expect((await familyRow(fidOf(pair.access_token)))?.revokedReason).toBe(
        'replay_detected',
      );
    });

    it('a stolen previous token replayed after the window revokes the family (victim and thief out)', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const victim = await refresh(pair.refresh_token);
      await sql`UPDATE suite_token_families SET rotated_at = now() - interval '5 minutes' WHERE id = ${fidOf(pair.access_token)}`.execute(
        db,
      );
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
      expect((await refresh(victim.body.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
      await expect(api(victim.body.access_token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const evs = await events(fidOf(pair.access_token));
      expect(evs.some((e) => e.event === 'refresh_replay_detected')).toBe(true);
    });

    it('an older generation (two back) is a replay even inside the window', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const v2 = await refresh(pair.refresh_token);
      await refresh(v2.body.refresh_token);
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
    });

    it('bounded reuse: the (N+1)th reuse of the previous token is a replay', async () => {
      setReuse(30, 2);
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      await refresh(pair.refresh_token);
      expect((await refresh(pair.refresh_token)).statusCode).toBe(200);
      expect((await refresh(pair.refresh_token)).statusCode).toBe(200);
      expect((await refresh(pair.refresh_token)).body).toEqual({
        error: 'invalid_grant',
      });
    });

    it('concurrent rotations of one token (several BFF processes): no false logout with W=30, N=3', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => refresh(pair.refresh_token)),
      );
      expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
      const jtis = new Set(
        results.map(
          (r) => (new JwtService({}).decode(r.body.refresh_token) as any).jti,
        ),
      );
      expect(jtis.size).toBe(1); // one generation, no branch
      expect((await familyRow(fidOf(pair.access_token)))?.state).toBe('active');
    });

    it('concurrent rotations with strict rotation (W=0) revoke the family', async () => {
      setReuse(0);
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const results = await Promise.all(
        [1, 2].map(() => refresh(pair.refresh_token)),
      );
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
      expect((await familyRow(fidOf(pair.access_token)))?.state).toBe(
        'revoked',
      );
    });
  });

  describe('transactional consistency under concurrent transactions (§3)', () => {
    it('C1: a revocation in progress makes a waiting rotation fail once it commits', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      const reserved = await raw.reserve();
      await reserved`BEGIN`;
      await reserved`UPDATE user_sessions SET revoked_at = now() WHERE id = ${session.id}`;
      const pending = refresh(pair.refresh_token); // blocks on the family row lock
      await new Promise((r) => setTimeout(r, 300));
      await reserved`COMMIT`;
      reserved.release();
      expect((await pending).body).toEqual({ error: 'invalid_grant' });
    });

    it('C2: a rotation holding the row lock commits first; the waiting revocation still revokes its result', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      const fid = fidOf(pair.access_token);
      const reserved = await raw.reserve();
      await reserved`BEGIN`;
      await reserved`SELECT id FROM suite_token_families WHERE id = ${fid} FOR UPDATE`;
      const revocation = sessionRepo.revokeById(session.id, user.id, ws); // trigger waits on the lock
      await new Promise((r) => setTimeout(r, 300));
      await reserved`UPDATE suite_token_families SET previous_jti = current_jti, current_jti = ${randomUUID()}, rotated_at = now() WHERE id = ${fid}`;
      await reserved`COMMIT`;
      reserved.release();
      await revocation;
      expect((await familyRow(fid))?.state).toBe('revoked');
      await expect(api(pair.access_token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('C3: a code exchange racing a logout never leaves an active family behind', async () => {
      const user = await addUser();
      const { session } = await hubSignIn(user);
      const reserved = await raw.reserve();
      await reserved`BEGIN`;
      await reserved`UPDATE user_sessions SET revoked_at = now() WHERE id = ${session.id}`;
      const creating = families.createForSession({
        userId: user.id,
        workspaceId: ws,
        clientId: 'conqrmeet',
        hubSessionId: session.id,
        currentJti: randomUUID(),
        maxLifetimeSeconds: 3600,
      }); // FOR SHARE waits for the revocation
      await new Promise((r) => setTimeout(r, 300));
      await reserved`COMMIT`;
      reserved.release();
      expect(await creating).toBeNull();
    });

    it('C4: a family created just before a logout is revoked by it', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      await sessionRepo.revokeById(session.id, user.id, ws);
      expect((await familyRow(fidOf(pair.access_token)))?.state).toBe(
        'revoked',
      );
    });
  });

  describe('unified logout endpoint (session/end)', () => {
    it('ends the Hub session and every family of it (any client); idempotent; works with a rotated-away token', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const meet = await suiteSignIn(cookie);
      const plan = await suiteSignIn(
        cookie,
        'plane',
        'plane-secret',
        PLAN_REDIRECT,
      );
      await refresh(meet.refresh_token); // the token we hold is now the previous one

      const first = await endSession(meet.refresh_token);
      expect(first.body).toEqual({ state: 'ended' });
      expect(await sessionRepo.findActiveById(session.id)).toBeUndefined();
      expect((await familyRow(fidOf(meet.access_token)))?.state).toBe(
        'revoked',
      );
      expect((await familyRow(fidOf(plan.access_token)))?.state).toBe(
        'revoked',
      );
      expect((await endSession(meet.refresh_token)).body).toEqual({
        state: 'already_ended',
      });

      // G3: the Hub cookie of that browser can no longer mint a suite login.
      const reply = fakeReply();
      await controller.authorize(
        { cookies: { authToken: cookie }, raw: { workspaceId: ws } } as any,
        reply as any,
        {
          client_id: 'conqrmeet',
          redirect_uri: MEET_REDIRECT,
          response_type: 'code',
          state: 'x',
        },
      );
      expect(reply.headers.location).toMatch(/\/login\?redirect=/);
    });

    it("leaves the user's other devices signed in", async () => {
      const user = await addUser();
      const a = await hubSignIn(user);
      const b = await hubSignIn(user);
      const meetA = await suiteSignIn(a.cookie);
      const meetB = await suiteSignIn(b.cookie);
      await endSession(meetA.refresh_token);
      await expect(api(meetB.access_token)).resolves.toBeTruthy();
      expect(await sessionRepo.findActiveById(b.session.id)).toBeTruthy();
    });

    it("refuses another client's secret", async () => {
      const user = await addUser();
      const meet = await suiteSignIn((await hubSignIn(user)).cookie);
      const reply = fakeReply();
      await controller.endSession(
        {
          client_id: 'plane',
          client_secret: 'plane-secret',
          refresh_token: meet.refresh_token,
        },
        reply as any,
      );
      expect(reply.statusCode).toBe(400);
    });
  });

  describe('failure behaviour and recovery', () => {
    it('G5: unreadable family state is a 503, never an acceptance', async () => {
      const user = await addUser();
      const pair = await suiteSignIn((await hubSignIn(user)).cookie);
      const broken = new JwtStrategy(
        userRepo,
        new WorkspaceRepo(db as any),
        sessionRepo,
        { trackActivity: () => undefined } as any,
        environment,
        {} as any,
        { getOrThrow: () => redis } as any,
        new HubSessionValidator(userRepo, sessionRepo),
        {
          findForRequest: async () => {
            throw new Error('connection refused');
          },
        } as any,
      );
      const payload = await new JwtService({ secret: SECRET }).verifyAsync(
        pair.access_token,
      );
      await expect(
        broken.validate(
          { raw: { workspaceId: ws, url: '/api/ai/meeting' }, method: 'POST' },
          payload,
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('G8: after a restore + epoch bump, a family that the restore brought back is refused', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      // The restore resurrects an active family and a live session row…
      expect((await familyRow(fidOf(pair.access_token)))?.state).toBe('active');
      // …the procedure bumps the epochs (env, outside the restored database).
      process.env.SUITE_TOKEN_EPOCH = '1';
      process.env.HUB_SESSION_EPOCH = '1';
      try {
        await expect(api(pair.access_token)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect((await refresh(pair.refresh_token)).body).toEqual({
          error: 'invalid_grant',
        });
        const reply = fakeReply();
        await controller.authorize(
          { cookies: { authToken: cookie }, raw: { workspaceId: ws } } as any,
          reply as any,
          {
            client_id: 'conqrmeet',
            redirect_uri: MEET_REDIRECT,
            response_type: 'code',
            state: 'x',
          },
        );
        expect(reply.headers.location).toMatch(/\/login\?redirect=/);
        expect(await sessionRepo.findActiveById(session.id)).toBeTruthy(); // the row itself still looks live
      } finally {
        delete process.env.SUITE_TOKEN_EPOCH;
        delete process.env.HUB_SESSION_EPOCH;
      }
    });

    it('refuses legacy refresh tokens without a family (one-time re-sign-in)', async () => {
      const legacy = new JwtService({ secret: SECRET }).sign(
        {
          sub: randomUUID(),
          workspaceId: ws,
          aud: 'conqr-suite-idp-refresh',
          client_id: 'conqrmeet',
          jti: randomUUID(),
        },
        { expiresIn: 3600 },
      );
      expect((await refresh(legacy)).body).toEqual({ error: 'invalid_grant' });
    });

    it('retention purge drops long-dead families and old events', async () => {
      const user = await addUser();
      const { session, cookie } = await hubSignIn(user);
      const pair = await suiteSignIn(cookie);
      const fid = fidOf(pair.access_token);
      await sessionRepo.revokeById(session.id, user.id, ws);
      await sql`UPDATE suite_token_families SET revoked_at = now() - interval '40 days' WHERE id = ${fid}`.execute(
        db,
      );
      await sql`UPDATE suite_session_events SET occurred_at = now() - interval '500 days' WHERE family_id = ${fid}`.execute(
        db,
      );
      await families.purge(30, 400);
      expect(await familyRow(fid)).toBeUndefined();
      expect(await events(fid)).toEqual([]);
    });
  });
});
