import { Kysely, CamelCasePlugin } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SuiteTokenFamilyRepo } from '@docmost/db/repos/auth/suite-token-family.repo';
import { TokenService } from './services/token.service';
import { HubSessionValidator } from './services/hub-session-validator.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SuiteIdpService } from './idp/suite-idp.service';
import { SuiteIdpController } from './idp/suite-idp.controller';
import { AuthController } from './auth.controller';
import { SessionService } from '../session/session.service';
import { JwtType } from './dto/jwt-payload';

/**
 * Revocation of Hub sessions against a REAL Postgres and Redis: the API guard
 * (with its Redis cache), the suite IdP authorize endpoint and logout.
 *
 * Opt-in: set AUTH_TEST_DATABASE_URL (migrated database) and
 * AUTH_TEST_REDIS_URL; otherwise the suite is skipped.
 */
const dbUrl = process.env.AUTH_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
const describeDb = dbUrl && redisUrl ? describe : describe.skip;

const SECRET = 'integration-test-secret-integration-test-secret';
const MEET_REDIRECT = 'https://meet.test/auth/callback';

function fakeReply() {
  const reply: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    cleared: [] as string[],
    set: [] as string[],
    body: undefined,
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
    setCookie(name: string) {
      this.set.push(name);
      return this;
    },
  };
  return reply;
}

