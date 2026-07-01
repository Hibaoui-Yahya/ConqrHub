import {
  Body,
  Controller,
  Options,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../../../common/decorators/skip-transform.decorator';
import { McpOauthService } from './mcp-oauth.service';
import { OAuthError } from './oauth.errors';
import {
  getRequestWorkspace,
  isMcpEnabledForRequest,
} from './oauth-request.util';

/**
 * RFC 7591 Dynamic Client Registration. Public clients only (PKCE, no secret).
 */
@Controller('oauth/register')
export class OauthRegisterController {
  constructor(private readonly service: McpOauthService) {}

  @SkipTransform()
  @Options()
  preflight(@Res() res: FastifyReply) {
    (res as any)
      .status(204)
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type')
      .send();
  }

  @SkipTransform()
  @Post()
  async register(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Body() body: Record<string, unknown>,
  ) {
    if (!isMcpEnabledForRequest(req)) {
      return this.error(
        res,
        new OAuthError('invalid_request', 'MCP is not enabled', 404),
      );
    }

    try {
      const workspace = getRequestWorkspace(req);
      const response = await this.service.registerClient(
        body ?? {},
        workspace?.id ?? null,
      );
      (res as any)
        .status(201)
        .header('Content-Type', 'application/json')
        .header('Cache-Control', 'no-store')
        .header('Pragma', 'no-cache')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.stringify(response));
    } catch (err) {
      if (err instanceof OAuthError) return this.error(res, err);
      throw err;
    }
  }

  private error(res: FastifyReply, err: OAuthError) {
    (res as any)
      .status(err.status)
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'no-store')
      .header('Access-Control-Allow-Origin', '*')
      .send(
        JSON.stringify({ error: err.error, error_description: err.errorDescription }),
      );
  }
}
