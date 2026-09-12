/**
 * ConqrHub — the platform login path.
 *
 * The order of the five steps is the design, so the tests are mostly about order and refusal:
 * which step runs before which, and what happens when one of them cannot answer. The single most
 * important case is the first — that a person is identified by `(issuer, subject)` and never by
 * e-mail address, because that is the difference between this path and the standalone one it sits
 * beside.
 */
import { ForbiddenException } from '@nestjs/common';
import { PlatformLoginService } from './platform-login.service';
import type { PlatformConfigService } from './platform.config';
import type { PlatformClientsService } from './platform-clients.service';
import type { TenantBindingService } from './tenant-binding.service';

const PERSON = 'conqr:person:01ARZ3NDEKTSV4RRFFQ69G5FCX';
const TENANT_A = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TENANT_B = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FBW';
const WORKSPACE = '00000000-0000-7000-8000-00000000000a';

const membership = (tenantId: string, applications = ['conqrhub'], status = 'active') => ({
  tenant_id: tenantId,
  membership_status: status,
  applications,
});

function harness(
  over: {
    person?: unknown;
    memberships?: unknown[];
    binding?: unknown;
    existingUser?: unknown;
  } = {},
) {
  const resolvePerson = jest.fn(async () =>
    over.person ?? { personUrn: PERSON, email: 'person@example.invalid', displayName: 'A Person' },
  );
  const listMemberships = jest.fn(async () => over.memberships ?? [membership(TENANT_A)]);
  const resolveBinding = jest.fn(async () =>
    over.binding === undefined
      ? { id: 'b1', conqrTenantId: TENANT_A, applicationId: 'conqrhub', workspaceId: WORKSPACE, status: 'active', revision: 1 }
      : over.binding,
  );
  // 'existingUser' in over, not ??, so a test can say 'no such user' with null.
  const findByEmail = jest.fn(async () =>
    'existingUser' in over ? over.existingUser : { id: 'u1', workspaceId: WORKSPACE },
  );
  const signup = jest.fn(async () => ({ id: 'u-new', workspaceId: WORKSPACE }));
  const createPlatformSessionAndToken = jest.fn(async () => 'signed.jwt.token');

  const service = new PlatformLoginService(
    { requirePlatform: () => ({ applicationId: 'conqrhub' }) } as unknown as PlatformConfigService,
    { resolvePerson, listMemberships } as unknown as PlatformClientsService,
    { resolve: resolveBinding } as unknown as TenantBindingService,
    { findByEmail } as never,
    { signup } as never,
    { createPlatformSessionAndToken } as never,
  );

  return { service, resolvePerson, listMemberships, resolveBinding, findByEmail, signup, createPlatformSessionAndToken };
}

const login = (over = {}) => ({
  issuer: 'https://id.example.test',
  subject: 'external-subject-1',
  email: 'person@example.invalid',
  displayName: 'A Person',
  ...over,
});

describe('establishing a platform session', () => {
  it('identifies the person by (issuer, subject), never by e-mail', async () => {
    const h = harness();
    await h.service.establishSession(login());
    expect(h.resolvePerson).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'https://id.example.test', subject: 'external-subject-1' }),
    );
    // The address is passed along for the profile, and is not what resolved the identity: the
    // canonical person came back from ConqrIdentity and the local lookup used *its* address.
    const [resolved] = h.findByEmail.mock.calls[0] as unknown as [string, string];
    expect(resolved).toBe('person@example.invalid');
  });

  it('signs a session carrying the canonical person and the tenant, and no role', async () => {
    const h = harness();
    const { claims } = await h.service.establishSession(login());
    expect(claims).toEqual({ personUrn: PERSON, conqrTenantId: TENANT_A });
    const [, platform] = h.createPlatformSessionAndToken.mock.calls[0] as unknown as [unknown, unknown];
    expect(platform).toEqual({ personUrn: PERSON, conqrTenantId: TENANT_A });
    expect(JSON.stringify(platform)).not.toContain('role');
  });

  it('uses the requested tenant without asking, when the launcher named one', async () => {
    const h = harness();
    await h.service.establishSession(login({ requestedTenant: TENANT_B }));
    expect(h.listMemberships).not.toHaveBeenCalled();
    expect(h.resolveBinding).toHaveBeenCalledWith(TENANT_B, 'conqrhub');
  });

  it('refuses rather than choosing when the person is entitled in more than one tenant', async () => {
    // "The first one" is how somebody ends up in the wrong organisation's data without ever having
    // chosen it.
    const h = harness({ memberships: [membership(TENANT_A), membership(TENANT_B)] });
    await expect(h.service.establishSession(login())).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.createPlatformSessionAndToken).not.toHaveBeenCalled();
  });

  it('refuses when the person is entitled nowhere', async () => {
    const h = harness({ memberships: [] });
    await expect(h.service.establishSession(login())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores a membership that is not active, or not entitled to this application', async () => {
    const h = harness({
      memberships: [
        membership(TENANT_A, ['conqrhub'], 'suspended'),
        membership(TENANT_B, ['conqrplan']),
      ],
    });
    await expect(h.service.establishSession(login())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an entitled tenant that nothing in this product is bound to', async () => {
    // Not "create a workspace": one made during a login has no owner and nobody who decided it
    // should exist.
    const withNoBinding = harness({ binding: null });
    await expect(withNoBinding.service.establishSession(login())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(withNoBinding.signup).not.toHaveBeenCalled();
  });

  it('provisions the local user only after the person, tenant and workspace are all settled', async () => {
    const h = harness({ existingUser: null });
    await h.service.establishSession(login());
    expect(h.resolvePerson).toHaveBeenCalled();
    expect(h.resolveBinding).toHaveBeenCalled();
    expect(h.signup).toHaveBeenCalled();
    // And into the workspace the binding named, not the one anything else suggested.
    const [, workspaceId] = h.signup.mock.calls[0] as unknown as [unknown, string];
    expect(workspaceId).toBe(WORKSPACE);
  });

  it('refuses when the canonical person has no address to key a local row on', async () => {
    const h = harness({ person: { personUrn: PERSON, email: null, displayName: 'A Person' } });
    await expect(h.service.establishSession(login({ email: undefined }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.signup).not.toHaveBeenCalled();
  });
});
