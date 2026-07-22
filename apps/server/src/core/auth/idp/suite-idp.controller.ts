import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { JwtType } from '../dto/jwt-payload';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { SuiteIdpService } from './suite-idp.service';

/**
 * ConqrHub-as-IdP endpoints for trusted suite clients (the Plane fork).
 * Path-aware OIDC discovery lives under /api/idp so it can coexist with the
 * EE MCP OAuth server at the bare origin. The authorize endpoint reuses the
 * app's own session cookie — being signed into the Hub IS being signed into
 * the suite; the client never sees a second login.
 */
@Controller('idp')
export class SuiteIdpController {
  constructor(
    private readonly idp: SuiteIdpService,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly environment: EnvironmentService,
  ) {}

  @Public()
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

    const session = await this.resolveSession(req);
    if (!session) {
      // Bounce through the Hub login and come straight back here.
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

    const code = this.idp.issueCode(session.user, session.workspaceId, client);
    return this.redirectBack(res, query.redirect_uri, {
      code,
      state: query.state,
    });
  }

  @Public()
  @Post('token')
  async token(@Body() body: Record<string, string>, @Res() res: FastifyReply) {
    const client = this.idp.findClient(body.client_id);
    if (!client || body.client_secret !== client.clientSecret) {
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
      } catch {
        return res.code(400).send({ error: 'invalid_grant' });
      }
    }
    if (body.grant_type === 'refresh_token' && body.refresh_token) {
      try {
        return res
          .code(200)
          .header('Cache-Control', 'no-store')
          .send(await this.idp.rotateRefreshToken(body.refresh_token, client));
      } catch {
        return res.code(400).send({ error: 'invalid_grant' });
      }
    }
    return res.code(400).send({ error: 'unsupported_grant_type' });
  }

  @Public()
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
    try {
      const { userId, workspaceId } = await this.idp.verifyAccessToken(token);
      const user = await this.userRepo.findById(userId, workspaceId);
      if (!user || (user as any).deletedAt || (user as any).deactivatedAt) {
        return res.code(401).send({ error: 'invalid_token' });
      }
      return res.send(this.idp.userinfo(user));
    } catch {
      return res.code(401).send({ error: 'invalid_token' });
    }
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

  /** Same session semantics as the rest of the app: authToken cookie → user. */
  private async resolveSession(req: FastifyRequest) {
    const token = (req as any).cookies?.authToken;
    if (!token) return null;
    let payload: any;
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.ACCESS);
    } catch {
      return null;
    }
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || (user as any).deletedAt || (user as any).deactivatedAt) {
      return null;
    }
    return { user, workspaceId: payload.workspaceId as string };
  }
}
