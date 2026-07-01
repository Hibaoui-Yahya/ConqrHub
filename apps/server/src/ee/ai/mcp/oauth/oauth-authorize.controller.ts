import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../../../common/decorators/skip-transform.decorator';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { TokenService } from '../../../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { Workspace } from '@docmost/db/types/entity.types';
import { JwtType } from '../../../../core/auth/dto/jwt-payload';
import { isUserDisabled } from '../../../../common/helpers';
import { McpOauthService } from './mcp-oauth.service';
import { renderConsentPage } from './consent-page';
import { isSupportedChallengeMethod } from './pkce.util';
import { redirectUriMatches, resolveOAuthUrls } from './oauth-url.util';
import {
  isMcpEnabledForWorkspace,
  resolveRequestWorkspace,
} from './oauth-request.util';

interface ResolvedSession {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
}

@Controller('oauth/authorize')
export class OauthAuthorizeController {
  constructor(
    private readonly service: McpOauthService,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  // --- GET: render login redirect or consent ---------------------------------

  @SkipTransform()
  @Get()
  async authorize(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Query() query: Record<string, string>,
  ) {
    const workspace = await resolveRequestWorkspace(
      req,
      this.workspaceRepo,
      this.environmentService,
    );
    if (!isMcpEnabledForWorkspace(workspace)) {
      return this.errorPage(res, 404, 'MCP is not enabled for this workspace.');
    }

    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });

    const clientId = query.client_id;
    const redirectUri = query.redirect_uri;

    // 1. Client + redirect_uri must be valid before we ever redirect back.
    const client = clientId ? await this.service.getClient(clientId) : undefined;
    if (!client) {
      return this.errorPage(res, 400, 'Unknown or missing client_id.');
    }
    const registered = this.service.clientRedirectUris(client);
    if (!redirectUri || !redirectUriMatches(registered, redirectUri)) {
      return this.errorPage(
        res,
        400,
        'The redirect_uri does not match any registered URI for this client.',
      );
    }

    // 2. Remaining params — redirect_uri is now trusted, so errors redirect back.
    const paramError = this.validateAuthParams(query, urls.resource);
    if (paramError) {
      return this.redirectBack(res, redirectUri, urls.issuer, {
        error: paramError.error,
        error_description: paramError.description,
        state: query.state,
      });
    }

    // 3. Session — bounce to login if absent.
    const session = await this.resolveSession(req, workspace);
    if (!session) {
      const loginUrl = `${urls.origin}/login?redirect=${encodeURIComponent(req.url)}`;
      return this.redirect(res, loginUrl);
    }

    // 4. Render consent.
    const scope = this.service.resolveScope(query.scope);
    const html = renderConsentPage({
      clientName: client.clientName || clientId,
      userEmail: session.userEmail,
      workspaceName: session.workspaceName,
      scopes: scope.split(' ').filter(Boolean),
      hidden: {
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: query.code_challenge,
        code_challenge_method: query.code_challenge_method,
        state: query.state ?? '',
        scope,
        resource: query.resource || urls.resource,
      },
    });

