import { Body, Controller, Logger, Options, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../../../common/decorators/skip-transform.decorator';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { McpOauthService } from './mcp-oauth.service';
import { OAuthError } from './oauth.errors';
import { resolveOAuthUrls } from './oauth-url.util';

/**
 * OAuth token endpoint (authorization_code + refresh_token grants) and the
 * RFC 7009 revocation endpoint. Public clients (PKCE, no secret). Accepts
 * `application/x-www-form-urlencoded` (parser registered in main.ts).
 */
@Controller('oauth')
export class OauthTokenController {
  private readonly logger = new Logger(OauthTokenController.name);

  constructor(
    private readonly service: McpOauthService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @SkipTransform()
  @Options('token')
  tokenPreflight(@Res() res: FastifyReply) {
    this.preflight(res);
  }

  @SkipTransform()
  @Options('revoke')
  revokePreflight(@Res() res: FastifyReply) {
    this.preflight(res);
  }

  @SkipTransform()
  @Post('token')
  async token(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Body() body: Record<string, string>,
  ) {
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });
    const params = body ?? {};

    // TEMP diagnostics (MCP connector debugging): what the client actually sent.
    this.logger.log(
      `[mcp-oauth] token request: grant_type=${params.grant_type} client_id=${params.client_id} ` +
        `ct=${req.headers['content-type']} has_code=${Boolean(params.code)} ` +
        `has_verifier=${Boolean(params.code_verifier)} redirect_uri=${params.redirect_uri} ` +
        `resource=${params.resource} has_secret=${Boolean(params.client_secret)} ` +
        `authz=${req.headers['authorization'] ? 'present' : 'none'}`,
    );

    try {
      let tokenResponse;
      switch (params.grant_type) {
        case 'authorization_code':
          tokenResponse = await this.service.exchangeAuthorizationCode(
            {
              code: params.code,
              clientId: params.client_id,
              redirectUri: params.redirect_uri,
              codeVerifier: params.code_verifier,
              resource: params.resource,
            },
            urls,
          );
          break;
        case 'refresh_token':
          tokenResponse = await this.service.refreshAccessToken(
            {
              refreshToken: params.refresh_token,
              clientId: params.client_id,
              scope: params.scope,
              resource: params.resource,
            },
            urls,
          );
          break;
        default:
          throw new OAuthError(
            'unsupported_grant_type',
            `unsupported grant_type: ${params.grant_type ?? '(none)'}`,
          );
      }

      (res as any)
        .status(200)
        .header('Content-Type', 'application/json;charset=UTF-8')
        .header('Cache-Control', 'no-store')
        .header('Pragma', 'no-cache')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.stringify(tokenResponse));
    } catch (err) {
      if (err instanceof OAuthError) {
        this.logger.warn(
          `[mcp-oauth] token FAILED: ${err.error} — ${err.errorDescription}`,
        );
        return this.error(res, err);
      }
      this.logger.error(
        `[mcp-oauth] token threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  @SkipTransform()
  @Post('revoke')
  async revoke(
    @Res() res: FastifyReply,
    @Body() body: Record<string, string>,
  ) {
    // RFC 7009: always return 200, even for an unknown token.
    try {
      await this.service.revoke(body?.token ?? '');
    } catch {
      /* swallow — revocation must not leak token validity */
    }
    (res as any)
      .status(200)
      .header('Cache-Control', 'no-store')
      .header('Access-Control-Allow-Origin', '*')
      .send();
  }

  private preflight(res: FastifyReply) {
    (res as any)
      .status(204)
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .send();
  }

  private error(res: FastifyReply, err: OAuthError) {
    (res as any)
      .status(err.status)
      .header('Content-Type', 'application/json;charset=UTF-8')
      .header('Cache-Control', 'no-store')
      .header('Pragma', 'no-cache')
      .header('Access-Control-Allow-Origin', '*')
      .send(
        JSON.stringify({
          error: err.error,
          error_description: err.errorDescription,
        }),
      );
  }
}
