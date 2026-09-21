import { UnauthorizedException } from '@nestjs/common';
import { OidcIdentityLinkService } from './oidc-identity-link.service';

/**
 * Which user an OIDC login resolves to.
 *
 * Until this change the answer was "whoever holds that email address in this
 * workspace", and the subject claim — the one value the provider guarantees is
 * immutable — was computed and thrown away. An address can be released and
 * reassigned, so that made "who am I in ConqrHub" answerable by whoever can
 * set an address at the IdP. These tests pin the order that fixes it and the
 * one case where the address is still allowed to decide.
 */

const IDP = 'conqr-zitadel';
const WORKSPACE = 'ws-1';
const SUBJECT = 'zitadel-sub-1';

const existing = { id: 'user-existing', email: 'amina@example.test' };
const linked = { id: 'user-linked', email: 'amina.new@example.test' };

function build(
  fixtures: {
    idpKey?: string;
    account?: unknown;
    byId?: unknown;
    byEmail?: unknown;
  } = {},
) {
  const link = jest.fn(async () => undefined);
  const signup = jest.fn(async (dto: any) => ({
    id: 'user-provisioned',
    email: dto.email,
  }));

  const service = new OidcIdentityLinkService(
    { getSuiteIdpKey: () => fixtures.idpKey ?? IDP } as any,
    {
      findById: jest.fn(async () =>
        'byId' in fixtures ? fixtures.byId : linked,
      ),
      findByEmail: jest.fn(async () =>
        'byEmail' in fixtures ? fixtures.byEmail : undefined,
      ),
    } as any,
    {
      findByProviderSubject: jest.fn(async () => fixtures.account),
      link,
    } as any,
    { signup } as any,
  );

  const resolve = (sub = SUBJECT, email = 'amina@example.test') =>
    service.resolveUser(
      { sub, email, name: 'Amina', emailVerified: true },
      WORKSPACE,
    );

  return { service, resolve, link, signup };
}

describe('OIDC login — which user a subject resolves to', () => {
  it('matches on the subject, not on the address', async () => {
    const { resolve } = build({
      account: { userId: linked.id },
      // A different person holds the address now. The subject must win.
      byEmail: existing,
    });
    await expect(resolve()).resolves.toMatchObject({ id: linked.id });
  });

  it('records the link on every login, not only the first', async () => {
    const { resolve, link } = build({ account: { userId: linked.id } });
    await resolve();
    expect(link).toHaveBeenCalledWith({
      userId: linked.id,
      workspaceId: WORKSPACE,
      idpKey: IDP,
      providerUserId: SUBJECT,
    });
  });

  it('falls back to the address once, and links the subject while doing so', async () => {
    /**
     * The adoption path: a workspace full of users who predate SSO has to be
     * linkable, and their first sign-in is the only time the address decides
     * anything for them.
     */
    const { resolve, link, signup } = build({ byEmail: existing });
    await expect(resolve()).resolves.toMatchObject({ id: existing.id });
    expect(signup).not.toHaveBeenCalled();
    expect(link).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existing.id, providerUserId: SUBJECT }),
    );
  });

  it('provisions a user nobody matches, and links that subject too', async () => {
    const { resolve, link, signup } = build({});
    await expect(resolve()).resolves.toMatchObject({ id: 'user-provisioned' });
    expect(signup).toHaveBeenCalled();
    expect(link).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-provisioned',
        providerUserId: SUBJECT,
      }),
    );
  });

  it('refuses a link that points at a user who is gone', async () => {
    /**
     * Deliberately not a fall-through to the email path. Falling back is how a
     * deleted-and-recreated account quietly becomes somebody else.
     */
    const { resolve } = build({
      account: { userId: 'user-vanished' },
      byId: undefined,
      byEmail: existing,
    });
    await expect(resolve()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('behaves exactly as before when no suite IdP key is configured', async () => {
    // The mapping is additive: a deployment that has not opted in keeps the
    // email-matching login it already had, and writes nothing.
    const { resolve, link } = build({ idpKey: '', byEmail: existing });
    await expect(resolve()).resolves.toMatchObject({ id: existing.id });
    expect(link).not.toHaveBeenCalled();
  });

  it('keeps two subjects apart even when they share an address', async () => {
    const first = build({ account: { userId: 'user-a' }, byId: { id: 'user-a' } });
    const second = build({ account: { userId: 'user-b' }, byId: { id: 'user-b' } });
    await expect(first.resolve('sub-a')).resolves.toMatchObject({ id: 'user-a' });
    await expect(second.resolve('sub-b')).resolves.toMatchObject({ id: 'user-b' });
  });
});
