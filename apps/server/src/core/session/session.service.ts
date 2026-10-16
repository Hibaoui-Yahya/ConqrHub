import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { AccountEmailService } from '../../integrations/mail/account-email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SESSIONS_REVOKED_EVENT, SessionsRevokedEvent } from './session-events';

const MAX_SESSIONS_PER_USER = 25;
const RETENTION_DAYS = 7;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly environmentService: EnvironmentService,
    private readonly cls: ClsService,
    @Optional() private readonly accountEmails?: AccountEmailService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

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

    if (this.accountEmails && user.email) {
      // Not awaited: the e-mail must never delay or fail the sign-in.
      void this.accountEmails.signInIfNewDevice(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          workspaceId: user.workspaceId,
        },
        { id: session.id, deviceName, ipAddress },
      );
    }

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

  async revokeSession(
    sessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.userSessionRepo.revokeById(sessionId, userId, workspaceId);
    this.notifyRevoked({ userId, workspaceId, sessionIds: [sessionId] });
  }

  async revokeAllOtherSessions(
    currentSessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.userSessionRepo.revokeAllExceptCurrent(
      currentSessionId,
      userId,
      workspaceId,
    );
    this.notifyRevoked({ userId, workspaceId, allExcept: currentSessionId });
  }

  /** "Log out from all devices": every session of the user, this one too. */
  async revokeAllSessions(userId: string, workspaceId: string): Promise<void> {
    await this.userSessionRepo.revokeByUserId(userId, workspaceId);
    this.notifyRevoked({ userId, workspaceId, all: true });
  }

  /** Lets long-lived connections drop now; the database stays the authority. */
  notifyRevoked(event: SessionsRevokedEvent): void {
    try {
      this.events?.emit(SESSIONS_REVOKED_EVENT, event);
    } catch (err) {
      this.logger.warn(`Revocation event not delivered: ${(err as Error)?.message}`);
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
