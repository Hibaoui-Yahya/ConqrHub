import type { FastifyReply } from 'fastify';
import type { EnvironmentService } from '../../integrations/environment/environment.service';

/**
 * Single source of truth for the session cookie (F29). Every place that sets
 * the cookie and every place that clears it goes through these helpers so the
 * clear always uses the exact attributes the set used — a `clearCookie` with
 * different `path`/`sameSite`/`secure` attributes does not remove the cookie
 * in browsers.
 */
export const AUTH_COOKIE_NAME = 'authToken';

export type AuthCookieEnv = Pick<
  EnvironmentService,
  'getAuthCookieSameSite' | 'isHttps' | 'getCookieExpiresIn'
>;

export function authCookieOptions(env: AuthCookieEnv) {
  return {
    httpOnly: true,
    sameSite: env.getAuthCookieSameSite(),
    path: '/',
    secure: env.isHttps(),
  } as const;
}

export function setAuthTokenCookie(
  res: FastifyReply,
  token: string,
  env: AuthCookieEnv,
): void {
  res.setCookie(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions(env),
    expires: env.getCookieExpiresIn(),
  });
}

export function clearAuthTokenCookie(res: FastifyReply, env: AuthCookieEnv): void {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions(env));
}
