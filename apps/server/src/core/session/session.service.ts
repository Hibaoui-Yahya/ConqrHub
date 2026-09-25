import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TokenService } from '../auth/services/token.service';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { ClsService } from 'nestjs-cls';
import {
  AuditContext,
  AUDIT_CONTEXT_KEY,
} from '../../common/middlewares/audit-context.middleware';
import * as Bowser from 'bowser';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { jwtAuthCacheKey } from '../auth/auth-cache.util';

const MAX_SESSIONS_PER_USER = 25;
const RETENTION_DAYS = 7;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly redis: Redis;

  constructor(
    private readonly tokenService: TokenService,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly environmentService: EnvironmentService,
    private readonly cls: ClsService,
    redisService: RedisService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  @Interval('session-cleanup', 24 * 60 * 60 * 1000)
  async cleanupSessions() {
    try {
      await this.userSessionRepo.deleteStale(RETENTION_DAYS);
      await this.userSessionRepo.trimExcessSessions(MAX_SESSIONS_PER_USER);
      this.logger.debug('Session cleanup completed');
    } catch (err) {
      this.logger.error('Session cleanup failed', err);
    }
  }

  async createSessionAndToken(user: User): Promise<string> {
    const auditContext = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    const ipAddress = auditContext?.ipAddress ?? null;
    const userAgent = auditContext?.userAgent ?? null;

    const deviceName = this.parseDeviceName(userAgent);
    const expiresAt = this.environmentService.getCookieExpiresIn();

    const session = await this.userSessionRepo.insertSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      deviceName,
      ipAddress,
      expiresAt,
    });

    return this.tokenService.generateAccessToken(user, session.id);
  }

  async getActiveSessions(
    userId: string,
    workspaceId: string,
    currentSessionId: string | null,
  ) {
    const sessions = await this.userSessionRepo.findActiveByUser(
      userId,
      workspaceId,
    );

    const mapped = sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      geoLocation: s.geoLocation,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrentDevice: s.id === currentSessionId,
    }));

    return mapped.sort((a, b) => {
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      return 0;
    });
  }

  /** Idempotent: revoking an already-revoked or foreign session is a no-op. */
  async revokeSession(
    sessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.userSessionRepo.revokeById(sessionId, userId, workspaceId);
    // Always drop the cache entry, even if the row was already revoked: an
    // earlier attempt may have failed at exactly this step.
    await this.invalidateSessionCache(workspaceId, [sessionId]);
  }

  async revokeAllOtherSessions(
    currentSessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const revoked = await this.userSessionRepo.revokeAllExceptCurrent(
      currentSessionId,
      userId,
      workspaceId,
    );
    await this.invalidateSessionCache(workspaceId, revoked);
  }

  /**
   * F29: JwtStrategy caches validated sessions in Redis for up to 30 s. A
   * revoked or deleted session must stop working immediately, so its cache
   * entry is deleted here. Only the given ids are touched; other users'
   * sessions are never affected.
   *
   * Failure mode (explicit): if Redis is unreachable the database row is
   * already revoked/deleted, so the session is dead everywhere except for a
   * cache entry that expires on its own within the cache TTL. We warn and
   * return rather than throw, so logout and password changes still complete.
   */
  async invalidateSessionCache(
    workspaceId: string,
    sessionIds: string[],
  ): Promise<void> {
    if (sessionIds.length === 0) return;
    const keys = sessionIds.map((id) => jwtAuthCacheKey(workspaceId, id));
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(
        `Session cache invalidation failed for ${keys.length} session(s); ` +
          `stale cache entries expire within the JWT validation cache TTL: ${(err as Error).message}`,
      );
    }
  }

  private parseDeviceName(userAgent: string | null): string | null {
    if (!userAgent) return null;

    try {
      const parsed = Bowser.parse(userAgent);

      const os = parsed.os?.name;
      const browser = parsed.browser?.name;
      const platformType = parsed.platform?.type;

      if (platformType === 'mobile' || platformType === 'tablet') {
        return parsed.platform?.model || os || 'Mobile Device';
      }

      if (os) {
        return browser ? `${browser} on ${os}` : os;
      }

      return browser || null;
    } catch {
      return null;
    }
  }
}
