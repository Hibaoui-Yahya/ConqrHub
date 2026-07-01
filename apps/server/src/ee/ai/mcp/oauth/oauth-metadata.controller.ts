import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../../../common/decorators/skip-transform.decorator';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { McpOauthService } from './mcp-oauth.service';
import { resolveOAuthUrls } from './oauth-url.util';
import { isMcpEnabledForRequest } from './oauth-request.util';

/**
 * OAuth discovery documents (RFC 9728 protected-resource metadata + RFC 8414
 * authorization-server metadata). Public, unauthenticated, served at the bare
 * origin (excluded from the `/api` global prefix). Gated on the resolved
 * workspace having MCP enabled so we don't advertise OAuth where it's off.
 */
@Controller()
export class OauthMetadataController {
  constructor(
    private readonly service: McpOauthService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @SkipTransform()
  @Get('.well-known/oauth-protected-resource')
  protectedResourceRoot(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    this.sendPrm(req, res);
  }

  @SkipTransform()
  @Get('.well-known/oauth-protected-resource/mcp')
  protectedResourceMcp(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    this.sendPrm(req, res);
  }

  @SkipTransform()
  @Get('.well-known/oauth-authorization-server')
  authorizationServer(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    this.sendAsMetadata(req, res);
  }

  // Defensive alias — some clients probe OIDC discovery.
  @SkipTransform()
  @Get('.well-known/openid-configuration')
  openidConfiguration(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    this.sendAsMetadata(req, res);
  }

  private sendPrm(req: FastifyRequest, res: FastifyReply) {
    if (!this.enabled(req)) return this.notFound(res);
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });
    this.json(res, this.service.buildProtectedResourceMetadata(urls));
  }

  private sendAsMetadata(req: FastifyRequest, res: FastifyReply) {
    if (!this.enabled(req)) return this.notFound(res);
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });
    this.json(res, this.service.buildAuthorizationServerMetadata(urls));
  }

  private enabled(req: FastifyRequest): boolean {
    return isMcpEnabledForRequest(req);
  }

  private json(res: FastifyReply, body: unknown) {
    (res as any)
      .status(200)
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'no-store')
      .header('Access-Control-Allow-Origin', '*')
      .send(JSON.stringify(body));
  }

  private notFound(res: FastifyReply) {
    (res as any)
      .status(404)
      .header('Content-Type', 'application/json')
      .send(JSON.stringify({ error: 'not_found' }));
  }
}