describeDb('Hub session revocation (real Postgres + Redis)', () => {
  let db: Kysely<any>;
  let redis: Redis;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userRepo: UserRepo;
  let sessionRepo: UserSessionRepo;
  let tokens: TokenService;
  let validator: HubSessionValidator;
  let strategy: JwtStrategy;
  let idpController: SuiteIdpController;
  let authController: AuthController;
  const environment: any = {
    getAppSecret: () => SECRET,
    getAppUrl: () => 'https://hub.test',
    isHttps: () => true,
    getAuthCookieSameSite: () => 'none',
    getCookieExpiresIn: () => new Date(Date.now() + 86_400_000),
    getSuiteIdpClientsRaw: () => `conqrmeet|meet-secret|${MEET_REDIRECT}`,
    isCloud: () => false,
  };

  async function addUser(ws = workspaceId) {
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

  async function signIn(user: any) {
    const session = await sessionRepo.insertSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const token = await tokens.generateAccessToken(user, session.id);
    return { session, token };
  }

  const validate = (token: string, ws = workspaceId) =>
    tokens
      .verifyJwt(token, JwtType.ACCESS)
      .then((payload) =>
        strategy.validate({ raw: { workspaceId: ws } }, payload),
      );

  const authorize = (token?: string, ws = workspaceId) => {
    const reply = fakeReply();
    return idpController
      .authorize(
        {
          cookies: token ? { authToken: token } : {},
          raw: { workspaceId: ws },
        } as any,
        reply,
        {
          client_id: 'conqrmeet',
          redirect_uri: MEET_REDIRECT,
          response_type: 'code',
          state: 's1',
        },
      )
      .then(() => reply);
  };

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({
        postgres: (postgres as any)(dbUrl, { max: 5 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
    redis = new Redis(redisUrl!);
    workspaceId = randomUUID();
    otherWorkspaceId = randomUUID();
    await db
      .insertInto('workspaces')
      .values([
        { id: workspaceId, name: 'LTC' },
        { id: otherWorkspaceId, name: 'Autre' },
      ])
      .execute();

    userRepo = new UserRepo(db as any);
    sessionRepo = new UserSessionRepo(db as any);
    const jwt = new JwtService({ secret: SECRET });
    tokens = new TokenService(jwt, environment);
    validator = new HubSessionValidator(userRepo, sessionRepo);
    strategy = new JwtStrategy(
      userRepo,
      new WorkspaceRepo(db as any),
      sessionRepo,
      { trackActivity: () => undefined } as any,
      environment,
      {} as any,
      { getOrThrow: () => redis } as any,
      validator,
      new SuiteTokenFamilyRepo(db as any),
    );
    const idp = new SuiteIdpService(
      jwt,
      environment,
      { getOrThrow: () => redis } as any,
      new SuiteTokenFamilyRepo(db as any),
    );
    idpController = new SuiteIdpController(
      idp,
      tokens,
      userRepo,
      environment,
      validator,
    );
    const sessions = new SessionService(tokens, sessionRepo, environment, {
      get: () => undefined,
    } as any);
    authController = new AuthController(
      {} as any,
      sessions,
      environment,
      {} as any,
      { log: () => undefined } as any,
      tokens,
    );
  });

  afterAll(async () => {
    await redis?.quit();
    await db?.destroy();
  });

  describe('API guard (JwtStrategy)', () => {
    it('accepts a live session, then refuses it right after revocation even with a warm cache', async () => {
      const user = await addUser();
      const { session, token } = await signIn(user);
      await expect(validate(token)).resolves.toMatchObject({
        user: { id: user.id },
      });
      await expect(validate(token)).resolves.toBeTruthy(); // served from the Redis cache
      await sessionRepo.revokeById(session.id, user.id, workspaceId);
      await expect(validate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a deactivated user whose sessions were revoked in the same transaction', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      await validate(token);
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('users')
          .set({ deactivatedAt: new Date() })
          .where('id', '=', user.id)
          .execute();
        await sessionRepo.revokeByUserId(user.id, workspaceId, trx as any);
      });
      await expect(validate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a token minted for another workspace', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      await expect(validate(token, otherWorkspaceId)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('reports an unreadable session store as 503, never as a logout', async () => {
      const broken = new UserSessionRepo({
        selectFrom: () => {
          throw new Error('connection refused');
        },
      } as any);
      const brokenValidator = new HubSessionValidator(userRepo, broken);
      await expect(
        brokenValidator.assertSessionActive({
          sub: 'u',
          workspaceId,
          sessionId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('suite IdP authorize', () => {
    it('issues a code for a live session', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      const reply = await authorize(token);
      expect(reply.statusCode).toBe(302);
      const location = new URL(reply.headers.location);
      expect(location.origin + location.pathname).toBe(MEET_REDIRECT);
      expect(location.searchParams.get('code')).toBeTruthy();
      expect(location.searchParams.get('state')).toBe('s1');
    });

    it('never issues a code for a revoked session: it clears the cookie and sends the user to sign in', async () => {
      const user = await addUser();
      const { session, token } = await signIn(user);
      await sessionRepo.revokeById(session.id, user.id, workspaceId);
      const reply = await authorize(token);
      expect(reply.statusCode).toBe(302);
      expect(reply.headers.location).toMatch(
        /^https:\/\/hub\.test\/login\?redirect=/,
      );
      expect(reply.headers.location).not.toContain('code=');
      expect(reply.cleared).toContain('authToken');
    });

    it('refuses a session whose row was deleted (password reset elsewhere)', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      await sessionRepo.deleteByUserId(user.id, workspaceId);
      const reply = await authorize(token);
      expect(reply.headers.location).toMatch(/\/login\?redirect=/);
    });

    it('refuses a token from another workspace and a legacy token without a session id', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      expect(
        (await authorize(token, otherWorkspaceId)).headers.location,
      ).toMatch(/\/login\?/);
      const legacy = await new JwtService({ secret: SECRET }).signAsync({
        sub: user.id,
        email: user.email,
        workspaceId,
        type: 'access',
      });
      expect((await authorize(legacy)).headers.location).toMatch(/\/login\?/);
    });
  });

  describe('logout', () => {
    it('ends the session and clears the cookie', async () => {
      const user = await addUser();
      const { session, token } = await signIn(user);
      const reply = fakeReply();
      await authController.logout(
        { cookies: { authToken: token }, raw: { workspaceId } } as any,
        reply,
        {},
      );
      expect(reply.cleared).toContain('authToken');
      expect(await sessionRepo.findActiveById(session.id)).toBeUndefined();
    });

    it('still clears the cookie of an already revoked session (no stale cookie left behind)', async () => {
      const user = await addUser();
      const { session, token } = await signIn(user);
      await sessionRepo.revokeById(session.id, user.id, workspaceId);
      const reply = fakeReply();
      await authController.logout(
        { cookies: { authToken: token }, raw: { workspaceId } } as any,
        reply,
        {},
      );
      expect(reply.cleared).toContain('authToken');
    });

    it('logs out every device when asked', async () => {
      const user = await addUser();
      const a = await signIn(user);
      const b = await signIn(user);
      const reply = fakeReply();
      await authController.logout(
        { cookies: { authToken: a.token }, raw: { workspaceId } } as any,
        reply,
        { allDevices: true },
      );
      expect(await sessionRepo.findActiveById(a.session.id)).toBeUndefined();
      expect(await sessionRepo.findActiveById(b.session.id)).toBeUndefined();
    });

    it('fails with 503 and keeps the cookie when the revocation cannot be recorded', async () => {
      const user = await addUser();
      const { token } = await signIn(user);
      const failing = new AuthController(
        {} as any,
        {
          revokeSession: async () => {
            throw new Error('db down');
          },
        } as any,
        environment,
        {} as any,
        { log: () => undefined } as any,
        tokens,
      );
      const reply = fakeReply();
      await expect(
        failing.logout(
          { cookies: { authToken: token }, raw: { workspaceId } } as any,
          reply,
          {},
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(reply.cleared).toEqual([]);
    });
  });
});
