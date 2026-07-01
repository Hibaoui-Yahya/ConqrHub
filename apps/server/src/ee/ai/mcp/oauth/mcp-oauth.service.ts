import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { McpOauthClientRepo } from './mcp-oauth-client.repo';
import { McpOauthRefreshTokenRepo } from './mcp-oauth-refresh-token.repo';
import { ApiKeyRepo } from '../../../api-key/api-key.repo';
import { TokenService } from '../../../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { isUserDisabled } from '../../../../common/helpers';
import { InsertableApiKey, McpOauthClient } from '@docmost/db/types/entity.types';
import { OAuthError } from './oauth.errors';
import { verifyPkceS256 } from './pkce.util';
import {
  isRegistrableRedirectUri,
  OAuthUrls,
  redirectUriMatches,
} from './oauth-url.util';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_REDIS_PREFIX,
  AUTH_CODE_TTL_SECONDS,
  GRANT_TYPE_MCP_OAUTH,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_SECONDS,
  SCOPE_MCP,
  SUPPORTED_SCOPES,
} from './oauth.constants';

interface StoredAuthCode {
  clientId: string;
  userId: string;
  workspaceId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class McpOauthService {
  private readonly logger = new Logger(McpOauthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly clientRepo: McpOauthClientRepo,
    private readonly refreshRepo: McpOauthRefreshTokenRepo,
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly environmentService: EnvironmentService,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  // --- Discovery documents ---------------------------------------------------

  buildProtectedResourceMetadata(urls: OAuthUrls) {
    return {
      resource: urls.resource,
      authorization_servers: [urls.issuer],
      scopes_supported: SUPPORTED_SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'ConqrHub MCP',
    };
  }

  buildAuthorizationServerMetadata(urls: OAuthUrls) {
    return {
      issuer: urls.issuer,
      authorization_endpoint: urls.authorizationEndpoint,
      token_endpoint: urls.tokenEndpoint,
      registration_endpoint: urls.registrationEndpoint,
      revocation_endpoint: urls.revocationEndpoint,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: SUPPORTED_SCOPES,
      authorization_response_iss_parameter_supported: true,
    };
  }

  // --- Dynamic Client Registration (RFC 7591) --------------------------------

  async registerClient(
    body: Record<string, unknown>,
    workspaceId: string | null,
  ) {
    const redirectUris = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      !redirectUris.every((u) => typeof u === 'string')
    ) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'redirect_uris is required and must be a non-empty array of strings',
      );
    }

    for (const uri of redirectUris as string[]) {
      if (!isRegistrableRedirectUri(uri)) {
        throw new OAuthError(
          'invalid_redirect_uri',
          `redirect_uri is not allowed: ${uri} (must be https, or http loopback)`,
        );
      }
    }

    const clientId = `mcp_${randomBytes(16).toString('hex')}`;
    const clientName =
      typeof body.client_name === 'string' ? body.client_name : null;
    const scope = typeof body.scope === 'string' ? body.scope : null;

    const row = await this.clientRepo.insert({
      clientId,
      clientName,
      redirectUris: JSON.stringify(redirectUris) as any,
      grantTypes: JSON.stringify(['authorization_code', 'refresh_token']) as any,
      responseTypes: JSON.stringify(['code']) as any,
      tokenEndpointAuthMethod: 'none',
      scope,
      workspaceId,
    });

