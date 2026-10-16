import type { FastifyReply, FastifyRequest } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export const AUTH_COOKIE = 'authToken';

function cookieAttributes(environment: EnvironmentService) {
  return {
    httpOnly: true,
    sameSite: environment.getAuthCookieSameSite(),
    path: '/',
    secure: environment.isHttps(),
  };
}

export function setAuthCookie(
  res: FastifyReply,
  environment: EnvironmentService,
  token: string,
): void {
  res.setCookie(AUTH_COOKIE, token, {
    ...cookieAttributes(environment),
    expires: environment.getCookieExpiresIn(),
  });
}

/**
 * Expires the session cookie with the same attributes it was set with.
 * Browsers only replace a cookie whose name, path and domain match, and a
 * `SameSite=None` cookie can only be overwritten by a `Secure` Set-Cookie.
 */
export function clearAuthCookie(
  res: FastifyReply,
  environment: EnvironmentService,
): void {
  res.clearCookie(AUTH_COOKIE, cookieAttributes(environment));
}

/** True when the request authenticates with the session cookie, not a Bearer. */
export function usesAuthCookie(req: FastifyRequest): boolean {
  return Boolean((req as any).cookies?.[AUTH_COOKIE]);
}
