import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as openid from 'openid-client';
import { randomBytes } from 'node:crypto';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SignupService } from '../services/signup.service';
import { SessionService } from '../../session/session.service';
import { mapOidcClaimsToUser } from './oidc.util';

export interface OidcFlowChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Shared-IdP OIDC login (blueprint §9.1: "one OIDC identity provider ... one
 * sign-in"). Uses PKCE + state + nonce, provisions users just-in-time into the
 * workspace, and issues a standard Hub session. The IdP choice is configuration
 * (OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET), so any conformant provider works.
 */
@Injectable()
export class OidcAuthService {
  constructor(
    private readonly env: EnvironmentService,
    private readonly userRepo: UserRepo,
    private readonly signupService: SignupService,
    private readonly sessionService: SessionService,
  ) {}

  isEnabled(): boolean {
    return this.env.isOidcEnabled();
  }

  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async config(): Promise<openid.Configuration> {
    const issuer = this.env.getOidcIssuerUrl();
    // Permit http ONLY when the configured issuer is itself http (e.g. a local
    // Keycloak/Dex). Keyed off the issuer scheme — not NODE_ENV — because the
    // prod container runs NODE_ENV=production yet may point at an http IdP in a
    // self-hosted network. https issuers never trigger this. The `execute` hook
    // must be passed to discovery so the discovery request itself is allowed
    // over http; allowInsecureRequests(config) then covers token requests.
    const insecure = issuer.startsWith('http://');
    // Hard timeout so a slow/unreachable IdP (or an issuer-mismatch stall) can
    // never hang the login request — it fails fast and the controller redirects
    // to /login?error=sso instead of leaving the browser spinning.
    const config = await this.withTimeout(
      openid.discovery(
        new URL(issuer),
        this.env.getOidcClientId(),
        this.env.getOidcClientSecret(),
        undefined,
        insecure ? { execute: [openid.allowInsecureRequests] } : undefined,
      ),
      8000,
      'OIDC discovery timed out',
    );
    if (insecure) {
      openid.allowInsecureRequests(config);
    }
    return config;
  }

  /** Build the authorization redirect + the per-flow checks to persist. */
  async beginLogin(): Promise<{ url: string } & OidcFlowChecks> {
    if (!this.isEnabled()) {
      throw new UnauthorizedException('OIDC login is not configured');
    }
    const config = await this.config();
    const state = openid.randomState();
    const nonce = openid.randomNonce();
    const codeVerifier = openid.randomPKCECodeVerifier();
    const codeChallenge = await openid.calculatePKCECodeChallenge(codeVerifier);

    const url = openid
      .buildAuthorizationUrl(config, {
        redirect_uri: this.env.getOidcRedirectUri(),
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      .href;

    return { url, state, nonce, codeVerifier };
  }

  /**
   * Exchange the callback, validate state/nonce/PKCE, JIT-provision the user in
   * the workspace, and return a Hub session token.
   */
  async completeLogin(
    currentUrl: string,
    checks: OidcFlowChecks,
    workspaceId: string,
  ): Promise<string> {
    if (!this.isEnabled()) {
      throw new UnauthorizedException('OIDC login is not configured');
    }
    const config = await this.config();

    const tokens = await this.withTimeout(
      openid.authorizationCodeGrant(config, new URL(currentUrl), {
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        pkceCodeVerifier: checks.codeVerifier,
      }),
      8000,
      'OIDC token exchange timed out',
    );

    const mapped = mapOidcClaimsToUser(tokens.claims());

    let user = await this.userRepo.findByEmail(mapped.email, workspaceId);
    if (!user) {
      // Just-in-time provisioning (§9.1). OIDC users authenticate via the IdP;
      // the local password is a random value they never use.
      user = await this.signupService.signup(
        {
          email: mapped.email,
          name: mapped.name,
          password: randomBytes(24).toString('base64url'),
        },
        workspaceId,
      );
    }

    return this.sessionService.createSessionAndToken(user);
  }
}
