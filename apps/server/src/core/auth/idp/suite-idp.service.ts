import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { User } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const CODE_AUD = 'conqr-suite-idp-code';
const ACCESS_AUD = 'conqr-suite-idp-access';
const CODE_TTL = '60s';
const ACCESS_TTL_SECONDS = 300;

export interface SuiteIdpClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * ConqrHub as the suite's identity provider (blueprint §9.1, §14 #4 decided:
 * ConqrHub owns suite identity). A minimal OIDC-shaped surface for TRUSTED
 * first-party clients (the Plane fork): authorization-code + confidential
 * client secret, one-time codes, short-lived access tokens, userinfo claims.
 * Clients are statically configured via SUITE_IDP_CLIENTS — this is not a
 * public authorization server and performs no dynamic registration.
 */
@Injectable()
export class SuiteIdpService {
  private readonly redis: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly environment: EnvironmentService,
    redisService: RedisService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  /** SUITE_IDP_CLIENTS="id|secret|redirectUri;id2|secret2|redirect2" */
  clients(): SuiteIdpClient[] {
    const raw = process.env.SUITE_IDP_CLIENTS ?? '';
    return raw
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [clientId, clientSecret, ...rest] = entry.split('|');
        return {
          clientId: clientId?.trim() ?? '',
          clientSecret: clientSecret?.trim() ?? '',
          redirectUri: rest.join('|').trim(),
        };
      })
      .filter((c) => c.clientId && c.clientSecret && c.redirectUri);
  }

  isEnabled(): boolean {
    return this.clients().length > 0;
  }

  findClient(clientId: string | undefined): SuiteIdpClient | undefined {
    if (!clientId) return undefined;
    return this.clients().find((c) => c.clientId === clientId);
  }

  /** Exact-match redirect URI check — first-party clients register ONE URI. */
  redirectUriAllowed(client: SuiteIdpClient, redirectUri: string): boolean {
    return client.redirectUri === redirectUri;
  }

  issueCode(user: User, workspaceId: string, client: SuiteIdpClient): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        workspaceId,
        aud: CODE_AUD,
        client_id: client.clientId,
        jti: randomUUID(),
      },
      { expiresIn: CODE_TTL },
    );
  }

  /**
   * Validate + consume an authorization code. One-time: the jti is claimed in
   * Redis; a replayed code is rejected even inside its JWT lifetime.
   */
  async exchangeCode(
    code: string,
    client: SuiteIdpClient,
  ): Promise<{ userId: string; workspaceId: string }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(code, {
        audience: CODE_AUD,
      });
    } catch {
      throw new UnauthorizedException('invalid_grant');
    }
    if (payload.client_id !== client.clientId || !payload.jti) {
      throw new UnauthorizedException('invalid_grant');
    }
    const claimed = await this.redis.set(
      `suite-idp:code:${payload.jti}`,
      '1',
      'EX',
      120,
      'NX',
    );
    if (claimed !== 'OK') {
      throw new UnauthorizedException('invalid_grant');
    }
    return { userId: payload.sub, workspaceId: payload.workspaceId };
  }

  issueAccessToken(userId: string, workspaceId: string): {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
  } {
    const access_token = this.jwtService.sign(
      { sub: userId, workspaceId, aud: ACCESS_AUD },
      { expiresIn: ACCESS_TTL_SECONDS },
    );
    return { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS };
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; workspaceId: string }> {
    try {
      const payload: any = await this.jwtService.verifyAsync(token, {
        audience: ACCESS_AUD,
      });
      return { userId: payload.sub, workspaceId: payload.workspaceId };
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }

  /** Standard OIDC claims for a Hub user — email is Hub-verified (§9.1). */
  userinfo(user: User): Record<string, unknown> {
    const name = (user.name ?? '').trim();
    const [givenName, ...restName] = name.split(/\s+/);
    return {
      sub: user.id,
      email: user.email,
      email_verified: true,
      name: name || user.email,
      given_name: givenName || undefined,
      family_name: restName.join(' ') || undefined,
      picture: (user as any).avatarUrl ?? undefined,
    };
  }

  /** Discovery doc: browser-facing authorize from APP_URL, backchannel from the request origin. */
  discovery(requestOrigin: string): Record<string, unknown> {
    const appUrl = this.environment.getAppUrl().replace(/\/$/, '');
    const backchannel = requestOrigin.replace(/\/$/, '');
    return {
      issuer: `${backchannel}/api/idp`,
      authorization_endpoint: `${appUrl}/api/idp/authorize`,
      token_endpoint: `${backchannel}/api/idp/token`,
      userinfo_endpoint: `${backchannel}/api/idp/userinfo`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      scopes_supported: ['openid', 'email', 'profile'],
      subject_types_supported: ['public'],
    };
  }
}
