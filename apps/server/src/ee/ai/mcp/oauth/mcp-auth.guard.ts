import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { extractBearerTokenFromHeader } from '../../../../common/helpers';
import { resolveOAuthUrls } from './oauth-url.util';
import {
  CHALLENGE_SCOPE,
  MCP_EXPECTED_AUDIENCE_KEY,
  MCP_REQUIRED_SCOPE_KEY,
  SCOPE_MCP,
} from './oauth.constants';

/**
 * Auth guard for the MCP resource endpoints. Behaves like the standard JWT
 * guard (accepting both manual ConqrHub API keys and OAuth-issued access
 * tokens) but:
 *
 *  1. On any missing/invalid token it emits the RFC 9728 `WWW-Authenticate`
 *     challenge that bootstraps OAuth discovery for ChatGPT/Claude connectors.
 *  2. For OAuth-issued tokens (those carrying an `aud` claim) it enforces that
 *     the audience equals this host's canonical MCP resource — rejecting a
 *     token minted for a different tenant/host (confused-deputy defense).
 *
 * Manual API keys carry no `aud` and are accepted unchanged.
 */
@Injectable()
export class McpAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly environmentService: EnvironmentService) {
    super();
  }

  /**
   * Declare, before Passport runs, that this route is the MCP resource: the
   * JwtStrategy will then accept audience-bound tokens whose `aud` is this
   * host's canonical resource URL and whose scope includes `mcp`. Any other
   * route leaves these markers unset, so the same token is rejected there (F27).
   */
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });
    (req.raw as any)[MCP_EXPECTED_AUDIENCE_KEY] = urls.resource;
    (req.raw as any)[MCP_REQUIRED_SCOPE_KEY] = SCOPE_MCP;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const res = ctx.switchToHttp().getResponse<FastifyReply>();

    if (err || !user) {
      this.setChallenge(req, res);
      throw err || new UnauthorizedException();
    }

    const token = extractBearerTokenFromHeader(req);
    const claims = token ? this.decodeClaims(token) : null;
    if (claims?.aud) {
      const urls = resolveOAuthUrls(req.raw, {
        defaultHttps: this.environmentService.isHttps(),
      });
      if (claims.aud !== urls.resource) {
        this.setChallenge(req, res, 'invalid_token');
        throw new UnauthorizedException('Invalid token audience');
      }
      const granted = (claims.scope ?? '').split(' ').filter(Boolean);
      if (!granted.includes(SCOPE_MCP)) {
        this.setChallenge(req, res, 'insufficient_scope');
        throw new UnauthorizedException('Insufficient token scope');
      }
    }

    return user;
  }

  private setChallenge(
    req: FastifyRequest,
    res: FastifyReply,
    error?: string,
  ): void {
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });
    let header = `Bearer resource_metadata="${urls.prmUrl}", scope="${CHALLENGE_SCOPE}"`;
    if (error) {
      header += `, error="${error}"`;
    }
    // Reply is decorated with `header()` in main.ts.
    (res as any).header('WWW-Authenticate', header);
  }

  private decodeClaims(
    token: string,
  ): { aud?: string; scope?: string } | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = Buffer.from(payload, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      // `aud` may be a string or array per JWT spec; we only mint strings.
      const scope = typeof parsed?.scope === 'string' ? parsed.scope : undefined;
      if (Array.isArray(parsed?.aud)) {
        return { aud: parsed.aud[0], scope };
      }
      return {
        aud: typeof parsed?.aud === 'string' ? parsed.aud : undefined,
        scope,
      };
    } catch {
      return null;
    }
  }
}
