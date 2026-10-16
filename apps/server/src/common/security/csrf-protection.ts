import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '@nestjs/common';
import { AllowedOrigins, originOf } from './allowed-origins';

/**
 * Cross-site request forgery protection for cookie-authenticated requests.
 *
 * On HTTPS the session cookie is `SameSite=None` (the suite embeds Hub pages
 * in cross-site frames), so the browser attaches it to cross-site requests
 * and SameSite gives no protection. Hub also parses form-encoded and
 * multipart bodies, which a hostile page can submit without a preflight.
 *
 * Layered check for unsafe methods (OWASP CSRF Prevention):
 *  1. Fetch Metadata: `Sec-Fetch-Site: same-origin` (or `none`, a
 *     user-initiated navigation) is accepted; `same-site` / `cross-site` is
 *     accepted only from an allow-listed origin.
 *  2. When the browser sends no Fetch Metadata, `Origin` (else `Referer`)
 *     must be this server's own origin or an allow-listed one.
 *  3. Requests carrying neither are not from a browser that could have been
 *     tricked (browsers always send Origin on cross-origin POSTs) and pass.
 *
 * The check applies when the request rides the session cookie (and carries
 * no Authorization header — Bearer clients such as the ConqrMeet BFF are not
 * cookie-authenticated and cannot be forged by a third-party page), and to
 * the unauthenticated sign-in endpoints, where a forged request would sign
 * the victim into the attacker's account (login CSRF).
 */

export type CsrfMode = 'enforce' | 'report';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Public, cross-origin-by-design OAuth/MCP endpoints. They authenticate the
 * client (secret, PKCE, Bearer), never the session cookie, so a cookie that
 * happens to ride along grants nothing and must not break them.
 */
const CLIENT_AUTHENTICATED_PATHS = [
  '/oauth/token',
  '/oauth/register',
  '/oauth/revoke',
  '/api/idp/token',
  '/mcp',
];

/** Unauthenticated endpoints that establish a session (login CSRF). */
const SESSION_ESTABLISHING_PATHS = [
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/password-reset',
  '/api/auth/forgot-password',
  '/api/workspace/invites/accept',
];

export interface CsrfInput {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  /** `scheme://host` this request was addressed to. */
  requestOrigin: string | null;
  hasSessionCookie: boolean;
}

export type CsrfDecision =
  | { allowed: true; checked: boolean }
  | { allowed: false; reason: string };

function header(input: CsrfInput, name: string): string | undefined {
  const value = input.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function matchesPath(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + '/'));
}

export function evaluateCsrf(
  input: CsrfInput,
  origins: AllowedOrigins,
): CsrfDecision {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) {
    return { allowed: true, checked: false };
  }
  const path = input.path.split('?')[0];
  if (matchesPath(path, CLIENT_AUTHENTICATED_PATHS)) {
    return { allowed: true, checked: false };
  }
  const cookieAuthenticated =
    input.hasSessionCookie && !header(input, 'authorization');
  const establishesSession = matchesPath(path, SESSION_ESTABLISHING_PATHS);
  if (!cookieAuthenticated && !establishesSession) {
    return { allowed: true, checked: false };
  }

  const trusted = (origin: string | null) =>
    !!origin &&
    (origin === input.requestOrigin ||
      origin === origins.appOrigin ||
      origins.isAllowed(origin));

  const site = header(input, 'sec-fetch-site')?.toLowerCase();
  const origin = originOf(header(input, 'origin'));
  if (site) {
    if (site === 'same-origin' || site === 'none') {
      return { allowed: true, checked: true };
    }
    if (trusted(origin)) return { allowed: true, checked: true };
    return { allowed: false, reason: `sec-fetch-site=${site}` };
  }

  const claimed = origin ?? originOf(header(input, 'referer'));
  if (!claimed) return { allowed: true, checked: true };
  if (trusted(claimed)) return { allowed: true, checked: true };
  return { allowed: false, reason: `origin=${claimed}` };
}

export function csrfModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CsrfMode {
  return env.CSRF_PROTECTION_MODE === 'report' ? 'report' : 'enforce';
}

/** The origin a request was addressed to, as the proxy reports it. */
function requestOriginOf(req: FastifyRequest): string | null {
  const host = req.headers.host;
  if (!host) return null;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
      ?.split(',')[0]
      .trim() || req.protocol;
  return `${proto}://${host}`;
}

export function registerCsrfProtection(
  app: FastifyInstance,
  origins: AllowedOrigins,
  mode: CsrfMode,
): void {
  const logger = new Logger('CsrfProtection');
  if (mode === 'report') {
    logger.warn(
      'CSRF_PROTECTION_MODE=report: forged requests are logged, NOT blocked.',
    );
  }
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const decision = evaluateCsrf(
      {
        method: req.method,
        path: req.url,
        headers: req.headers,
        requestOrigin: requestOriginOf(req),
        hasSessionCookie: /(?:^|;\s*)authToken=/.test(req.headers.cookie ?? ''),
      },
      origins,
    );
    if (decision.allowed) return;
    const { reason } = decision as { reason: string };
    const path = req.url.split('?')[0];
    if (mode === 'report') {
      logger.warn(
        `Cross-site request would be refused: ${req.method} ${path} (${reason})`,
      );
      return;
    }
    logger.warn(
      `Cross-site request refused: ${req.method} ${path} (${reason})`,
    );
    return reply
      .code(403)
      .header('Cache-Control', 'no-store')
      .send({ statusCode: 403, message: 'Cross-site request refused' });
  });
}
