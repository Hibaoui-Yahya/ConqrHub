/**
 * ConqrHub — Conqr platform integration.
 *
 * Every way a request can be refused before it reaches product logic.
 *
 * ConqrAccess and Redis are substituted, because what is being tested is the product's *decisions*
 * — including the ones it has to make when a platform dependency is slow, down, or answering with
 * something that does not check out. Those are exactly the cases a live environment cannot be made
 * to produce on demand.
 *
 * The verification itself is not stubbed: `checkContext` here is the platform's own function from
 * the vendored `@conqr/contracts`, so a context that would be refused at ConqrAuth is refused here
 * for the same reason.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CONTEXT_TTL_SECONDS, type TenantContext } from '@conqr/contracts';
import { PlatformContextService } from './platform-context.service';
import type { PlatformConfigService } from './platform.config';
import type { PlatformClientsService } from './platform-clients.service';
import type { TenantBindingService } from './tenant-binding.service';
import { UserRole } from '../../common/helpers/types/permission';

const PERSON = 'conqr:person:01ARZ3NDEKTSV4RRFFQ69G5FCX';
const TENANT_A = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TENANT_B = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FBW';
const SERVICE_URN = 'conqr:service:conqrhub';
const SESSION = 'session-1';
const PRODUCT_TENANT = '00000000-0000-7000-8000-000000000001';

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  const issued = new Date();
  return {
    person_id: PERSON as TenantContext['person_id'],
    session_id: SESSION,
    tenant_id: TENANT_A as TenantContext['tenant_id'],
    tenant_slug: 'tenant-a',
    membership_id: 'mem-1',
    org_ref: { engine: 'zitadel', instance: 'https://id.example.test', org_id: 'org-a' },
    authorization_revision: 7,
    context_generation: 1,
    issuer: 'conqr:service:conqr-access',
    audience: SERVICE_URN,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + CONTEXT_TTL_SECONDS * 1000).toISOString(),
    verified_at: issued.toISOString(),
    verified_by: 'access-api',
    ...overrides,
  };
}

interface Harness {
  service: PlatformContextService;
  establish: jest.Mock;
  watermark: jest.Mock;
  resolveBinding: jest.Mock;
}

function harness(
  over: {
    decision?: unknown;
    establishThrows?: Error;
    watermark?: unknown;
    binding?: unknown;
  } = {},
): Harness {
  const establish = jest.fn(async () => {
    if (over.establishThrows) throw over.establishThrows;
    return (
      over.decision ?? {
        allow: true,
        reason_code: 'ok',
        context: context(),
        effective: {
          roles: ['tenant.admin'],
          applications: ['conqrhub'],
          application_roles: { conqrhub: ['conqrhub.admin'] },
          application_permissions: { conqrhub: ['conqrhub.app.use', 'conqrhub.settings.manage'] },
        },
      }
    );
  });
  const watermark = jest.fn(async () => over.watermark ?? { known: false, reason: 'absent' });
  const resolveBinding = jest.fn(async () =>
    over.binding === undefined
      ? { id: 'b1', conqrTenantId: TENANT_A, applicationId: 'conqrhub', workspaceId: PRODUCT_TENANT, status: 'active', revision: 1 }
      : over.binding,
  );

  const config = {
    requirePlatform: () => ({ serviceUrn: SERVICE_URN, applicationId: 'conqrhub' }),
  } as unknown as PlatformConfigService;
  const clients = {
    establishContext: establish,
    readRevisionWatermark: watermark,
  } as unknown as PlatformClientsService;
  const bindings = { resolve: resolveBinding } as unknown as TenantBindingService;

  return {
    service: new PlatformContextService(config, clients, bindings),
    establish,
    watermark,
    resolveBinding,
  };
}

const request = { personUrn: PERSON, conqrTenantId: TENANT_A, sessionId: SESSION };

describe('resolving a request context', () => {
  it('returns the mapped roles and the bound workspace', async () => {
    const h = harness();
    const resolved = await h.service.resolve(request);
    expect(resolved.productTenantId).toBe(PRODUCT_TENANT);
    // The platform granted conqrhub.admin for this application; the product hears UserRole.ADMIN.
    // The platform's string never reaches CASL, and the tenant role is not what produced it.
    expect(resolved.role).toBe(UserRole.ADMIN);
    expect(resolved.applicationRoles).toEqual(['conqrhub.admin']);
    expect(resolved.context.tenant_id).toBe(TENANT_A);
  });

  it('G01-01/02 a tenant role alone produces no product role, and closes the application', async () => {
    // The decision allows the tenant, and the person is a tenant administrator — but nobody
    // granted them ConqrService. Before this correction tenant.admin became the product's `admin`
    // and tenant.member became `agent`.
    const h = harness({
      decision: {
        allow: true,
        reason_code: 'ok',
        context: context(),
        effective: {
          roles: ['tenant.admin', 'tenant.member'],
          applications: [],
          application_roles: {},
          application_permissions: {},
        },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('G01-10 a grant for another application confers nothing here', async () => {
    const h = harness({
      decision: {
        allow: true,
        reason_code: 'ok',
        context: context(),
        effective: {
          roles: ['tenant.member'],
          applications: ['conqrplan'],
          application_roles: { conqrplan: ['conqrplan.member'] },
          application_permissions: { conqrplan: ['conqrplan.app.use'] },
        },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('G02-01 an application missing from the launchable list is refused even if a grant is reported', async () => {
    // Defence in depth: ConqrAccess already refuses, because establishContext names the
    // application. This is the second half of the same statement, so a future caller that forgets
    // to pass the application id cannot turn a hidden application into an open one.
    const h = harness({
      decision: {
        allow: true,
        reason_code: 'ok',
        context: context(),
        effective: {
          roles: ['tenant.member'],
          applications: [],
          application_roles: { conqrhub: ['conqrhub.member'] },
          application_permissions: { conqrhub: ['conqrhub.app.use'] },
        },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('G01-08 refuses an application grant this build does not understand', async () => {
    // Null from the role map is a refusal, not a fallback to the weakest role. A role the platform
    // adds tomorrow must not quietly become workspace membership here.
    const h = harness({
      decision: {
        allow: true,
        reason_code: 'ok',
        context: context(),
        effective: {
          roles: ['tenant.member'],
          applications: ['conqrhub'],
          application_roles: { conqrhub: ['conqrhub.superuser'] },
          application_permissions: { conqrhub: ['conqrhub.app.use'] },
        },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not ask ConqrAccess again while the context is fresh', async () => {
    const h = harness();
    await h.service.resolve(request);
    await h.service.resolve(request);
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(1);
  });

  it('asks ConqrAccess again for a different session, never reusing another session context', async () => {
    const h = harness();
    await h.service.resolve(request);
    h.establish.mockClear();
    await h.service
      .resolve({ ...request, sessionId: 'another-session' })
      .catch(() => undefined);
    expect(h.establish).toHaveBeenCalledTimes(1);
  });
});

describe('a context that does not check out is refused, whoever sent it', () => {
  it('refuses a context minted by something other than ConqrAccess', async () => {
    const h = harness({
      decision: {
        allow: true,
        context: context({ issuer: 'conqr:service:impostor' }),
        effective: { roles: ['tenant.admin'], applications: [] },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a context minted for another service', async () => {
    const h = harness({
      decision: {
        allow: true,
        context: context({ audience: 'conqr:service:conqr-auth' }),
        effective: { roles: ['tenant.admin'], applications: [] },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a context bound to a different session', async () => {
    const h = harness({
      decision: {
        allow: true,
        context: context({ session_id: 'somebody-elses-session' }),
        effective: { roles: ['tenant.admin'], applications: [] },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an already-expired context', async () => {
    const old = new Date(Date.now() - 120_000);
    const h = harness({
      decision: {
        allow: true,
        context: context({
          issued_at: old.toISOString(),
          expires_at: new Date(old.getTime() + 60_000).toISOString(),
        }),
        effective: { roles: ['tenant.admin'], applications: [] },
      },
    });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a context for a tenant other than the one asked for', async () => {
    // Belt and braces: even a perfectly valid context for tenant B must not satisfy a request that
    // named tenant A.
    const h = harness({
      decision: {
        allow: true,
        context: context({ tenant_id: TENANT_B as TenantContext['tenant_id'] }),
        effective: { roles: ['tenant.admin'], applications: [] },
      },
    });
    await expect(h.service.resolve(request)).rejects.toThrow(/tenant_mismatch|no longer valid/);
  });
});

describe('refusals that come from the platform', () => {
  it('refuses when the membership is gone, naming no other tenant to fall back to', async () => {
    const h = harness({ decision: { allow: false, reason_code: 'membership_inactive' } });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.resolve(request)).rejects.toThrow(/access to this workspace/i);
  });

  it('refuses when the application is not installed for the tenant', async () => {
    // This is what stops a direct API call working when the tile is hidden: entitlement is decided
    // by ConqrAccess on the establish call, not by the launcher.
    const h = harness({ decision: { allow: false, reason_code: 'app_not_installed' } });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the tenant is entitled but nothing here is bound to it', async () => {
    // Emphatically not "create a workspace and carry on": a workspace created during a login has
    // no owner, no audit and no deliberate decision behind it.
    const h = harness({ binding: undefined as never });
    h.resolveBinding.mockResolvedValue(undefined);
    await expect(h.service.resolve(request)).rejects.toThrow(/not set up for ConqrService/);
  });
});

describe('platform outage: fail closed', () => {
  it('refuses when ConqrAccess cannot be reached and there is nothing cached', async () => {
    const h = harness({ establishThrows: new Error('ECONNREFUSED 10.0.0.2:8080') });
    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('leaks no internal detail when it does', async () => {
    const h = harness({ establishThrows: new Error('ECONNREFUSED 10.0.0.2:8080') });
    const error = await h.service.resolve(request).catch((e: Error) => e);
    expect(JSON.stringify(error)).not.toMatch(/ECONNREFUSED|10\.0\.0\.2/);
  });
});

describe('the revision watermark makes a change visible before the context expires', () => {
  it('re-asks ConqrAccess when the watermark is ahead of the cached context', async () => {
    const h = harness();
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(1);

    // Somebody was suspended a second later: revision 9 against a context minted at 7.
    h.watermark.mockResolvedValue({ known: true, revision: 9 });
    h.establish.mockResolvedValue({ allow: false, reason_code: 'membership_inactive' });

    await expect(h.service.resolve(request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.establish).toHaveBeenCalledTimes(2);
  });

  it('does not re-ask when the watermark matches the context it already holds', async () => {
    const h = harness({ watermark: { known: true, revision: 7 } });
    await h.service.resolve(request);
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(1);
  });

  it('serves the cached context when the watermark cannot be read', async () => {
    // An unreadable watermark means "cannot confirm". The context's own expiry then bounds the
    // exposure, which is the same position as having no watermark at all — never worse.
    const h = harness({ watermark: { known: false, reason: 'unavailable' } });
    await h.service.resolve(request);
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(1);
  });
});

describe('ending a session ends its cached context', () => {
  it('forgets everything cached for a session on logout', async () => {
    const h = harness();
    await h.service.resolve(request);
    h.service.forgetSession(SESSION);
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(2);
  });

  it('forgets only that session', async () => {
    const h = harness();
    await h.service.resolve(request);
    h.service.forgetSession('a-different-session');
    await h.service.resolve(request);
    expect(h.establish).toHaveBeenCalledTimes(1);
  });
});
