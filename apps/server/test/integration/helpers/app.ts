/**
 * Boots the real ConqrHub Nest application (Fastify, real PostgreSQL, real Redis) for HTTP
 * integration tests. Mirrors the parts of `src/main.ts` that affect authentication: global
 * `api` prefix with the bare-origin exclusions, cookie plugin, validation pipe and response
 * interceptor. The workspace-required pre-handler is intentionally not replicated (it only
 * turns "no workspace yet" into a 404 and would hide the behaviour under test).
 *
 * Environment is synthetic. `DATABASE_URL` / `REDIS_URL` come from the test environment (Railway
 * security-lab services or local defaults); `APP_SECRET` is a fixed test value unless provided. Nothing here reaches a production system.
 */
import 'reflect-metadata';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import fastifyCookie from '@fastify/cookie';
import Redis from 'ioredis';
import * as supertest from 'supertest';

export const TEST_HOST = 'hub.test';

export const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  APP_URL: `http://${TEST_HOST}`,
  APP_SECRET: process.env.APP_SECRET ?? 'ci-only-app-secret-0123456789abcdef0123456789abcdef',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://hub:hub_ci_password@127.0.0.1:5432/hub_ci',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  STORAGE_DRIVER: 'local',
  MAIL_DRIVER: 'log',
  DISABLE_TELEMETRY: 'true',
};

export interface TestApp {
  app: INestApplication;
  server: any;
  redis: Redis;
  get<T>(token: any): T;
  close(): Promise<void>;
}

const GLOBAL_PREFIX_EXCLUDE = [
  'robots.txt',
  'share/:shareId/p/:pageSlug',
  'mcp',
  '.well-known/oauth-authorization-server',
  '.well-known/oauth-protected-resource',
  '.well-known/oauth-protected-resource/mcp',
  '.well-known/openid-configuration',
  'oauth/register',
  'oauth/authorize',
  'oauth/authorize/consent',
  'oauth/token',
  'oauth/revoke',
];

export async function bootTestApp(extraEnv: Record<string, string> = {}): Promise<TestApp> {
  Object.assign(process.env, BASE_ENV, extraEnv);
  // Imported after the environment is set: ConfigModule validation runs at module evaluation.
  const { AppModule } = await import('../../../src/app.module');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { TransformHttpResponseInterceptor } = await import(
    '../../../src/common/interceptors/http-response.interceptor'
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<any>(
    new FastifyAdapter({
      trustProxy: true,
      routerOptions: { maxParamLength: 1000, ignoreTrailingSlash: true, ignoreDuplicateSlashes: true },
    }),
    { rawBody: true, bufferLogs: false },
  );
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
  await app.register(fastifyCookie);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, stopAtFirstError: true, transform: true }));
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(app.get(Reflector)));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const redis = new Redis(process.env.REDIS_URL as string, { lazyConnect: false });
  return {
    app,
    server: app.getHttpServer(),
    redis,
    get: (token) => app.get(token),
    close: async () => {
      redis.disconnect();
      await app.close();
    },
  };
}

/** supertest agent that always sends the canonical test Host header. */
export function http(server: any) {
  const agent = supertest(server);
  const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (url: string) =>
    (agent as any)[m](url).set('Host', TEST_HOST);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

/** Extract a cookie value from a Set-Cookie header array. */
export function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of arr) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m) return m[1];
  }
  return undefined;
}

/** Return the raw Set-Cookie entry for a cookie name (to inspect attributes). */
export function cookieHeader(setCookie: string[] | string | undefined, name: string): string | undefined {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.find((c) => c.startsWith(`${name}=`));
}

export function decodeJwtPayload<T = any>(jwt: string): T {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

/** Record a minted secret so the CI log-leak scan can assert it never appears in output. */
export function recordMintedToken(token: string): void {
  const file = join(__dirname, '..', '.minted-tokens');
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, token + '\n');
}

/** Truncate the Hub database between suites (order respects foreign keys) and flush Redis. */
export async function resetDatabase(testApp: TestApp): Promise<void> {
  const { sql } = await import('kysely');
  const { KYSELY_MODULE_CONNECTION_TOKEN } = await import('nestjs-kysely');
  const db: any = testApp.get(KYSELY_MODULE_CONNECTION_TOKEN);
  await sql`DO $$ DECLARE r RECORD; BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('kysely_migration','kysely_migration_lock')) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP; END $$;`.execute(db);
  await testApp.redis.flushdb();
}

export const ADMIN = {
  name: 'CI Admin',
  email: 'ci-admin@hub.test',
  password: 'Ci-Admin-Passw0rd!',
  workspaceName: 'CI Workspace',
};

/** First-run setup: creates the workspace + owner and returns the session cookie. */
export async function setupWorkspace(testApp: TestApp): Promise<{ cookie: string; token: string }> {
  const res = await http(testApp.server).post('/api/auth/setup').send(ADMIN);
  if (res.status !== 200) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = cookieValue(res.headers['set-cookie'], 'authToken');
  if (!token) throw new Error('setup did not set authToken');
  recordMintedToken(token);
  return { cookie: `authToken=${token}`, token };
}

export async function login(testApp: TestApp, email: string, password: string): Promise<{ cookie: string; token: string }> {
  const res = await http(testApp.server).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = cookieValue(res.headers['set-cookie'], 'authToken');
  if (!token) throw new Error('login did not set authToken');
  recordMintedToken(token);
  return { cookie: `authToken=${token}`, token };
}
