import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@docmost/db/types/entity.types';
import { HubSessionValidator } from '../services/hub-session-validator.service';
import { clearAuthCookie, usesAuthCookie } from '../auth-cookie.util';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../../integrations/throttle/throttler-names';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { JwtType } from '../dto/jwt-payload';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { isGrantRefusal, SuiteIdpService } from './suite-idp.service';

/**
 * ConqrHub-as-IdP endpoints for trusted suite clients (the Plane fork).
 * Path-aware OIDC discovery lives under /api/idp so it can coexist with the
 * EE MCP OAuth server at the bare origin. The authorize endpoint reuses the
 * app's own session cookie — being signed into the Hub IS being signed into
 * the suite; the client never sees a second login.
 */
// F28: every IdP endpoint is rate-limited per client IP with the auth throttler.
// The browser-facing authorize endpoint keeps the default auth limit; the
// back-channel token/userinfo/discovery endpoints are called by sibling servers
// on behalf of many users, so their per-IP budget is raised (still bounded).
@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('idp')
export class SuiteIdpController {
  constructor(
    private readonly idp: SuiteIdpService,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly environment: EnvironmentService,
    private readonly sessionValidator: HubSessionValidator,
  ) {}

  @Public()
  @Throttle({ [AUTH_THROTTLER]: { limit: 60, ttl: 60_000 } })
  @Get('.well-known/openid-configuration')
  discovery(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    if (!this.idp.isEnabled()) {
      return res.code(404).send({ error: 'not_found' });
    }
    const proto =
      (req.headers['x-forwarded-proto'] as string) ??
      (this.environment.isHttps() ? 'https' : 'http');
    const host =
      (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
    return res
      .header('Cache-Control', 'no-store')
      .send(this.idp.discovery(`${proto.split(',')[0]}://${host}`));
  }

  @Public()
  @Throttle({ [AUTH_THROTTLER]: { limit: 30, ttl: 60_000 } })
  @Get('authorize')
  async authorize(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Query() query: Record<string, string>,
  ) {
    const client = this.idp.findClient(query.client_id);
    // Never redirect to an unvalidated redirect_uri (§9.4-adjacent hygiene).
    if (!client || !this.idp.redirectUriAllowed(client, query.redirect_uri)) {
      return res
        .code(400)
        .send({ error: 'invalid_request', error_description: 'unknown client or redirect_uri' });
    }
    if (query.response_type !== 'code') {
      return this.redirectBack(res, query.redirect_uri, {
        error: 'unsupported_response_type',
        state: query.state,
      });
    }

    let session: Awaited<ReturnType<SuiteIdpController['resolveSession']>>;
    try {
      session = await this.resolveSession(req);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        // Never issue a code, and never bounce to sign-in, on an outage.
        return res
          .code(503)
          .header('Retry-After', '5')
          .header('Cache-Control', 'no-store')
          .send({ error: 'temporarily_unavailable' });
      }
      throw err;
    }
    if (!session) {
      // A cookie that no longer authenticates is dropped so the sign-in page
      // starts clean. Then bounce through the Hub login and come back here.
      if (usesAuthCookie(req)) clearAuthCookie(res, this.environment);
      const appUrl = this.environment.getAppUrl().replace(/\/$/, '');
      const original = `/api/idp/authorize?${new URLSearchParams(
        query as Record<string, string>,
      ).toString()}`;
      return res
        .header(
          'Location',
          `${appUrl}/login?redirect=${encodeURIComponent(original)}`,
        )
        .code(302)
        .send();
    }

    const code = this.idp.issueCode(
      session.user,
      session.workspaceId,
      client,
      session.sessionId,
    );
    return this.redirectBack(res, query.redirect_uri, {
      code,
      state: query.state,
    });
  }

  @Public()
  @Throttle({ [AUTH_THROTTLER]: { limit: 60, ttl: 60_000 } })
  @Post('token')
  async token(@Body() body: Record<string, string>, @Res() res: FastifyReply) {
    const client = this.idp.findClient(body.client_id);
    // Constant-time; identical response for unknown client and wrong secret (F28).
    if (!this.idp.verifyClientSecret(client, body.client_secret)) {
      return res.code(401).send({ error: 'invalid_client' });
    }
    if (body.grant_type === 'authorization_code' && body.code) {
      try {
        const { userId, workspaceId } = await this.idp.exchangeCode(
          body.code,
          client,
        );
        return res
          .code(200)
          .header('Cache-Control', 'no-store')
          .send(await this.idp.issueTokenPair(userId, workspaceId, client));
      } catch (err) {
        return this.tokenError(res, err);
      }
    }
    if (body.grant_type === 'refresh_token' && body.refresh_token) {
      try {
        return res
          .code(200)
          .header('Cache-Control', 'no-store')
          .send(await this.idp.rotateRefreshToken(body.refresh_token, client));
      } catch (err) {
        return this.tokenError(res, err);
      }
    }
    return res.code(400).send({ error: 'unsupported_grant_type' });
  }

  /**
   * `invalid_grant` only when the grant itself was refused. Anything else —
   * Redis or Postgres unreachable — is `temporarily_unavailable` (503), so a
   * client never mistakes an outage for a revoked login and drops its session.
   */
  private tokenError(res: FastifyReply, err: unknown) {
    if (isGrantRefusal(err)) {
      return res.code(400).send({ error: 'invalid_grant' });
    }
    return res
      .code(503)
      .header('Retry-After', '5')
      .header('Cache-Control', 'no-store')
      .send({ error: 'temporarily_unavailable' });
  }

  @Public()
  @Throttle({ [AUTH_THROTTLER]: { limit: 60, ttl: 60_000 } })
  @Get('userinfo')
  async userinfo(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: FastifyReply,
  ) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (!token) {
      return res.code(401).send({ error: 'invalid_token' });
    }
    let claims: { userId: string; workspaceId: string };
    try {
      claims = await this.idp.verifyAccessToken(token);
    } catch {
      return res.code(401).send({ error: 'invalid_token' });
    }
    let user: User | undefined;
    try {
      user = await this.userRepo.findById(claims.userId, claims.workspaceId);
    } catch {
      return res
        .code(503)
        .header('Retry-After', '5')
        .send({ error: 'temporarily_unavailable' });
    }
    if (!user || (user as any).deletedAt || (user as any).deactivatedAt) {
      return res.code(401).send({ error: 'invalid_token' });
    }
    return res.send(this.idp.userinfo(user));
  }

  private redirectBack(
    res: FastifyReply,
    redirectUri: string,
    params: Record<string, string | undefined>,
  ) {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    return res.header('Location', url.toString()).code(302).send();
  }

  /**
   * The Hub session behind the authToken cookie, checked as strictly as the
   * API guard: valid signature, a live (not revoked, not expired) session row
   * owned by the token's user, the workspace this request resolved to, and
   * an active user. A signed JWT alone is not enough — a revoked device must
   * never be able to mint a fresh suite login. Legacy tokens without a
   * session id are refused for the same reason: they cannot be revoked.
   * Returns null when there is no usable session; throws 503 on an outage.
   */
  private async resolveSession(req: FastifyRequest): Promise<{
    user: User;
    workspaceId: string;
    sessionId: string;
  } | null> {
    const token = (req as any).cookies?.authToken;
    if (!token) return null;
    let payload: any;
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.ACCESS);
    } catch {
      return null;
    }
    try {
      const { user, session } = await this.sessionValidator.validate(payload, {
        requireSession: true,
        expectedWorkspaceId: (req.raw as any).workspaceId,
      });
      return { user, workspaceId: payload.workspaceId, sessionId: session.id };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      return null;
    }
  }
}
