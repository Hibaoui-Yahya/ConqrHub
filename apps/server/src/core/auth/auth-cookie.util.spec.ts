import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthTokenCookie,
  setAuthTokenCookie,
} from './auth-cookie.util';
import { jwtAuthCacheKey } from './auth-cache.util';

/** F29 — the cookie is cleared with exactly the attributes it was set with. */
function fakeReply() {
  return {
    setCookie: jest.fn(),
    clearCookie: jest.fn(),
  } as any;
}

const expires = new Date('2030-01-01T00:00:00Z');
const httpsEnv = { getAuthCookieSameSite: () => 'none' as const, isHttps: () => true, getCookieExpiresIn: () => expires };
const httpEnv = { getAuthCookieSameSite: () => 'lax' as const, isHttps: () => false, getCookieExpiresIn: () => expires };

describe('auth cookie helpers (F29)', () => {
  it.each([
    ['https', httpsEnv],
    ['http', httpEnv],
  ])('clear uses the same attributes as set (%s)', (_n, env) => {
    const res = fakeReply();
    setAuthTokenCookie(res, 'tok', env);
    clearAuthTokenCookie(res, env);

    expect(res.setCookie).toHaveBeenCalledTimes(1);
    const [setName, setValue, setOpts] = res.setCookie.mock.calls[0];
    const [clearName, clearOpts] = res.clearCookie.mock.calls[0];
    expect(setName).toBe(AUTH_COOKIE_NAME);
    expect(clearName).toBe(AUTH_COOKIE_NAME);
    expect(setValue).toBe('tok');
    // Every attribute used on set (other than the expiry) is repeated on clear.
    const { expires: _e, ...setAttrs } = setOpts;
    expect(clearOpts).toEqual(setAttrs);
    expect(clearOpts).toEqual(authCookieOptions(env));
    expect(setOpts.expires).toBe(expires);
  });

  it('derives Secure and SameSite from the environment', () => {
    expect(authCookieOptions(httpsEnv)).toEqual({ httpOnly: true, sameSite: 'none', path: '/', secure: true });
    expect(authCookieOptions(httpEnv)).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
  });
});

describe('jwtAuthCacheKey (F29)', () => {
  it('matches the key format the JWT strategy caches under', () => {
    expect(jwtAuthCacheKey('ws1', 's1')).toBe('jwt:auth:ws1:s1');
  });
});