    return {
      client_id: row.clientId,
      client_id_issued_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(clientName ? { client_name: clientName } : {}),
      ...(scope ? { scope } : {}),
    };
  }

  async getClient(clientId: string): Promise<McpOauthClient | undefined> {
    return this.clientRepo.findByClientId(clientId);
  }

  /** Parse the stored redirect_uris jsonb into a string[]. */
  clientRedirectUris(client: McpOauthClient): string[] {
    const raw = client.redirectUris as unknown;
    if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string');
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((u) => typeof u === 'string')
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // --- Scope helpers ---------------------------------------------------------

  /** Clamp a requested scope string to what we support; always includes mcp. */
  resolveScope(requested: string | undefined): string {
    const parts = (requested ?? '')
      .split(/\s+/)
      .filter((s) => s && SUPPORTED_SCOPES.includes(s));
    const set = new Set(parts);
    set.add(SCOPE_MCP); // mcp is always granted
    return Array.from(set).join(' ');
  }

  // --- Authorization code issue (called after consent) -----------------------

  async issueAuthorizationCode(params: StoredAuthCode): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(
      `${AUTH_CODE_REDIS_PREFIX}${code}`,
      JSON.stringify(params),
      'EX',
      AUTH_CODE_TTL_SECONDS,
    );
    return code;
  }

  // --- Token endpoint: authorization_code grant ------------------------------

  async exchangeAuthorizationCode(
    params: {
      code?: string;
      clientId?: string;
      redirectUri?: string;
      codeVerifier?: string;
      resource?: string;
    },
    urls: OAuthUrls,
  ): Promise<TokenResponse> {
    const { code, clientId, redirectUri, codeVerifier, resource } = params;

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      throw new OAuthError(
        'invalid_request',
        'code, client_id, redirect_uri and code_verifier are required',
      );
    }

    // One-time: atomically fetch-and-delete the code.
    const raw = await this.redis.getdel(`${AUTH_CODE_REDIS_PREFIX}${code}`);
    if (!raw) {
      throw new OAuthError('invalid_grant', 'authorization code is invalid or expired');
    }

    let stored: StoredAuthCode;
    try {
      stored = JSON.parse(raw);
    } catch {
      throw new OAuthError('invalid_grant', 'authorization code is corrupt');
    }

    if (stored.clientId !== clientId) {
      throw new OAuthError('invalid_grant', 'client_id does not match the authorization code');
    }
    if (stored.redirectUri !== redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization code');
    }
    if (resource && resource !== stored.resource) {
      throw new OAuthError('invalid_target', 'resource does not match the authorization request');
    }
    if (!verifyPkceS256(codeVerifier, stored.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }

    const user = await this.userRepo.findById(stored.userId, stored.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new OAuthError('invalid_grant', 'user is no longer active');
    }

    // Durable grant = an api_keys row (revocable, last_used tracked).
    const grant = await this.apiKeyRepo.insert({
      name: this.grantName(clientId),
      creatorId: stored.userId,
      workspaceId: stored.workspaceId,
      type: GRANT_TYPE_MCP_OAUTH,
      clientId,
    } as InsertableApiKey);

    return this.mintTokens({
      apiKeyId: grant.id,
      user,
      workspaceId: stored.workspaceId,
      clientId,
      scope: stored.scope,
      resource: stored.resource,
    });
  }

  // --- Token endpoint: refresh_token grant -----------------------------------

  async refreshAccessToken(
    params: { refreshToken?: string; clientId?: string; scope?: string; resource?: string },
    urls: OAuthUrls,
  ): Promise<TokenResponse> {
    const { refreshToken, clientId } = params;
    if (!refreshToken) {
      throw new OAuthError('invalid_request', 'refresh_token is required');
    }

    const tokenHash = this.hashToken(refreshToken);
    const record = await this.refreshRepo.findByHash(tokenHash);
    if (!record) {
      throw new OAuthError('invalid_grant', 'refresh token is invalid');
    }

    // Reuse of an already-rotated token => compromise. Revoke the whole grant.
    if (record.rotatedAt) {
      await this.revokeGrant(record.apiKeyId, record.workspaceId);
      this.logger.warn(
        `Refresh token reuse detected for grant ${record.apiKeyId}; chain revoked`,
      );
      throw new OAuthError('invalid_grant', 'refresh token has already been used');
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      throw new OAuthError('invalid_grant', 'refresh token has expired');
    }
    if (clientId && record.clientId !== clientId) {
      throw new OAuthError('invalid_grant', 'client_id does not match the refresh token');
    }
    if (params.resource && params.resource !== record.resource) {
      throw new OAuthError('invalid_target', 'resource does not match the grant');
    }

    // Grant still active?
    const grant = await this.apiKeyRepo.findById(
      record.apiKeyId,
      record.workspaceId,
    );
    if (!grant) {
      throw new OAuthError('invalid_grant', 'grant has been revoked');
    }

    const user = await this.userRepo.findById(record.userId, record.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new OAuthError('invalid_grant', 'user is no longer active');
    }

    // Rotate: mark the presented token used. If nothing was updated, another
    // request already rotated it (race / reuse) — refuse.
    const rotated = await this.refreshRepo.markRotated(record.id);
    if (rotated === 0) {
      throw new OAuthError('invalid_grant', 'refresh token has already been used');
    }

    // Downscope only.
    const scope = this.clampToGranted(params.scope, record.scope ?? SCOPE_MCP);

    return this.mintTokens({
      apiKeyId: record.apiKeyId,
      user,
      workspaceId: record.workspaceId,
      clientId: record.clientId,
      scope,
      resource: record.resource ?? urls.resource,
    });
  }

  // --- Revocation (RFC 7009) -------------------------------------------------

  async revoke(token: string): Promise<void> {
    if (!token) return;

    // Refresh token path.
    if (token.startsWith(REFRESH_TOKEN_PREFIX)) {
      const record = await this.refreshRepo.findByHash(this.hashToken(token));
      if (record) {
        await this.revokeGrant(record.apiKeyId, record.workspaceId);
      }
      return;
    }

    // Access token (JWT) path — revoke the underlying grant.
    const claims = this.decodeJwtClaims(token);
    if (claims?.apiKeyId && claims?.workspaceId) {
      await this.revokeGrant(claims.apiKeyId, claims.workspaceId);
    }
  }

  // --- internals -------------------------------------------------------------

  private async mintTokens(opts: {
    apiKeyId: string;
    user: any;
    workspaceId: string;
    clientId: string;
    scope: string;
    resource: string;
  }): Promise<TokenResponse> {
    const accessToken = await this.tokenService.generateMcpAccessToken({
      apiKeyId: opts.apiKeyId,
      user: opts.user,
      workspaceId: opts.workspaceId,
      audience: opts.resource,
      scope: opts.scope,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });

    const refreshToken = `${REFRESH_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    await this.refreshRepo.insert({
      tokenHash: this.hashToken(refreshToken),
      clientId: opts.clientId,
      apiKeyId: opts.apiKeyId,
      userId: opts.user.id,
      workspaceId: opts.workspaceId,
      scope: opts.scope,
      resource: opts.resource,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: opts.scope,
    };
  }

  private async revokeGrant(apiKeyId: string, workspaceId: string) {
    await this.refreshRepo.deleteByApiKeyId(apiKeyId);
    await this.apiKeyRepo.revoke(apiKeyId, workspaceId);
  }

  private grantName(clientId: string): string {
    return `MCP · ${clientId}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private clampToGranted(requested: string | undefined, granted: string): string {
    if (!requested) return granted;
    const grantedSet = new Set(granted.split(/\s+/).filter(Boolean));
    const parts = requested.split(/\s+/).filter((s) => s && grantedSet.has(s));
    if (parts.length === 0) return granted;
    if (!parts.includes(SCOPE_MCP) && grantedSet.has(SCOPE_MCP)) {
      parts.push(SCOPE_MCP);
    }
    return parts.join(' ');
  }

  private decodeJwtClaims(
    token: string,
  ): { apiKeyId?: string; workspaceId?: string } | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = Buffer.from(payload, 'base64url').toString('utf8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}
