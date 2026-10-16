import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { User } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { SuiteTokenFamilyRepo } from '@docmost/db/repos/auth/suite-token-family.repo';
import {
  epochMatches,
  familyIsLive,
  refreshReusePolicy,
  suiteTokenEpoch,
} from './suite-token-policy';

const CODE_AUD = 'conqr-suite-idp-code';
const ACCESS_AUD = 'conqr-suite-idp-access';
const REFRESH_AUD = 'conqr-suite-idp-refresh';
const CODE_TTL = '60s';
const ACCESS_TTL_SECONDS = 300;
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;

/** Exported for JwtStrategy: suite access tokens are accepted on the API. */
export const SUITE_IDP_ACCESS_AUD = ACCESS_AUD;

export interface SuiteIdpClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Parse and validate `SUITE_IDP_CLIENTS` (`id|secret|redirectUri;…`). Throws on a malformed
 * entry so a typo fails startup instead of silently dropping a client. Error messages name
 * the entry position and client id only — never the secret (F28). Legacy well-formed
 * entries (short secrets, http://localhost redirect URIs) keep working unchanged.
 */
export function parseSuiteIdpClients(raw: string | undefined): SuiteIdpClient[] {
  const entries = (raw ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const clients: SuiteIdpClient[] = [];
  entries.forEach((entry, index) => {
    const [clientId, clientSecret, ...rest] = entry.split('|');
    const redirectUri = rest.join('|').trim();
    const id = clientId?.trim() ?? '';
    const where = `SUITE_IDP_CLIENTS entry #${index + 1}${id ? ` (client '${id}')` : ''}`;
    if (!CLIENT_ID_PATTERN.test(id)) {
      throw new Error(`${where}: client id is missing or contains invalid characters`);
    }
    if (!clientSecret || !clientSecret.trim()) {
      throw new Error(`${where}: client secret is missing`);
    }
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      throw new Error(`${where}: redirect URI is not an absolute URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`${where}: redirect URI must use http or https`);
    }
    if (url.hash) {
      throw new Error(`${where}: redirect URI must not contain a fragment`);
    }
    if (clients.some((c) => c.clientId === id)) {
      throw new Error(`${where}: duplicate client id`);
    }
    clients.push({ clientId: id, clientSecret: clientSecret.trim(), redirectUri });
  });
  return clients;
}

/**
 * True when a token request failed because the grant itself was refused
 * (expired, replayed, wrong client, revoked). Every refusal in this service is
 * an UnauthorizedException; anything else is an infrastructure failure the
 * controller reports as `temporarily_unavailable` instead of `invalid_grant`.
 */
export function isGrantRefusal(err: unknown): boolean {
  return err instanceof UnauthorizedException;
}

/** Constant-time comparison that is safe for inputs of different length. */
function secretsEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
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
  private readonly registeredClients: SuiteIdpClient[];

  constructor(
    private readonly jwtService: JwtService,
    private readonly environment: EnvironmentService,
    redisService: RedisService,
    private readonly families: SuiteTokenFamilyRepo,
  ) {
    this.redis = redisService.getOrThrow();
    // Parsed and validated once at startup (F28): a malformed registry fails boot
    // with a secret-free message instead of silently dropping a client.
    this.registeredClients = parseSuiteIdpClients(
      this.environment.getSuiteIdpClientsRaw(),
    );
  }

  /** SUITE_IDP_CLIENTS="id|secret|redirectUri;id2|secret2|redirect2" (validated at startup). */
  clients(): SuiteIdpClient[] {
    return this.registeredClients;
  }

  /**
   * Constant-time client authentication. Unknown clients are compared against a
   * dummy value so response timing does not reveal whether the client id exists;
   * callers must return the same `invalid_client` error in both cases (F28).
   */
  verifyClientSecret(
    client: SuiteIdpClient | undefined,
    presented: unknown,
  ): boolean {
    const expected = client?.clientSecret ?? randomUUID();
    const given = typeof presented === 'string' ? presented : '';
    const equal = secretsEqual(expected, given);
    return client !== undefined && given.length > 0 && equal;
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

  /**
   * One-time code. `sid` records the Hub session that authorized it, so the
   * tokens it is exchanged for can be tied to that session's lifetime.
   */
  issueCode(
    user: User,
    workspaceId: string,
    client: SuiteIdpClient,
    sessionId?: string,
  ): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        workspaceId,
        aud: CODE_AUD,
        client_id: client.clientId,
        jti: randomUUID(),
        ...(sessionId ? { sid: sessionId } : {}),
      },
      { expiresIn: CODE_TTL },
    );
  }

  /**
   * Validate + consume an authorization code. One-time: the jti is claimed in
   * Redis; a replayed code is rejected even inside its JWT lifetime. The code
   * must name the Hub session that authorized it (`sid`): codes from before
   * token families existed cannot be tied to a session and are refused.
   */
  async exchangeCode(
    code: string,
    client: SuiteIdpClient,
  ): Promise<{ userId: string; workspaceId: string; sessionId: string }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(code, {
        audience: CODE_AUD,
      });
    } catch {
      throw new UnauthorizedException('invalid_grant');
    }
    if (payload.client_id !== client.clientId || !payload.jti || !payload.sid) {
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
    return {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      sessionId: payload.sid,
    };
  }

  /**
   * Short-lived access token. `azp` names the client (its route profile is
   * enforced by the API guard), `fid` the family whose liveness is checked
   * on every request, `ep` the epoch it was minted under.
   */
  issueAccessToken(
    userId: string,
    workspaceId: string,
    client: SuiteIdpClient,
    familyId: string,
  ): {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
  } {
    const access_token = this.jwtService.sign(
      {
        sub: userId,
        workspaceId,
        aud: ACCESS_AUD,
        azp: client.clientId,
        fid: familyId,
        ep: suiteTokenEpoch(),
      },
      { expiresIn: ACCESS_TTL_SECONDS },
    );
    return { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS };
  }

  private signRefresh(
    userId: string,
    workspaceId: string,
    client: SuiteIdpClient,
    familyId: string,
    jti: string,
    familyExpiresAt: Date,
  ): string {
    const seconds = Math.max(
      1,
      Math.floor((familyExpiresAt.getTime() - Date.now()) / 1000),
    );
    return this.jwtService.sign(
      {
        sub: userId,
        workspaceId,
        aud: REFRESH_AUD,
        client_id: client.clientId,
        jti,
        fid: familyId,
        ep: suiteTokenEpoch(),
      },
      { expiresIn: Math.min(seconds, REFRESH_TTL_SECONDS) },
    );
  }

  /**
   * First token pair of a sign-in: creates the token family, tied to the
   * Hub session that authorized the code. Refused if that session ended
   * between authorize and the code exchange.
   */
  async issueTokenPair(
    userId: string,
    workspaceId: string,
    client: SuiteIdpClient,
    sessionId: string,
  ): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token: string;
  }> {
    const jti = randomUUID();
    const family = await this.families.createForSession({
      userId,
      workspaceId,
      clientId: client.clientId,
      hubSessionId: sessionId,
      currentJti: jti,
      maxLifetimeSeconds: REFRESH_TTL_SECONDS,
    });
    if (!family) throw new UnauthorizedException('invalid_grant');
    return {
      ...this.issueAccessToken(userId, workspaceId, client, family.id),
      refresh_token: this.signRefresh(
        userId,
        workspaceId,
        client,
        family.id,
        jti,
        family.expiresAt,
      ),
    };
  }

  /**
   * Rotate a refresh token. The family row decides (ADR-HM-001 v3 §3, §4):
   * the current token rotates; the previous one is honoured idempotently
   * inside a short window (lost responses, concurrent BFF processes) by
   * re-issuing the current generation, never a new branch; any other token
   * of the family is a replay and revokes the whole family.
   */
  async rotateRefreshToken(
    refreshToken: string,
    client: SuiteIdpClient,
  ): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token: string;
  }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        audience: REFRESH_AUD,
      });
    } catch {
      throw new UnauthorizedException('invalid_grant');
    }
    if (
      payload.client_id !== client.clientId ||
      !payload.jti ||
      !payload.fid ||
      !epochMatches(payload.ep, suiteTokenEpoch())
    ) {
      // No family (pre-family token) or a stale epoch: sign in again.
      throw new UnauthorizedException('invalid_grant');
    }
    const reuse = refreshReusePolicy();
    const newJti = randomUUID();
    const outcome = await this.families.rotate({
      familyId: payload.fid,
      clientId: client.clientId,
      presentedJti: payload.jti,
      newJti,
      reuseWindowSeconds: reuse.windowSeconds,
      maxReuse: reuse.maxReuse,
    });
    if (outcome.status === 'invalid' || outcome.status === 'replay') {
      throw new UnauthorizedException('invalid_grant');
    }
    const jti = outcome.status === 'rotated' ? newJti : (outcome as any).currentJti;
    const ok = outcome as { userId: string; workspaceId: string; expiresAt: Date };
    return {
      ...this.issueAccessToken(ok.userId, ok.workspaceId, client, payload.fid),
      refresh_token: this.signRefresh(
        ok.userId,
        ok.workspaceId,
        client,
        payload.fid,
        jti,
        ok.expiresAt,
      ),
    };
  }

  /** Signature, audience and epoch of a suite access token (liveness is checked by the API guard). */
  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; workspaceId: string; familyId?: string; clientId?: string }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        audience: ACCESS_AUD,
      });
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    if (!epochMatches(payload.ep, suiteTokenEpoch())) {
      throw new UnauthorizedException('invalid_token');
    }
    return {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      familyId: payload.fid,
      clientId: payload.azp,
    };
  }

  /**
   * Whether the family behind verified access-token claims is still live.
   * Throws (not false) when the state cannot be read: callers answer 503.
   */
  async isAccessTokenLive(claims: {
    userId: string;
    workspaceId: string;
    familyId?: string;
    clientId?: string;
  }): Promise<boolean> {
    if (!claims.familyId) return false;
    const family = await this.families.findForRequest(claims.familyId);
    return familyIsLive(family, claims);
  }

  /**
   * Hub–Meet unified logout, server to server: ends the Hub session behind
   * the presented refresh token and every token family of that session.
   * Any token of the family identifies it — even one already rotated away
   * or expired — so a logout retried after a lost response still works.
   * Idempotent.
   */
  async endSession(
    refreshToken: string,
    client: SuiteIdpClient,
  ): Promise<
    | { result: 'ended' | 'already_ended'; userId: string; workspaceId: string; hubSessionId: string | null }
    | { result: 'already_ended' }
  > {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        audience: REFRESH_AUD,
        ignoreExpiration: true,
      });
    } catch {
      throw new UnauthorizedException('invalid_grant');
    }
    if (payload.client_id !== client.clientId) {
      throw new UnauthorizedException('invalid_grant');
    }
    // A token from before families existed names no session: nothing
    // server-side can still be revoked through it.
    if (!payload.fid) return { result: 'already_ended' };
    const ended = await this.families.endSessionForFamily(payload.fid, client.clientId);
    if (ended.result === 'unknown') return { result: 'already_ended' };
    return ended;
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
