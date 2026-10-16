import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import type { User, UserSession } from '@docmost/db/types/entity.types';
import { isUserDisabled } from '../../../common/helpers';

/** The claims of a verified Hub session JWT that the validator relies on. */
export interface HubSessionClaims {
  sub: string;
  workspaceId: string;
  sessionId?: string;
}

export interface HubSessionCheck {
  /**
   * The workspace the request resolved to (DomainMiddleware). When set, a
   * token minted for another workspace is rejected.
   */
  expectedWorkspaceId?: string;
  /**
   * Refuse tokens without a session id. Legacy tokens (minted before
   * user_sessions existed) cannot be revoked, so nothing that hands out new
   * credentials may accept them.
   */
  requireSession: boolean;
}

/**
 * Raised when the authoritative auth state cannot be read (database down,
 * pool exhausted). Callers must answer 503 and must NOT treat it as a logout:
 * clearing cookies or redirecting to sign-in on an outage would turn a
 * transient failure into a mass logout or a redirect loop.
 */
export class AuthStateUnavailableException extends ServiceUnavailableException {
  constructor() {
    super('Authentication is temporarily unavailable');
  }
}

/**
 * Single authority for "is this Hub session still usable": the JWT signature
 * proves who minted it, but only the user_sessions row says whether it was
 * revoked, expired or belongs to someone else. Every place that accepts the
 * authToken cookie in a security-relevant way (API guard, suite IdP
 * authorize, WebSocket handshake) goes through here so they cannot drift.
 */
@Injectable()
export class HubSessionValidator {
  private readonly logger = new Logger(HubSessionValidator.name);

  constructor(
    private readonly userRepo: UserRepo,
    private readonly userSessionRepo: UserSessionRepo,
  ) {}

  /** Session row only: active, not expired, owned by the token's subject. */
  async assertSessionActive(claims: HubSessionClaims): Promise<UserSession> {
    if (!claims.sessionId) throw new UnauthorizedException();
    const session = await this.read(() =>
      this.userSessionRepo.findActiveById(claims.sessionId),
    );
    if (
      !session ||
      session.userId !== claims.sub ||
      session.workspaceId !== claims.workspaceId
    ) {
      throw new UnauthorizedException();
    }
    return session;
  }

  /** Full check: workspace binding, live session, active user. */
  async validate(
    claims: HubSessionClaims,
    check: HubSessionCheck,
  ): Promise<{ user: User; session: UserSession | null }> {
    if (!claims?.sub || !claims.workspaceId) throw new UnauthorizedException();
    if (
      check.expectedWorkspaceId &&
      check.expectedWorkspaceId !== claims.workspaceId
    ) {
      throw new UnauthorizedException('Workspace does not match');
    }
    if (check.requireSession && !claims.sessionId) {
      throw new UnauthorizedException();
    }
    const session = claims.sessionId
      ? await this.assertSessionActive(claims)
      : null;
    const user = await this.read(() =>
      this.userRepo.findById(claims.sub, claims.workspaceId),
    );
    if (!user || isUserDisabled(user)) throw new UnauthorizedException();
    return { user, session };
  }

  /**
   * Runs a lookup and turns infrastructure failures into a distinct 503 so
   * they are never confused with an invalid credential.
   */
  private async read<T>(lookup: () => Promise<T>): Promise<T> {
    try {
      return await lookup();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Auth state lookup failed: ${(err as Error)?.message ?? err}`,
      );
      throw new AuthStateUnavailableException();
    }
  }
}
