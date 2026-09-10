import { UnauthorizedException } from '@nestjs/common';

// AuthService pulls in a module graph that this repository's Jest config cannot
// resolve (pre-existing: 'src/integrations/queue/constants' absolute import).
// The controller only needs the class token here, so the module is replaced.
jest.mock('./services/auth.service', () => ({ AuthService: class AuthService {} }));
import { AuthController } from './auth.controller';
import { AUTH_COOKIE_NAME } from './auth-cookie.util';
import { JwtType } from './dto/jwt-payload';

/**
 * F29 — logout revokes the session, invalidates cached auth (via
 * SessionService), clears the cookie with the exact set attributes, and is
 * idempotent: repeated calls, expired or already-revoked cookies all succeed.
 */
const expires = new Date('2030-01-01T00:00:00Z');
const env = {
  getAuthCookieSameSite: () => 'lax' as const,
  isHttps: () => false,
  getCookieExpiresIn: () => expires,
} as any;

function makeController(verify: jest.Mock) {
  const sessionService = { revokeSession: jest.fn().mockResolvedValue(undefined) } as any;
  const auditService = { log: jest.fn(), setActorId: jest.fn() } as any;
  const tokenService = { verifyJwt: verify } as any;
  const controller = new AuthController(
    {} as any, // authService
    sessionService,
    env,
    {} as any, // moduleRef
    auditService,
    tokenService,
  );
  return { controller, sessionService, auditService, tokenService };
}

function req(cookie?: string, bearer?: string) {
  return {
    cookies: cookie ? { [AUTH_COOKIE_NAME]: cookie } : {},
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    raw: {},
  } as any;
}
function res() {
  return { setCookie: jest.fn(), clearCookie: jest.fn() } as any;
}

const payload = { sub: 'u1', workspaceId: 'ws1', type: 'access', sessionId: 's1' };

describe('AuthController.logout (F29)', () => {
  it('revokes the session, audits, and clears the cookie with the set attributes', async () => {
    const verify = jest.fn().mockResolvedValue(payload);
    const { controller, sessionService, auditService, tokenService } = makeController(verify);
    const r = res();
    await expect(controller.logout(req('tok'), r)).resolves.toEqual({});
    expect(tokenService.verifyJwt).toHaveBeenCalledWith('tok', JwtType.ACCESS);
    expect(sessionService.revokeSession).toHaveBeenCalledWith('s1', 'u1', 'ws1');
    expect(auditService.setActorId).toHaveBeenCalledWith('u1');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'u1' }));
    expect(r.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
    });
  });

  it('is idempotent: a second logout with the same cookie succeeds and clears again', async () => {
    const verify = jest.fn().mockResolvedValue(payload);
    const { controller, sessionService } = makeController(verify);
    const r1 = res();
    const r2 = res();
    await controller.logout(req('tok'), r1);
    await controller.logout(req('tok'), r2);
    expect(sessionService.revokeSession).toHaveBeenCalledTimes(2);
    expect(r1.clearCookie).toHaveBeenCalledTimes(1);
    expect(r2.clearCookie).toHaveBeenCalledTimes(1);
  });

  it('an expired or invalid cookie still yields 200 and clears the cookie, without revoking', async () => {
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException('jwt expired'));
    const { controller, sessionService, auditService } = makeController(verify);
    const r = res();
    await expect(controller.logout(req('stale'), r)).resolves.toEqual({});
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
    expect(r.clearCookie).toHaveBeenCalledTimes(1);
  });

  it('no cookie at all: 200 and the cookie is cleared', async () => {
    const verify = jest.fn();
    const { controller, sessionService } = makeController(verify);
    const r = res();
    await expect(controller.logout(req(), r)).resolves.toEqual({});
    expect(verify).not.toHaveBeenCalled();
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(r.clearCookie).toHaveBeenCalledTimes(1);
  });

  it('accepts the token from the Authorization header when no cookie is present', async () => {
    const verify = jest.fn().mockResolvedValue(payload);
    const { controller, sessionService } = makeController(verify);
    await controller.logout(req(undefined, 'bearer-tok'), res());
    expect(verify).toHaveBeenCalledWith('bearer-tok', JwtType.ACCESS);
    expect(sessionService.revokeSession).toHaveBeenCalledWith('s1', 'u1', 'ws1');
  });

  it('a session-less token (no sessionId) revokes nothing but still clears the cookie', async () => {
    const verify = jest.fn().mockResolvedValue({ sub: 'u1', workspaceId: 'ws1', type: 'access' });
    const { controller, sessionService } = makeController(verify);
    const r = res();
    await controller.logout(req('tok'), r);
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(r.clearCookie).toHaveBeenCalledTimes(1);
  });
});
