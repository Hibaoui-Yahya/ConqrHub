import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { OidcAuthService, OidcFlowChecks } from './oidc-auth.service';

const FLOW_COOKIE = 'oidc_flow';

/**
 * Shared-IdP OIDC login endpoints (blueprint §9.1). Goes through the domain
 * middleware so the workspace is resolved from the host. State/nonce/PKCE are
 * held in a short-lived httpOnly cookie between redirect and callback.
 */
@Controller('auth/oidc')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidc: OidcAuthService,
    private readonly env: EnvironmentService,
  ) {}

  /** Redirect to the login page with an error flag (never hang the @Res handler). */
  private fail(res: FastifyReply, reason: string) {
    this.logger.warn(`OIDC login failed: ${reason}`);
    return res
      .header('Location', `${this.env.getAppUrl()}/login?error=sso`)
      .code(302)
      .send();
  }

  /**
   * `tenant` is the Conqr tenant the launcher named — ConqrHome appends it to every launch, and it
   * is the only thing that says which workspace a person meant. It is carried across the redirect
   * in the flow cookie, not in the callback URL: the callback URL is registered with the engine and
   * compared exactly, so anything added to it would be refused.
   *
   * It is a *request*, never an answer. ConqrAccess decides whether this person may work in that
   * tenant, and the binding decides which workspace that is; a tenant on a query string that the
   * product trusted would be a workspace chosen by whoever wrote the link.
   */
  @Get('login')
  async login(
    @Res() res: FastifyReply,
    @Query('tenant') tenant?: string,
  ) {
    try {
      const { url, state, nonce, codeVerifier } = await this.oidc.beginLogin();
      res.setCookie(FLOW_COOKIE, JSON.stringify({ state, nonce, codeVerifier, tenant }), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600, // 10 min, single use
        secure: this.env.isHttps(),
      });
      return res.header('Location', url).code(302).send();
    } catch (err) {
      return this.fail(res, err instanceof Error ? err.message : String(err));
    }
  }

  @Get('callback')
  async callback(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Query() _query: Record<string, string>,
  ) {
    try {
      const raw = (req.cookies as Record<string, string> | undefined)?.[
        FLOW_COOKIE
      ];
      if (!raw) return this.fail(res, 'missing OIDC flow state');

      let checks: OidcFlowChecks;
      try {
        checks = JSON.parse(raw);
      } catch {
        return this.fail(res, 'invalid OIDC flow state');
      }

      // Reconstruct the exact callback URL (path + query) for validation.
      const base = this.env.getOidcRedirectUri().split('?')[0];
      const queryString = (req.raw.url ?? '').split('?')[1] ?? '';
      const currentUrl = queryString ? `${base}?${queryString}` : base;

      const authToken = await this.oidc.completeLogin(
        currentUrl,
        checks,
        workspace.id,
      );

      // Clear the single-use flow cookie and set the session.
      res.clearCookie(FLOW_COOKIE, { path: '/' });
      res.setCookie('authToken', authToken, {
        httpOnly: true,
        sameSite: this.env.getAuthCookieSameSite(),
        path: '/',
        expires: this.env.getCookieExpiresIn(),
        secure: this.env.isHttps(),
      });
      return res.header('Location', this.env.getAppUrl()).code(302).send();
    } catch (err) {
      return this.fail(res, err instanceof Error ? err.message : String(err));
    }
  }
}
