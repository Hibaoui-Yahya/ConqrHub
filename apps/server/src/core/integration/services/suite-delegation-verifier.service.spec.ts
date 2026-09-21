import { generateKeyPairSync, randomUUID, sign as edSign } from 'node:crypto';
import {
  DelegationDenied,
  SuiteDelegationVerifierService,
} from './suite-delegation-verifier.service';
import {
  toProviderOrgUid,
  toProviderPersonUid,
} from '../domain/suite-identity.util';
import { SUITE_DELEGATED_SCOPES } from '../domain/suite-delegation-scope';

/**
 * The identity chain, link by link.
 *
 * Every test here names a way a delegated call could reach the wrong person or
 * the wrong tenant. None of them is detectable afterwards: an assertion that
 * verifies and resolves to a real user in a real workspace produces a call
 * that looks correct in both products' audit trails. So the refusals are the
 * feature, and they are what is pinned.
 */

const IDP = 'conqr-zitadel';
const KID = 'fabric-2026-09';
const ISSUER = 'conqrfabric';
const AUDIENCE = 'conqrhub';
const CLIENT_TOKEN = 'fabric-service-token';
const ORG = '298347293847';
const SUBJECT = '218374982734';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const fabric = generateKeyPairSync('ed25519');
const PRIVATE_PEM = fabric.privateKey.export({
  type: 'pkcs8',
  format: 'pem',
}) as string;
const PUBLIC_PEM = fabric.publicKey.export({
  type: 'spki',
  format: 'pem',
}) as string;

