import {
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtApiKeyPayload, JwtPayload, JwtType } from '../dto/jwt-payload';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../../session/session-activity.service';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader, isUserDisabled } from '../../../common/helpers';
import { SUITE_IDP_ACCESS_AUD } from '../idp/suite-idp.service';
import { ModuleRef } from '@nestjs/core';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import type { User, Workspace } from '@docmost/db/types/entity.types';
import {
  AuthStateUnavailableException,
  HubSessionValidator,
} from '../services/hub-session-validator.service';
import { SuiteTokenFamilyRepo } from '@docmost/db/repos/auth/suite-token-family.repo';
import {
  clientPolicyMode,
  clientProfiles,
  epochMatches,
  familyIsLive,
  hubSessionEpoch,
  suiteRouteAllowed,
  suiteTokenEpoch,
} from '../idp/suite-token-policy';
import { ForbiddenException } from '@nestjs/common';

// Short cache TTL for the user + workspace objects only. Session validity is
// never served from this cache: a revoked session must stop working on the
// very next request, so the user_sessions row is read every time.
const JWT_VALIDATE_CACHE_TTL_SECONDS = 30;

interface CachedAuthResult {
  user: User;
  workspace: Workspace;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private logger = new Logger('JwtStrategy');
  private readonly redis: Redis;

  constructor(
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private userSessionRepo: UserSessionRepo,
    private sessionActivityService: SessionActivityService,
    private readonly environmentService: EnvironmentService,
    private moduleRef: ModuleRef,
    private readonly redisService: RedisService,
    private readonly sessionValidator: HubSessionValidator,
    private readonly families: SuiteTokenFamilyRepo,
  ) {
    super({
      jwtFromRequest: (req: FastifyRequest) => {
        return req.cookies?.authToken || extractBearerTokenFromHeader(req);
      },
      ignoreExpiration: false,
      secretOrKey: environmentService.getAppSecret(),
      passReqToCallback: true,
    });
    this.redis = this.redisService.getOrThrow();
  }

  /**
   * Cache key derived from a per-token identifier. Prefer the standard `jti`
   * claim when present; fall back to sessionId/apiKeyId/sub so we always
   * have a token-scoped key.
   */
  private cacheKey(
    payload: (JwtPayload | JwtApiKeyPayload) & { jti?: string },
  ): string {
    const id =
      payload.jti ??
      (payload as JwtPayload).sessionId ??
      (payload as JwtApiKeyPayload).apiKeyId ??
      payload.sub;
    return `jwt:auth:${payload.workspaceId}:${id}`;
  }

