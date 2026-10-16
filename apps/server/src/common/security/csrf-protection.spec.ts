import { allowedOriginsFromEnv } from './allowed-origins';
import { CsrfInput, evaluateCsrf } from './csrf-protection';

const origins = allowedOriginsFromEnv({
  APP_URL: 'https://ltc.conqrhub.com',
  CORS_ALLOWED_ORIGINS: 'https://plan.example.com',
} as NodeJS.ProcessEnv);

function req(
  over: Partial<CsrfInput> & { headers?: CsrfInput['headers'] } = {},
): CsrfInput {
  return {
    method: 'POST',
    path: '/api/workspace/invites/create',
    requestOrigin: 'https://ltc.conqrhub.com',
    hasSessionCookie: true,
    ...over,
    headers: over.headers ?? {},
  };
}

describe('evaluateCsrf', () => {
  it('refuses a cross-site, cookie-authenticated form post (the forged admin invite)', () => {
    const d = evaluateCsrf(
      req({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'https://evil.example',
        },
      }),
      origins,
    );
    expect(d.allowed).toBe(false);
  });

  it('accepts the Hub SPA itself (same-origin fetch metadata)', () => {
    expect(
      evaluateCsrf(
        req({ headers: { 'sec-fetch-site': 'same-origin' } }),
        origins,
      ),
    ).toEqual({
      allowed: true,
      checked: true,
    });
  });

  it('accepts an allow-listed sibling product (CORS_ALLOWED_ORIGINS) calling cross-site', () => {
    const d = evaluateCsrf(
      req({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'https://plan.example.com',
        },
      }),
      origins,
    );
    expect(d.allowed).toBe(true);
  });

  it('refuses same-site requests from an origin that is not allow-listed', () => {
    const d = evaluateCsrf(
      req({
        headers: {
          'sec-fetch-site': 'same-site',
          origin: 'https://other.conqrhub.com',
        },
      }),
      origins,
    );
    expect(d.allowed).toBe(false);
  });

  it('falls back to Origin, then Referer, when the browser sends no fetch metadata', () => {
    expect(
      evaluateCsrf(
        req({ headers: { origin: 'https://evil.example' } }),
        origins,
      ).allowed,
    ).toBe(false);
    expect(
      evaluateCsrf(
        req({ headers: { referer: 'https://evil.example/x' } }),
        origins,
      ).allowed,
    ).toBe(false);
    expect(
      evaluateCsrf(
        req({ headers: { origin: 'https://ltc.conqrhub.com' } }),
        origins,
      ).allowed,
    ).toBe(true);
  });

  it('lets non-browser clients without Origin through (they cannot be forged by a page)', () => {
    expect(evaluateCsrf(req({ headers: {} }), origins).allowed).toBe(true);
  });

  it('does not touch Bearer-authenticated requests (the ConqrMeet BFF strips cookies)', () => {
    const d = evaluateCsrf(
      req({
        headers: {
          authorization: 'Bearer x',
          'sec-fetch-site': 'cross-site',
          origin: 'https://ltc.conqrmeet.com',
        },
      }),
      origins,
    );
    expect(d).toEqual({ allowed: true, checked: false });
  });

  it('does not touch requests without the session cookie, except sign-in endpoints', () => {
    expect(
      evaluateCsrf(
        req({
          hasSessionCookie: false,
          headers: {
            'sec-fetch-site': 'cross-site',
            origin: 'https://evil.example',
          },
        }),
        origins,
      ).allowed,
    ).toBe(true);
    expect(
      evaluateCsrf(
        req({
          path: '/api/auth/login',
          hasSessionCookie: false,
          headers: {
            'sec-fetch-site': 'cross-site',
            origin: 'https://evil.example',
          },
        }),
        origins,
      ).allowed,
    ).toBe(false);
  });

  it('never checks safe methods or client-authenticated OAuth endpoints', () => {
    const forged = {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example',
    };
    expect(
      evaluateCsrf(req({ method: 'GET', headers: forged }), origins).allowed,
    ).toBe(true);
    expect(
      evaluateCsrf(req({ path: '/oauth/token', headers: forged }), origins)
        .allowed,
    ).toBe(true);
    expect(
      evaluateCsrf(req({ path: '/api/idp/token', headers: forged }), origins)
        .allowed,
    ).toBe(true);
  });

  it('still protects the MCP consent form, which is cookie-authenticated', () => {
    const d = evaluateCsrf(
      req({
        path: '/oauth/authorize/consent',
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'https://evil.example',
        },
      }),
      origins,
    );
    expect(d.allowed).toBe(false);
  });

  it('works when APP_URL is missing, using the request origin', () => {
    const none = allowedOriginsFromEnv({} as NodeJS.ProcessEnv);
    expect(
      evaluateCsrf(
        req({ headers: { origin: 'https://ltc.conqrhub.com' } }),
        none,
      ).allowed,
    ).toBe(true);
    expect(
      evaluateCsrf(req({ headers: { origin: 'https://evil.example' } }), none)
        .allowed,
    ).toBe(false);
  });
});
