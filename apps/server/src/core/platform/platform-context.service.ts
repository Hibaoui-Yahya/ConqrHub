/**
 * ConqrHub — Conqr platform integration.
 *
 * The TenantContext a protected request runs under, and every check it has to pass.
 *
 * **The product session carries no authorization.** This is the single most important decision in
 * the integration. ConqrHub's own session cookie is a JWT with a lifetime measured in hours; if
 * the tenant and the roles were baked into it — as they are in standalone mode — then removing
 * somebody's access would take effect hours later, and the platform's sixty-second context would be
 * decoration. So in platform mode the session says only *who* and *which tenant was requested*.
 * What that person may do is decided per request, by ConqrAccess.
 *
 * **The checks are the platform's, not a second copy of them.** `checkContext` comes from
 * `@conqr/contracts` — the same function ConqrAuth calls, from the same vendored build. Issuer,
 * audience, session binding, generation and expiry are therefore checked identically in both
 * places, and cannot drift apart. Re-implementing them here would have been the single easiest way
 * to make this integration unsafe.
 *
 * **What is product-side** is the orchestration: when to consult ConqrAccess, what to cache, and
 * how a platform grant becomes a ConqrHub workspace role. Those are this product's decisions to make.
 *
 * The order, cheapest first and fail-closed throughout:
 *
 *   1. a cached context, if one is still structurally valid for this session;
 *   2. the revision watermark — has anything changed since it was minted;
 *   3. ConqrAccess, whenever the first two cannot answer;
 *   4. `checkContext` over whatever came back, because a context is not trusted for having arrived
 *      from the right URL;
 *   5. the tenant binding, which turns a Conqr tenant into this product's workspace.
 */
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  checkContext,
  shouldRefresh,
  type TenantContext,
} from '@conqr/contracts';
import { PlatformConfigService } from './platform.config';
import { PlatformClientsService } from './platform-clients.service';
import { TenantBindingService } from './tenant-binding.service';
import { mapApplicationRoles } from './role-map';
import type { UserRole } from '../../common/helpers/types/permission';

/** What a protected request runs under once every check has passed. */
export interface PlatformRequestContext {
  context: TenantContext;
  /**
   * The ConqrHub workspace role, mapped from the platform's **application** grants for this
   * application. Never the platform's string verbatim, and never derived from a tenant role
   * (G-01). Space and page access is separate and is never granted from here.
   */
  role: UserRole;
  /** The ConqrHub workspace this Conqr tenant is bound to. */
  productTenantId: string;
  applications: string[];
  /** The ConqrAccess application roles this decision carried, for audit and diagnostics. */
  applicationRoles: string[];
  /** The catalog permissions those grants confer in this application. */
  applicationPermissions: string[];
}

interface CacheEntry {
  context: TenantContext;
  role: UserRole;
  applications: string[];
  applicationRoles: string[];
  applicationPermissions: string[];
  productTenantId: string;
}

/** ConqrAccess is the issuer of every context this product will accept. */
const CONTEXT_ISSUER = 'conqr:service:conqr-access';

@Injectable()
export class PlatformContextService {
  private readonly logger = new Logger(PlatformContextService.name);