    (res as any)
      .status(200)
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(html);
  }

  // --- POST: consent decision ------------------------------------------------

  @SkipTransform()
  @Post('consent')
  async consent(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Body() body: Record<string, string>,
  ) {
    const urls = resolveOAuthUrls(req.raw, {
      defaultHttps: this.environmentService.isHttps(),
    });

    // NB: we deliberately do NOT gate on the Origin header. CSRF is already
    // covered by the SameSite=Lax authToken cookie — a genuinely cross-site
    // POST won't carry it, so resolveSession() below returns null → 401. MCP
    // connectors (ChatGPT desktop, Claude) submit the consent form from their
    // own embedded webview, sending `Origin: https://chatgpt.com`, `null`, etc.;
    // rejecting those origins 403'd the approval and broke the connect flow
    // ("consent appeared, then stuck").
    const workspace = await resolveRequestWorkspace(
      req,
      this.workspaceRepo,
      this.environmentService,
    );
    if (!isMcpEnabledForWorkspace(workspace)) {
      return this.errorPage(res, 404, 'MCP is not enabled for this workspace.');
    }

    const session = await this.resolveSession(req, workspace);
    if (!session) {
      return this.errorPage(res, 401, 'Your session has expired. Please retry.');
    }

    const clientId = body.client_id;
    const redirectUri = body.redirect_uri;

    const client = clientId ? await this.service.getClient(clientId) : undefined;
    if (!client) {
      return this.errorPage(res, 400, 'Unknown client.');
    }
    const registered = this.service.clientRedirectUris(client);
    if (!redirectUri || !redirectUriMatches(registered, redirectUri)) {
      return this.errorPage(res, 400, 'Invalid redirect_uri.');
    }

    if (body.decision !== 'approve') {
      return this.redirectBack(res, redirectUri, urls.issuer, {
        error: 'access_denied',
        error_description: 'User denied access',
        state: body.state,
      });
    }

    // Re-validate PKCE + resource on the trusted submission.
    const paramError = this.validateAuthParams(body, urls.resource);
    if (paramError) {
      return this.redirectBack(res, redirectUri, urls.issuer, {
        error: paramError.error,
        error_description: paramError.description,
        state: body.state,
      });
    }

    const code = await this.service.issueAuthorizationCode({
      clientId,
      userId: session.userId,
      workspaceId: session.workspaceId,
      redirectUri,
      codeChallenge: body.code_challenge,
      scope: this.service.resolveScope(body.scope),
      resource: body.resource || urls.resource,
    });

    return this.redirectBack(res, redirectUri, urls.issuer, {
      code,
      state: body.state,
    });
  }

  // --- helpers ---------------------------------------------------------------

  private validateAuthParams(
    p: Record<string, string>,
    canonicalResource: string,
  ): { error: string; description: string } | null {
    if (p.response_type !== 'code') {
      return {
        error: 'unsupported_response_type',
        description: 'only response_type=code is supported',
      };
    }
    if (!p.code_challenge) {
      return {
        error: 'invalid_request',
        description: 'code_challenge is required (PKCE)',
      };
    }
    if (!isSupportedChallengeMethod(p.code_challenge_method)) {
      return {
        error: 'invalid_request',
        description: 'code_challenge_method must be S256',
      };
    }
    if (p.resource && p.resource !== canonicalResource) {
      return {
        error: 'invalid_target',
        description: 'resource does not match this MCP server',
      };
    }
    // Scope is intentionally NOT rejected here. Clients (e.g. Claude, ChatGPT)
    // may request scopes beyond what we advertise; per OAuth 2.0 §3.3 the AS may
    // narrow the granted scope rather than fail. resolveScope() clamps the
    // request down to our supported set (always granting `mcp`), and the granted
    // scope is echoed back in the token response. Hard-rejecting unknown scopes
    // with invalid_scope broke the connector handshake ("Authorization failed").
    return null;
  }

  private async resolveSession(
    req: FastifyRequest,
    workspace: Workspace | undefined,
  ): Promise<ResolvedSession | null> {
    const token = (req as any).cookies?.authToken;
    if (!token) return null;

    let payload: any;
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.ACCESS);
    } catch {
      return null;
    }

    if (!workspace || payload.workspaceId !== workspace.id) return null;

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) return null;

    if (payload.sessionId) {
      const dbSession = await this.userSessionRepo.findActiveById(
        payload.sessionId,
      );
      if (
        !dbSession ||
        dbSession.userId !== payload.sub ||
        dbSession.workspaceId !== payload.workspaceId
      ) {
        return null;
      }
    }

    return {
      userId: user.id,
      userEmail: user.email,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    };
  }

  private redirectBack(
    res: FastifyReply,
    redirectUri: string,
    issuer: string,
    params: Record<string, string | undefined>,
  ) {
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      return this.errorPage(res, 400, 'Invalid redirect_uri.');
    }
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
    // RFC 9207 — required because we advertise iss support.
    url.searchParams.set('iss', issuer);
    this.redirect(res, url.toString());
  }

  private redirect(res: FastifyReply, location: string) {
    (res as any)
      .status(302)
      .header('Location', location)
      .header('Cache-Control', 'no-store')
      .send();
  }

  private errorPage(res: FastifyReply, status: number, message: string) {
    const safe = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    (res as any)
      .status(status)
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Authorization error</title></head><body style="font-family:system-ui;background:#0b0d12;color:#e7e9ee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:18px">Authorization error</h1><p style="color:#9aa3b6">${safe}</p></div></body></html>`,
      );
  }
}