const b64 = (input: Buffer | string) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** Mint exactly what ConqrFabric mints, so the test exercises the real shape. */
function mint(
  overrides: {
    sub?: string;
    tid?: string;
    aud?: string;
    iss?: string;
    kid?: string;
    typ?: string;
    alg?: string;
    scope?: string[];
    exp?: number;
    nbf?: number;
    act?: string;
    privateKeyPem?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(
    JSON.stringify({
      alg: overrides.alg ?? 'EdDSA',
      typ: overrides.typ ?? 'CONQR-OBO',
      kid: overrides.kid ?? KID,
    }),
  );
  const payload = b64(
    JSON.stringify({
      sub: overrides.sub ?? toProviderPersonUid(IDP, SUBJECT),
      tid: overrides.tid ?? toProviderOrgUid(IDP, ORG),
      aud: overrides.aud ?? AUDIENCE,
      scope: overrides.scope ?? [
        SUITE_DELEGATED_SCOPES.spaceRead,
        SUITE_DELEGATED_SCOPES.pageRead,
      ],
      iat: now,
      nbf: overrides.nbf ?? now,
      exp: overrides.exp ?? now + 120,
      act: overrides.act ?? 'obo',
      iss: overrides.iss ?? ISSUER,
      jti: randomUUID(),
    }),
  );
  const key = require('node:crypto').createPrivateKey(
    overrides.privateKeyPem ?? PRIVATE_PEM,
  );
  const signature = b64(
    edSign(null, Buffer.from(`${header}.${payload}`, 'utf8'), key),
  );
  return `${header}.${payload}.${signature}`;
}

const activeUser = {
  id: USER_ID,
  name: 'Amina',
  email: 'amina@example.test',
  workspaceId: WORKSPACE_ID,
  deactivatedAt: null,
  deletedAt: null,
};
const workspace = { id: WORKSPACE_ID, name: 'Acme', deletedAt: null };

interface Fixtures {
  env?: Record<string, unknown>;
  orgMapping?: unknown;
  authAccount?: unknown;
  user?: unknown;
  workspace?: unknown;
}

function build(fixtures: Fixtures = {}) {
  const audited: any[] = [];

  const environment = {
    getSuiteIdpKey: () => IDP,
    getConqrFabricAssertionPublicKey: () => PUBLIC_PEM,
    getConqrFabricAssertionKeyId: () => KID,
    getConqrFabricOboIssuer: () => ISSUER,
    getSuiteDelegationAudience: () => AUDIENCE,
    getSuiteDelegationMaxTtlSeconds: () => 300,
    getSuiteDelegationClientTokens: () => [CLIENT_TOKEN],
    ...(fixtures.env ?? {}),
  };

  const service = new SuiteDelegationVerifierService(
    environment as any,
    {
      findById: jest.fn(async (userId: string, workspaceId: string) =>
        'user' in fixtures
          ? fixtures.user
          : userId === USER_ID && workspaceId === WORKSPACE_ID
            ? activeUser
            : undefined,
      ),
    } as any,
    {
      findById: jest.fn(async () =>
        'workspace' in fixtures ? fixtures.workspace : workspace,
      ),
    } as any,
    {
      findByProviderSubject: jest.fn(
        async (idpKey: string, providerUserId: string, workspaceId: string) =>
          'authAccount' in fixtures
            ? fixtures.authAccount
            : idpKey === IDP &&
                providerUserId === SUBJECT &&
                workspaceId === WORKSPACE_ID
              ? { id: 'acc', userId: USER_ID, workspaceId: WORKSPACE_ID }
              : undefined,
      ),
    } as any,
    {
      findActive: jest.fn(async (idpKey: string, externalOrgId: string) =>
        'orgMapping' in fixtures
          ? fixtures.orgMapping
          : idpKey === IDP && externalOrgId === ORG
            ? { id: 'map', workspaceId: WORKSPACE_ID, isActive: true }
            : undefined,
      ),
    } as any,
    {
      append: jest.fn(async (row: any) => row),
      appendQuietly: jest.fn(async (row: any) => {
        audited.push(row);
      }),
    } as any,
  );

  return { service, audited };
}

async function denial(
  service: SuiteDelegationVerifierService,
  params: Parameters<SuiteDelegationVerifierService['verify']>[0],
): Promise<string> {
  try {
    await service.verify(params);
  } catch (err) {
    expect(err).toBeInstanceOf(DelegationDenied);
    return (err as DelegationDenied).classification;
  }
  throw new Error('expected the delegation to be refused');
}

const good = () => ({
  token: mint(),
  clientToken: CLIENT_TOKEN,
  requiredScope: SUITE_DELEGATED_SCOPES.spaceRead,
  method: 'GET',
  path: '/api/delegation/whoami',
});

describe('SuiteDelegationVerifierService — the happy path', () => {
  it('resolves the person and the workspace the assertion named', async () => {
    const { service, audited } = build();
    const context = await service.verify(good());

    expect(context.user.id).toBe(USER_ID);
    expect(context.workspace.id).toBe(WORKSPACE_ID);
    expect(context.subject).toBe(SUBJECT);
    expect(context.externalOrgId).toBe(ORG);
    expect(context.kid).toBe(KID);

    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      accepted: true,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      reason: null,
      requiredScope: SUITE_DELEGATED_SCOPES.spaceRead,
    });
  });

  it('never writes the token, only the id of the assertion', async () => {
    const { service, audited } = build();
    const params = good();
    await service.verify(params);

    const serialised = JSON.stringify(audited[0]);
    expect(serialised).not.toContain(params.token);
    // A JWS segment would be as replayable as the whole token.
    for (const segment of params.token.split('.')) {
      expect(serialised).not.toContain(segment);
    }
    expect(audited[0].jti).toBeTruthy();
  });
});