  /**
   * One entry per (session, tenant). Bounded by the session's own lifetime and swept on read; this
   * is a request-path cache, not a store. Every entry is re-checked structurally before use, so a
   * stale entry cannot be served — at worst it causes one extra call to ConqrAccess.
   */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: PlatformConfigService,
    private readonly clients: PlatformClientsService,
    private readonly bindings: TenantBindingService,
  ) {}

  private key(sessionId: string, tenantUrn: string): string {
    return `${sessionId}|${tenantUrn}`;
  }

  /** Drops everything cached for a session. Called on logout. */
  forgetSession(sessionId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${sessionId}|`)) this.cache.delete(key);
    }
  }

  /**
   * Resolve the context for a request, consulting ConqrAccess whenever the cached one cannot be
   * trusted on its own.
   *
   * Throws rather than returning a failure shape: every caller is a guard, and a guard that has to
   * remember to check a boolean is a guard that will one day forget.
   */
  async resolve(input: {
    personUrn: string;
    conqrTenantId: string;
    sessionId: string;
    correlationId?: string | undefined;
  }): Promise<PlatformRequestContext> {
    const cfg = this.config.requirePlatform();
    const now = Date.now();
    const cacheKey = this.key(input.sessionId, input.conqrTenantId);
    const cached = this.cache.get(cacheKey);

    let entry = cached;
    if (entry) {
      const structural = checkContext(entry.context, {
        now,
        issuer: CONTEXT_ISSUER,
        audience: cfg.serviceUrn,
        sessionId: input.sessionId,
      });
      if (structural) {
        entry = undefined;
      } else {
        // Has the access behind it moved since it was minted? An unreadable watermark means
        // "cannot confirm", which shortens the context's life rather than extending it.
        const watermark = await this.clients.readRevisionWatermark(
          entry.context.tenant_id,
          entry.context.person_id,
        );
        const invalidated =
          watermark.known && watermark.revision > entry.context.authorization_revision;
        if (invalidated || shouldRefresh(entry.context, now)) entry = undefined;
      }
      if (!entry) this.cache.delete(cacheKey);
    }

    if (!entry) {
      entry = await this.establish(input);
      this.cache.set(cacheKey, entry);
    }

    return {
      context: entry.context,
      role: entry.role,
      applications: entry.applications,
      applicationRoles: entry.applicationRoles,
      applicationPermissions: entry.applicationPermissions,
      productTenantId: entry.productTenantId,
    };
  }

  /** Ask ConqrAccess, check what it says, and resolve the workspace it maps to. */
  private async establish(input: {
    personUrn: string;
    conqrTenantId: string;
    sessionId: string;
    correlationId?: string | undefined;
  }): Promise<CacheEntry> {
    const cfg = this.config.requirePlatform();

    let decision;
    try {
      decision = await this.clients.establishContext({
        personUrn: input.personUrn,
        tenantUrn: input.conqrTenantId,
        sessionId: input.sessionId,
        correlationId: input.correlationId,
      });
    } catch (err) {
      // ConqrAccess is unreachable. There is no cached context that survived the checks above, so
      // there is nothing to fall back to — and inventing an answer here is exactly the behaviour
      // this whole design exists to prevent.
      this.logger.warn(`ConqrAccess unavailable: ${String((err as Error).message)}`);
      throw new ForbiddenException({
        error: 'platform_unavailable',
        message: 'Your access could not be confirmed. Please try again.',
      });
    }

    if (!decision.allow || !decision.context) {
      // Membership gone, tenant unavailable, or this application not installed/entitled for the
      // tenant. All three are refusals, and none of them falls back to another tenant.
      throw new ForbiddenException({
        error: decision.reason_code || 'access_denied',
        message: 'You do not have access to this workspace.',
      });
    }

    // The context came from ConqrAccess over an authenticated channel — and is still checked.
    // Arriving from the right place is not the same as being the right context.
    const rejection = checkContext(decision.context, {
      issuer: CONTEXT_ISSUER,
      audience: cfg.serviceUrn,
      sessionId: input.sessionId,
    });
    if (rejection) {
      this.logger.warn(`refused a context from ConqrAccess: ${rejection}`);
      throw new UnauthorizedException({
        error: rejection,
        message: 'Your session is no longer valid. Please sign in again.',
      });
    }

    // The context is for the tenant that was asked for, not merely for *a* tenant.
    if (decision.context.tenant_id !== input.conqrTenantId) {
      throw new UnauthorizedException({
        error: 'tenant_mismatch',
        message: 'Your session is no longer valid. Please sign in again.',
      });
    }

    const binding = await this.bindings.resolve(input.conqrTenantId, cfg.applicationId);
    if (!binding) {
      // The person is entitled, but nothing in this product has been bound to their tenant. That
      // is a refusal, never an invitation to create a workspace on the fly: a workspace created
      // during a login has no owner, no audit and no deliberate decision behind it.
      throw new ForbiddenException({
        error: 'tenant_not_bound',
        message: 'This workspace is not set up for ConqrService yet.',
      });
    }

    // Authority comes from the explicit application grants for *this* application, in this
    // tenant, in this decision. Not from `effective.roles` — those are tenant roles, and reading
    // them here is what finding G-01 was.
    const applications = decision.effective?.applications ?? [];
    const applicationGrants = decision.effective?.application_roles?.[cfg.applicationId] ?? [];
    const role = mapApplicationRoles(applicationGrants);

    // ConqrAccess already refused if this application is not installed, not entitled, or not
    // granted — `establishContext` is called with the application id. This is the second half of
    // the same statement, checked here so a future caller that forgets to pass it cannot turn a
    // hidden application into an open one.
    if (!applications.includes(cfg.applicationId)) {
      throw new ForbiddenException({
        error: 'entitlement_missing',
        message: 'You do not have access to this application in this workspace.',
      });
    }

    // No grant this build understands is a refusal, never a fallback to the weakest role. A
    // permissive default is how a role the platform adds tomorrow becomes access nobody granted.
    if (role === null) {
      throw new ForbiddenException({
        error: 'entitlement_missing',
        message: 'You do not have access to this application in this workspace.',
      });
    }

    return {
      context: decision.context,
      role,
      applications,
      applicationRoles: applicationGrants,
      applicationPermissions: decision.effective?.application_permissions?.[cfg.applicationId] ?? [],
      // The ConqrHub workspace this Conqr tenant is bound to.
      productTenantId: binding.workspaceId,
    };
  }
}
