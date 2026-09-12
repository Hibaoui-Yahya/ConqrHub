import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { PlatformConfigService } from '../../platform/platform.config';
import { PlatformContextService } from '../../platform/platform-context.service';

// Short cache TTL. Trades up to N seconds of stale state (e.g., a freshly
// revoked session) for ~3× fewer DB hits per authenticated request under load.
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
    private readonly platformConfig: PlatformConfigService,
    private readonly platformContext: PlatformContextService,
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
      return this.validateSuiteToken(payload);
    }

    if (payload.type !== JwtType.ACCESS) {
      throw new UnauthorizedException();
    }

    // Platform mode: the session says *who* and *which tenant was asked for*, and nothing about
    // what they may do. The workspace comes from the tenant binding and the role comes from
    // ConqrAccess, on every request.
    //
    // The 30-second cache below is deliberately skipped here rather than adapted. It caches
    // {user, workspace}, and user.role is authority; caching it would mean a revoked grant kept
    // working for up to half a minute, which is the failure the platform's revision watermark
    // exists to prevent. PlatformContextService has its own cache, invalidated by that watermark —
    // that is the correct place for it, and it holds a context rather than a role.
    if (this.platformConfig.isPlatformMode()) {
      return this.validatePlatform(req, payload as JwtPayload);
    }

    const key = this.cacheKey(payload);

    // Cache hit → skip workspace + user + session DB lookups entirely.
    // We still keep session-activity tracking because that operation is
    // already throttled and async (not on the hot path).
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedAuthResult;
        const sessionId = (payload as JwtPayload).sessionId;
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

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);

    if (!workspace) {
      throw new UnauthorizedException();
    }
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    if ((payload as JwtPayload).sessionId) {
      const sessionId = (payload as JwtPayload).sessionId;
      const session = await this.userSessionRepo.findActiveById(sessionId);
      if (!session || session.userId !== payload.sub || session.workspaceId !== payload.workspaceId) {
        throw new UnauthorizedException();
      }
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
   * Platform mode: authenticate the person locally, then let the platform decide everything else.
   *
   * The order matters and mirrors the ConqrService canary. The session is proven first, because a
   * request with no valid session is not worth asking the platform about. Then ConqrAccess decides
   * the tenant, the entitlement and the grant, and only what it returns is used: the workspace from
   * the binding, the role from the grant. Whatever the token said about either is discarded.
   */
  private async validatePlatform(req: any, payload: JwtPayload): Promise<CachedAuthResult> {
    const personUrn = (payload as { personUrn?: string }).personUrn;
    const conqrTenantId = (payload as { conqrTenantId?: string }).conqrTenantId;
    const sessionId = payload.sessionId;

    // A session minted before platform mode was switched on — or forged without these claims —
    // cannot be upgraded into a platform session by omitting them.
    if (!personUrn || !conqrTenantId || !sessionId) {
      throw new UnauthorizedException(
        'This session was not established through the Conqr platform; please sign in again',
      );
    }

    const session = await this.userSessionRepo.findActiveById(sessionId);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException();
    }
    req.raw.sessionId = sessionId;

    const resolved = await this.platformContext.resolve({
      personUrn,
      conqrTenantId,
      sessionId,
      correlationId:
        typeof req.headers?.['x-correlation-id'] === 'string'
          ? String(req.headers['x-correlation-id']).slice(0, 64)
          : undefined,
    });

    const workspace = await this.workspaceRepo.findById(resolved.productTenantId);
    if (!workspace) {
      // The binding names a workspace that no longer exists. Refuse: resolving to some other
      // workspace, or to none, would both be worse than saying so.
      throw new UnauthorizedException();
    }
    const user = await this.userRepo.findById(payload.sub, workspace.id);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    this.sessionActivityService.trackActivity(sessionId, payload.sub, workspace.id);

    // Both replaced, deliberately. Whatever the row and the token said about the role is now
    // irrelevant; CASL downstream sees only what ConqrAccess said on this request.
    return { user: { ...user, role: resolved.role }, workspace };
  }

  /** Stateless (no Hub session row): resolve and validate user + workspace. */
  private async validateSuiteToken(
    payload: (JwtPayload | JwtApiKeyPayload) & { jti?: string },
  ): Promise<CachedAuthResult> {
    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
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
