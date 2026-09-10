import { Logger } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * F29 — revoking sessions invalidates the JWT auth cache immediately, only for
 * the revoked sessions, and degrades explicitly (warn, never throw) when Redis
 * is unavailable.
 */
function makeService(opts: { revokeById?: string[]; revokeAllExceptCurrent?: string[]; delError?: Error } = {}) {
  const repo = {
    revokeById: jest.fn().mockResolvedValue(opts.revokeById ?? ['s1']),
    revokeAllExceptCurrent: jest.fn().mockResolvedValue(opts.revokeAllExceptCurrent ?? ['s2', 's3']),
  } as any;
  const redis = {
    del: opts.delError ? jest.fn().mockRejectedValue(opts.delError) : jest.fn().mockResolvedValue(1),
  };
  const redisService = { getOrThrow: () => redis } as any;
  const svc = new SessionService({} as any, repo, {} as any, { get: () => undefined } as any, redisService);
  return { svc, repo, redis };
}

describe('SessionService revocation cache invalidation (F29)', () => {
  it('revokeSession revokes the row and deletes exactly that session cache key', async () => {
    const { svc, repo, redis } = makeService();
    await svc.revokeSession('s1', 'u1', 'ws1');
    expect(repo.revokeById).toHaveBeenCalledWith('s1', 'u1', 'ws1');
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith('jwt:auth:ws1:s1');
  });

  it('revokeSession is idempotent: a second call still clears the cache and does not throw', async () => {
    const { svc, repo, redis } = makeService({ revokeById: [] });
    await svc.revokeSession('s1', 'u1', 'ws1');
    await svc.revokeSession('s1', 'u1', 'ws1');
    expect(repo.revokeById).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
  });

  it('revokeAllOtherSessions deletes the cache keys of exactly the sessions the repo revoked', async () => {
    const { svc, repo, redis } = makeService({ revokeAllExceptCurrent: ['s2', 's3'] });
    await svc.revokeAllOtherSessions('s1', 'u1', 'ws1');
    expect(repo.revokeAllExceptCurrent).toHaveBeenCalledWith('s1', 'u1', 'ws1');
    expect(redis.del).toHaveBeenCalledWith('jwt:auth:ws1:s2', 'jwt:auth:ws1:s3');
    const deleted = redis.del.mock.calls.flat();
    expect(deleted).not.toContain('jwt:auth:ws1:s1'); // current session untouched
  });

  it('does not touch Redis when nothing was revoked (another user cannot be affected)', async () => {
    const { svc, redis } = makeService({ revokeAllExceptCurrent: [] });
    await svc.revokeAllOtherSessions('s1', 'u1', 'ws1');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('invalidateSessionCache scopes keys to the given workspace only', async () => {
    const { svc, redis } = makeService();
    await svc.invalidateSessionCache('ws-A', ['x', 'y']);
    expect(redis.del).toHaveBeenCalledWith('jwt:auth:ws-A:x', 'jwt:auth:ws-A:y');
  });

  it('Redis failure is explicit: the revoke completes, a warning is logged, nothing throws', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, repo } = makeService({ delError: new Error('ECONNREFUSED') });
    await expect(svc.revokeSession('s1', 'u1', 'ws1')).resolves.toBeUndefined();
    expect(repo.revokeById).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Session cache invalidation failed'));
    const message = String(warn.mock.calls[0][0]);
    expect(message).not.toContain('jwt:auth:'); // no key contents in logs
    warn.mockRestore();
  });
});
