import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { OidcAuthService, OidcFlowChecks } from './oidc-auth.service';
import { SessionService } from '../../session/session.service';
import { PlatformConfigService } from '../../platform/platform.config';

const FLOW_COOKIE = 'oidc_flow';
/**
 * The ID token from this browser's sign-in, kept only to name the session at sign-out
 * (`id_token_hint`). httpOnly, because nothing in the page has any use for it.
 */
const ID_TOKEN_COOKIE = 'cq_idt';

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
    private readonly sessions: SessionService,
    private readonly platformConfig: PlatformConfigService,
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

  /**
   * Sign out of Conqr, from ConqrHub. The same act as ConqrService's: this product's session ends,
   * the identity engine's session ends, and the browser is returned to ConqrHome carrying
   * `?signed_out=1`, which is what tells Home to end its own session too. Three sessions, one
   * click — and a person who signs out of one Conqr product has signed out of Conqr.
   *
   * A GET because the browser has to travel: a fetch would end this product's session and leave
   * the other two standing.
   */
  @Get('logout')
  async logout(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const idToken = (req.cookies as Record<string, string> | undefined)?.[
      ID_TOKEN_COOKIE
    ];
    // Hub's own session first, and independently of what the engine does next: a failure out there
    // must not leave a working session in here.
    const sessionId = (req.raw as unknown as { sessionId?: string }).sessionId;
    if (sessionId) {
      try {
        await this.sessions.revokeSessionById(sessionId);
      } catch {
        /* already gone; the cookie is cleared either way */
      }
    }
    res.clearCookie('authToken', { path: '/' });
    res.clearCookie(ID_TOKEN_COOKIE, { path: '/' });

    const home = this.platformConfig.getSuiteHomeUrl();
    const landing = home ? `${home}?signed_out=1` : `${this.env.getAppUrl()}/`;
    try {
      return res
        .header('Location', await this.oidc.endSessionUrl(landing, idToken))
        .code(302)
        .send();
    } catch (err) {
      // The local sign-out has happened; only the trip to the engine failed. Leave anyway, and
      // leave in the same direction, so nobody lands back inside the product they just left.
      this.logger.warn(
        `end-session redirect failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return res.header('Location', landing).code(302).send();
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
      const idToken = this.oidc.lastIdToken;
      if (idToken) {
        res.setCookie(ID_TOKEN_COOKIE, idToken, {
          httpOnly: true,
          sameSite: this.env.getAuthCookieSameSite(),
          path: '/',
          expires: this.env.getCookieExpiresIn(),
          secure: this.env.isHttps(),
        });
      }
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