describe('SuiteDelegationVerifierService — every link fails closed', () => {
  it('refuses a caller that is not a service we know', async () => {
    const { service } = build();
    expect(
      await denial(service, { ...good(), clientToken: 'not-a-known-token' }),
    ).toBe('client_unauthorized');
    expect(await denial(service, { ...good(), clientToken: undefined })).toBe(
      'client_unauthorized',
    );
  });

  it('checks the service credential before it parses anything', async () => {
    // Otherwise an unknown caller could use refusal differences to learn which
    // issuers and key ids this Hub accepts.
    const { service, audited } = build();
    await denial(service, {
      ...good(),
      token: 'not-even-a-token',
      clientToken: 'wrong',
    });
    expect(audited[0].reason).toBe('client_unauthorized');
    expect(audited[0].personUid).toBeNull();
  });

  it('refuses an assertion signed by a key it does not hold', async () => {
    const other = generateKeyPairSync('ed25519');
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({
          privateKeyPem: other.privateKey.export({
            type: 'pkcs8',
            format: 'pem',
          }) as string,
        }),
      }),
    ).toBe('delegation_bad_signature');
  });

  it('refuses an unknown key id rather than going to look one up', async () => {
    const { service } = build();
    expect(
      await denial(service, { ...good(), token: mint({ kid: 'retired-key' }) }),
    ).toBe('delegation_unknown_key');
  });

  it('refuses an issuer it does not trust', async () => {
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ iss: 'somebody-else' }),
      }),
    ).toBe('delegation_wrong_issuer');
  });

  it('refuses a token addressed to another product', async () => {
    // A token signed with a key we trust is not thereby addressed to us.
    const { service } = build();
    expect(
      await denial(service, { ...good(), token: mint({ aud: 'conqrplan' }) }),
    ).toBe('delegation_wrong_audience');
  });

  it('refuses an algorithm the issuer is not pinned to', async () => {
    // Algorithm confusion, closed by construction: the algorithm comes from
    // the issuer policy, never from the token's own header.
    const { service } = build();
    expect(
      await denial(service, { ...good(), token: mint({ alg: 'HS256' }) }),
    ).toBe('delegation_bad_algorithm');
  });

  it('refuses a token of another type signed with the same key', async () => {
    const { service } = build();
    expect(
      await denial(service, { ...good(), token: mint({ typ: 'JWT' }) }),
    ).toBe('delegation_bad_type');
  });

  it('refuses an expired assertion', async () => {
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ exp: Math.floor(Date.now() / 1000) - 600 }),
      }),
    ).toBe('delegation_expired');
  });

  it('refuses an assertion that is not valid yet', async () => {
    const { service } = build();
    await expect(
      denial(service, {
        ...good(),
        token: mint({ nbf: Math.floor(Date.now() / 1000) + 600 }),
      }),
    ).resolves.toBe('delegation_not_yet_valid');
  });

  it('refuses a signed assertion that is not an on-behalf-of act', async () => {
    const { service } = build();
    await expect(
      denial(service, { ...good(), token: mint({ act: 'service' }) }),
    ).resolves.toBe('delegation_not_obo');
  });

  it('refuses a scope the issuer is not permitted to assert', async () => {
    // Invalidates the whole assertion rather than being quietly dropped: it
    // means the issuer is misconfigured or is trying something.
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ scope: ['workspace:delete'] }),
      }),
    ).toBe('delegation_scope_not_permitted');
  });

  it('refuses an assertion that does not carry the scope the route needs', async () => {
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ scope: [SUITE_DELEGATED_SCOPES.spaceRead] }),
        requiredScope: SUITE_DELEGATED_SCOPES.pageSearch,
      }),
    ).toBe('delegation_insufficient_scope');
  });

  it('refuses a subject that claims to be a ConqrHub row id', async () => {
    // The `oidc:` namespace is what stops a foreign subject being read as a
    // Hub user id. A bare one is refused here rather than resolved.
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ sub: `conqr:person:${USER_ID}` }),
      }),
    ).toBe('delegation_bad_subject');
    expect(
      await denial(service, {
        ...good(),
        token: mint({ tid: `conqr:org:${WORKSPACE_ID}` }),
      }),
    ).toBe('delegation_bad_tenant');
  });

  it('refuses a subject from a provider this deployment does not federate to', async () => {
    const { service } = build();
    expect(
      await denial(service, {
        ...good(),
        token: mint({ sub: toProviderPersonUid('some-other-idp', SUBJECT) }),
      }),
    ).toBe('identity_provider_mismatch');
  });

  it('refuses an organisation nobody has mapped, and a revoked one identically', async () => {
    // Identical on purpose: a different answer would tell an unauthenticated
    // caller which organisations exist here.
    const unknown = build({ orgMapping: undefined });
    expect(await denial(unknown.service, good())).toBe('org_unmapped');
    // `findActive` already filters `is_active`, so a revoked mapping reaches
    // the resolver as the same absence.
    const revoked = build({ orgMapping: undefined });
    expect(await denial(revoked.service, good())).toBe('org_unmapped');
  });

  it('refuses when the mapped workspace is gone', async () => {
    const { service } = build({ workspace: undefined });
    expect(await denial(service, good())).toBe('workspace_unavailable');
    const deleted = build({
      workspace: { ...workspace, deletedAt: new Date() },
    });
    expect(await denial(deleted.service, good())).toBe('workspace_unavailable');
  });

  it('refuses a subject nobody has linked to a user here', async () => {
    const { service, audited } = build({ authAccount: undefined });
    expect(await denial(service, good())).toBe('identity_unmapped');
    // The workspace resolved, so the audit row can say where it was attempted.
    expect(audited[0].workspaceId).toBe(WORKSPACE_ID);
  });

  it('refuses a link that has been revoked', async () => {
    /**
     * `findByProviderSubject` filters `deleted_at`, so a soft-deleted link is
     * the same absence as one that never existed — which is what makes
     * unlinking an account an effective revocation rather than a cosmetic one.
     */
    const { service } = build({ authAccount: undefined });
    expect(await denial(service, good())).toBe('identity_unmapped');
  });

  it('refuses the right person in the wrong workspace', async () => {
    /**
     * The account lookup is scoped to the workspace the *organisation*
     * resolved to, so a link that exists in another workspace is not a match.
     * Without that scoping this is the call that succeeds against somebody
     * else's tenant and looks entirely normal afterwards.
     */
    const { service } = build({
      orgMapping: {
        id: 'map',
        workspaceId: '33333333-3333-4333-8333-333333333333',
        isActive: true,
      },
      workspace: {
        id: '33333333-3333-4333-8333-333333333333',
        deletedAt: null,
      },
    });
    expect(await denial(service, good())).toBe('identity_unmapped');
  });

  it('refuses a link pointing at a user who is not a member any more', async () => {
    const { service } = build({ user: undefined });
    expect(await denial(service, good())).toBe('user_not_a_member');
  });

  it('refuses a deactivated and a deleted user', async () => {
    const deactivated = build({
      user: { ...activeUser, deactivatedAt: new Date() },
    });
    expect(await denial(deactivated.service, good())).toBe('user_disabled');
    const deleted = build({ user: { ...activeUser, deletedAt: new Date() } });
    expect(await denial(deleted.service, good())).toBe('user_disabled');
  });

  it('refuses everything when it is not configured', async () => {
    /**
     * Unconfigured means off, and off means refused. A feature that degrades
     * to trusting the caller when its configuration is missing is worse than
     * one that is absent.
     */
    for (const missing of [
      { getSuiteIdpKey: () => '' },
      { getConqrFabricAssertionPublicKey: () => '' },
      { getConqrFabricAssertionKeyId: () => '' },
      { getSuiteDelegationClientTokens: () => [] },
    ]) {
      const { service } = build({ env: missing });
      expect(service.isEnabled()).toBe(false);
      expect(await denial(service, good())).toBe('delegation_not_configured');
    }
  });

  it('records every refusal', async () => {
    const { service, audited } = build({ orgMapping: undefined });
    await denial(service, good());
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      accepted: false,
      reason: 'org_unmapped',
      requestMethod: 'GET',
      requestPath: '/api/delegation/whoami',
    });
  });

  it('drops a correlation id that is not a correlation id', async () => {
    const { service, audited } = build();
    await service.verify({ ...good(), correlationId: 'a b\nc' });
    expect(audited[0].correlationId).toBeNull();

    const clean = build();
    await clean.service.verify({ ...good(), correlationId: 'run:abc-123' });
    expect(clean.audited[0].correlationId).toBe('run:abc-123');
  });
});
