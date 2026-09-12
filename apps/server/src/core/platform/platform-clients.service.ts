/**
 * ConqrHub — Conqr platform integration.
 *
 * Ported from the ConqrService canary unchanged apart from the product it names.
 *
 * The three platform services this product talks to, and nothing else.
 *
 *   **ConqrIdentity** — says who a person canonically is. The product asks once, at login, with the
 *   (issuer, subject) it just authenticated, and gets back a `conqr:person:...` URN. That URN is
 *   the join key; the IdP subject is not, and the e-mail address is emphatically not.
 *
 *   **ConqrAccess** — decides everything about authorization: is this membership live, what roles
 *   does it carry here, is this application installed and entitled. The product never decides any
 *   of that, and never reads a platform table to find out.
 *
 *   **Redis** — read-only, for the revision watermark, so a revocation is seen on the next request
 *   rather than when the context expires. Optional, and its absence costs latency rather than
 *   safety.
 *
 * Everything goes over the private network with the product's own signed service assertion. The
 * product's key is its own: it is not ConqrAuth's, it is not the bootstrap key, and it carries only
 * the scopes below.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AccessClient, signServiceAssertion } from '@conqr/sdk';
import { readRevision, type RevisionReader } from '@conqr/contracts';
import type { PersonUrn, TenantUrn } from '@conqr/contracts';
import Redis from 'ioredis';
import { PlatformConfigService } from './platform.config';

export interface ResolvedPerson {
  personUrn: string;
  email: string | null;
  displayName: string | null;
}

@Injectable()
export class PlatformClientsService implements OnModuleDestroy {
  private readonly logger = new Logger(PlatformClientsService.name);
  private access?: AccessClient;
  private redis?: Redis;

  constructor(private readonly config: PlatformConfigService) {}

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => undefined);
  }

  /** The ConqrAccess client, built once. Throws in standalone mode — check the mode first. */
  getAccess(): AccessClient {
    if (!this.access) {
      const cfg = this.config.requirePlatform();
      this.access = new AccessClient({
        baseUrl: cfg.accessBaseUrl,
        serviceUrn: cfg.serviceUrn,
        audience: 'conqr:service:conqr-access',
        key: { kid: cfg.serviceKeyId, privateKeyPem: cfg.servicePrivateKeyPem },
      });
    }
    return this.access;
  }

  /**
   * The revision watermark reader, or undefined when no Redis is configured.
   *
   * Read-only by intent: this product publishes nothing. Only ConqrAccess, which owns membership,
   * gets to say that a revision moved.
   */
  getRevisionReader(): RevisionReader | undefined {
    const cfg = this.config.requirePlatform();
    if (!cfg.revisionRedisUrl) return undefined;
    if (!this.redis) {
      this.redis = new Redis(cfg.revisionRedisUrl, {
        maxRetriesPerRequest: 1,
        // A watermark read must never hold up a request. Failing fast means "cannot confirm",
        // which the guard already treats correctly.
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      this.redis.on('error', (err) =>
        this.logger.warn(`revision watermark unavailable: ${err.message}`),
      );
    }
    return this.redis;
  }

  async readRevisionWatermark(
    tenantUrn: string,
    personUrn: string,
  ): Promise<ReturnType<typeof readRevision> extends Promise<infer T> ? T : never> {
    return readRevision(this.getRevisionReader(), {
      tenantId: tenantUrn,
      personId: personUrn,
    });
  }

  /**
   * Resolve the canonical person for an authenticated (issuer, subject).
   *
   * Called once per login, never per request. A subject the platform does not know is refused —
   * there is no local fallback, because "the platform does not know who you are" is an answer, not
   * an outage.
   */
  async resolvePerson(input: {
    issuer: string;
    subject: string;
    email?: string | undefined;
    emailVerified?: boolean | undefined;
    displayName?: string | undefined;
    correlationId?: string | undefined;
  }): Promise<ResolvedPerson> {
    const cfg = this.config.requirePlatform();
    const assertion = signServiceAssertion({
      key: { kid: cfg.serviceKeyId, privateKeyPem: cfg.servicePrivateKeyPem },
      serviceUrn: cfg.serviceUrn,
      audience: 'conqr:service:conqr-identity',
      scope: ['identity.resolve'],
    });
    const response = await fetch(`${cfg.identityBaseUrl}/v1/identities/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conqr-Service-Assertion': assertion,
        ...(input.correlationId ? { 'X-Correlation-Id': input.correlationId } : {}),
      },
      body: JSON.stringify({
        issuer: input.issuer,
        subject: input.subject,
        ...(input.email ? { email: input.email } : {}),
        ...(input.emailVerified === undefined ? {} : { email_verified: input.emailVerified }),
        ...(input.displayName ? { display_name: input.displayName } : {}),
      }),
    });
    const text = await response.text();
    const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (!response.ok) {
      // The reason code is useful; the body is not repeated into a log or a response.
      const code = typeof body['error'] === 'string' ? body['error'] : 'identity_unresolved';
      throw new Error(`ConqrIdentity refused to resolve the person: ${code}`);
    }
    const personUrn = body['person_urn'] ?? body['person_id'];
    if (typeof personUrn !== 'string' || !personUrn.startsWith('conqr:person:')) {
      throw new Error('ConqrIdentity returned no canonical person');
    }
    return {
      personUrn,
      email: typeof body['email'] === 'string' ? body['email'] : null,
      displayName: typeof body['display_name'] === 'string' ? body['display_name'] : null,
    };
  }

  /** The memberships this person holds, for the launcher and for tests. */
  async listMemberships(personUrn: string, correlationId?: string) {
    return this.getAccess().meContexts(personUrn as PersonUrn, correlationId);
  }

  async establishContext(input: {
    personUrn: string;
    tenantUrn: string;
    sessionId: string;
    correlationId?: string | undefined;
  }) {
    const cfg = this.config.requirePlatform();
    return this.getAccess().establishContext({
      personUrn: input.personUrn as PersonUrn,
      requestedTenant: input.tenantUrn as TenantUrn,
      // The entitlement check happens here: ConqrAccess refuses if this application is not
      // installed for the tenant, so a direct API call cannot bypass a hidden tile.
      applicationId: cfg.applicationId,
      sessionId: input.sessionId,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    });
  }
}
