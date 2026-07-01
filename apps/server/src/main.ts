import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { TransformHttpResponseInterceptor } from './common/interceptors/http-response.interceptor';
import { WsRedisIoAdapter } from './ws/adapter/ws-redis.adapter';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyIp from 'fastify-ip';
import { InternalLogFilter } from './common/logger/internal-log-filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      routerOptions: {
        maxParamLength: 1000,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
    }),
    {
      rawBody: true,
      // captures NestJS internal errors
      logger: new InternalLogFilter(),
      // bufferLogs must be false else pino will fail
      // to log OnApplicationBootstrap logs
      bufferLogs: false,
    },
  );

  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api', {
    exclude: [
      'robots.txt',
      'share/:shareId/p/:pageSlug',
      'mcp',
      // MCP OAuth: discovery + endpoints must be served at the bare origin.
      '.well-known/oauth-authorization-server',
      '.well-known/oauth-protected-resource',
      '.well-known/oauth-protected-resource/mcp',
      '.well-known/openid-configuration',
      'oauth/register',
      'oauth/authorize',
      'oauth/authorize/consent',
      'oauth/token',
      'oauth/revoke',
    ],
  });

  const reflector = app.get(Reflector);
  const redisIoAdapter = new WsRedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.register(fastifyIp);
  await app.register(fastifyMultipart);
  await app.register(fastifyCookie);

  // NOTE: the OAuth token/consent/register endpoints receive
  // `application/x-www-form-urlencoded` bodies (RFC 6749 §4.1.3). We do NOT
  // register a parser for it here — @nestjs/platform-fastify already registers
  // `@fastify/formbody`, which parses that content type into a plain object for
  // `@Body()`. Adding our own throws FST_ERR_CTP_ALREADY_PRESENT and crashes
  // bootstrap.

  app
    .getHttpAdapter()
    .getInstance()
    .decorateReply('setHeader', function (name: string, value: unknown) {
      this.header(name, value);
    })
    .decorateReply('end', function () {
      this.send('');
    })
    .addHook('preHandler', function (req, reply, done) {
      // don't require workspaceId for the following paths
      const excludedPaths = [
        '/api/auth/setup',
        '/api/health',
        '/api/billing/stripe/webhook',
        '/api/workspace/check-hostname',
        '/api/sso/google',
        '/api/workspace/create',
        '/api/workspace/joined',
        '/api/workspace/find-by-email',
      ];

      if (
        req.originalUrl.startsWith('/api') &&
        !excludedPaths.some((path) => req.originalUrl.startsWith(path))
      ) {
        if (!req.raw?.['workspaceId'] && req.originalUrl !== '/api') {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  // Lock CORS to the configured app origin (and its subdomains when
  // SUBDOMAIN_HOST is set). The previous wide-open `origin: *` with
  // credentialed cookies allowed any site to ride a logged-in session.
  //
  // Fail-open guard: if APP_URL is missing/unparseable in production we
  // log a loud warning and accept any origin rather than hard-rejecting
  // every browser request. A misconfigured prod that 100%-blocks users is
  // a worse outcome than a misconfigured prod that's permissive — the
  // operator gets a clear log line to fix the env var.
  const corsLogger = new Logger('CORS');
  const rawAppUrl = process.env.APP_URL;
  let allowedOrigin: string | null = null;
  if (rawAppUrl) {
    try {
      allowedOrigin = new URL(rawAppUrl).origin;
    } catch {
      corsLogger.warn(
        `APP_URL is set but unparseable: "${rawAppUrl}". CORS is permissive — fix APP_URL.`,
      );
    }
  } else {
    corsLogger.warn(
      'APP_URL is not set. CORS is permissive — set APP_URL to lock down origins.',
    );
  }
  const subdomainHost = process.env.SUBDOMAIN_HOST;
  app.enableCors({
    credentials: true,
    origin: (origin, cb) => {
      // Same-origin (Postman, curl, server-to-server) requests come with
      // no Origin header — allow those.
      if (!origin) return cb(null, true);
      // Fail-open: no parseable APP_URL → accept any origin.
      if (!allowedOrigin) return cb(null, true);
      if (origin === allowedOrigin) return cb(null, true);
      if (subdomainHost) {
        try {
          const host = new URL(origin).host;
          if (host === subdomainHost || host.endsWith('.' + subdomainHost)) {
            return cb(null, true);
          }
        } catch {
          /* fall through */
        }
      }
      return cb(new Error('Origin not allowed by CORS'), false);
    },
  });
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(reflector));
  app.enableShutdownHooks();

  const logger = new Logger('NestApplication');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`UnhandledRejection, reason: ${reason}`, promise);
  });

  process.on('uncaughtException', (error) => {
    logger.error('UncaughtException:', error);
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host, () => {
    logger.log(
      `Listening on http://127.0.0.1:${port} / ${process.env.APP_URL}`,
    );
  });
}

bootstrap();
