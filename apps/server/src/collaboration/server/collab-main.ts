import { NestFactory, Reflector } from '@nestjs/core';
import { CollabAppModule } from './collab-app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { InternalLogFilter } from '../../common/logger/internal-log-filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    CollabAppModule,
    new FastifyAdapter({
      routerOptions: {
        maxParamLength: 1000,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
    }),
    {
      logger: new InternalLogFilter(),
      bufferLogs: false,
    },
  );

  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Fail-open guard: if APP_URL is missing/unparseable, log loudly and
  // accept any origin rather than locking out every browser connecting
  // to the collab WebSocket. See main.ts for the rationale.
  const corsLogger = new Logger('CollabCORS');
  const rawAppUrl = process.env.APP_URL;
  let allowedOrigin: string | null = null;
  if (rawAppUrl) {
    try {
      allowedOrigin = new URL(rawAppUrl).origin;
    } catch {
      corsLogger.warn(
        `APP_URL is set but unparseable: "${rawAppUrl}". Collab CORS is permissive.`,
      );
    }
  } else {
    corsLogger.warn(
      'APP_URL is not set. Collab CORS is permissive — set APP_URL to lock down origins.',
    );
  }
  const subdomainHost = process.env.SUBDOMAIN_HOST;
  app.enableCors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
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

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(reflector));
  app.enableShutdownHooks();

  const logger = new Logger('CollabServer');

  const port = process.env.COLLAB_PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host, () => {
    logger.log(`Listening on http://127.0.0.1:${port}`);
  });
}

bootstrap();