  async validate(
    req: any,
    payload: (JwtPayload | JwtApiKeyPayload) & { jti?: string },
  ) {
    if (!payload.workspaceId) {
      throw new UnauthorizedException();
    }

    if (req.raw.workspaceId && req.raw.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException('Workspace does not match');
    }

    if (payload.type === JwtType.API_KEY) {
      return this.validateApiKey(req, payload as JwtApiKeyPayload);
    }

    // Suite-IdP access tokens (trusted first-party clients: ConqrPlan,
    // ConqrMeet). Strict audience match — the IdP's code and refresh tokens
    // share the signing key but carry different audiences and are rejected.
    // Short-lived (5 min) and only obtainable through a Hub-session-backed
    // authorize by a statically registered client.
    if (
      payload.type === undefined &&
      (payload as { aud?: string }).aud === SUITE_IDP_ACCESS_AUD
    ) {
      return this.validateSuiteToken(req, payload);
    }

    if (payload.type !== JwtType.ACCESS) {
      throw new UnauthorizedException();
    }
    // Emergency revocation / backup restore: tokens minted under an older
    // epoch are refused, whatever the (possibly restored) session row says.
    if (!epochMatches((payload as { ep?: number }).ep, hubSessionEpoch())) {
      throw new UnauthorizedException();
    }

    const key = this.cacheKey(payload);
    const sessionId = (payload as JwtPayload).sessionId;

    // The session row is authoritative and is checked on every request, cache
    // hit or not: a logout, device revocation, password reset or deactivation
    // must take effect immediately (deactivation revokes the sessions in the
    // same transaction). Throws 401 when revoked, 503 when unreadable.
    if (sessionId) {
      await this.sessionValidator.assertSessionActive({
        sub: payload.sub,
        workspaceId: payload.workspaceId,
        sessionId,
      });
    }

    // Cache hit → skip the workspace + user lookups. Session-activity
    // tracking is throttled and async (not on the hot path).
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedAuthResult;
        if (sessionId) {
          req.raw.sessionId = sessionId;
          this.sessionActivityService.trackActivity(
            sessionId,
            payload.sub,
            payload.workspaceId,
          );
        }
        return parsed;
      }
    } catch (err) {
      // Redis unreachable / parse error — fall through to authoritative DB
      // lookups so auth still works when the cache layer is down.
      this.logger.debug(`JWT cache read failed: ${(err as Error).message}`);
    }

    const { workspace, user } = await this.loadWorkspaceAndUser(payload);

    if (sessionId) {
      req.raw.sessionId = sessionId;
      this.sessionActivityService.trackActivity(sessionId, payload.sub, payload.workspaceId);
    }

    // Best-effort cache write; never let a Redis hiccup fail the request.
    try {
      await this.redis.set(
        key,
        JSON.stringify({ user, workspace } satisfies CachedAuthResult),
        'EX',
        JWT_VALIDATE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.debug(`JWT cache write failed: ${(err as Error).message}`);
    }

    return { user, workspace };
  }

  /**
   * Suite access tokens are short-lived but NOT stateless any more: the token
   * family they belong to is read on every request, so an access token issued
   * before a logout, revocation or deactivation stops working at once. The
   * client's route profile is enforced here, on the Hub, not only by the
   * client's own proxy. Unreadable state is a 503, never an acceptance.
   */
  private async validateSuiteToken(
    req: any,
    payload: (JwtPayload | JwtApiKeyPayload) & {
      jti?: string;
      fid?: string;
      azp?: string;
      ep?: number;
    },
  ): Promise<CachedAuthResult> {
    if (!payload.fid || !epochMatches(payload.ep, suiteTokenEpoch())) {
      throw new UnauthorizedException();
    }
    let family;
    try {
      family = await this.families.findForRequest(payload.fid);
    } catch (err) {
      this.logger.error(`Token family lookup failed: ${(err as Error)?.message ?? err}`);
      throw new AuthStateUnavailableException();
    }
    if (
      !familyIsLive(family, {
        userId: payload.sub,
        workspaceId: payload.workspaceId,
        clientId: payload.azp,
      })
    ) {
      throw new UnauthorizedException();
    }
    const url: string = req?.raw?.url ?? req?.url ?? '';
    const method: string = req?.method ?? req?.raw?.method ?? 'GET';
    if (!suiteRouteAllowed(clientProfiles(), payload.azp, method, url, req?.body)) {
      const route = `${method} ${url.split('?')[0]}`;
      if (clientPolicyMode() === 'report') {
        this.logger.warn(`Suite client ${payload.azp} outside its profile: ${route}`);
      } else {
        this.logger.warn(`Suite client ${payload.azp} refused: ${route}`);
        throw new ForbiddenException('Route not allowed for this client');
      }
    }
    return this.loadWorkspaceAndUser(payload);
  }

  /**
   * Workspace + active user, read from the database. An unreadable database
   * is a 503, never a 401: an outage must not look like a revoked login.
   */
  private async loadWorkspaceAndUser(
    payload: { sub: string; workspaceId: string },
  ): Promise<CachedAuthResult> {
    let workspace: Workspace | undefined;
    let user: User | undefined;
    try {
      workspace = await this.workspaceRepo.findById(payload.workspaceId);
      user = workspace
        ? await this.userRepo.findById(payload.sub, payload.workspaceId)
        : undefined;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Auth lookup failed: ${(err as Error)?.message ?? err}`);
      throw new AuthStateUnavailableException();
    }
    if (!workspace) {
      throw new UnauthorizedException();
    }
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }
    return { user, workspace };
  }

  private async validateApiKey(req: any, payload: JwtApiKeyPayload) {
    let ApiKeyService: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ApiKeyService = require('./../../../ee/api-key/api-key.service')?.ApiKeyService;
    } catch {
      throw new UnauthorizedException('API key module not available');
    }

    if (ApiKeyService) {
      const service = this.moduleRef.get(ApiKeyService, { strict: false });
      if (service) {
        return service.validateApiKey(payload);
      }
    }

    throw new UnauthorizedException('Enterprise API Key module missing');
  }
}
