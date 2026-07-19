import { mapOidcClaimsToUser, OidcClaimError } from './oidc.util';

describe('mapOidcClaimsToUser', () => {
  it('maps standard claims and normalizes email', () => {
    const u = mapOidcClaimsToUser({
      sub: 'idp|1',
      email: 'Yahya@Conqr.AI',
      email_verified: true,
      name: 'Yahya H',
    });
    expect(u).toEqual({
      email: 'yahya@conqr.ai',
      name: 'Yahya H',
      sub: 'idp|1',
      emailVerified: true,
    });
  });

  it('derives a name from given/family, then username, then email local part', () => {
    expect(
      mapOidcClaimsToUser({ sub: 's', email: 'a@b.co', given_name: 'A', family_name: 'B' }).name,
    ).toBe('A B');
    expect(
      mapOidcClaimsToUser({ sub: 's', email: 'a@b.co', preferred_username: 'auser' }).name,
    ).toBe('auser');
    expect(mapOidcClaimsToUser({ sub: 's', email: 'a@b.co' }).name).toBe('a');
  });

  it('defaults emailVerified to false when not asserted', () => {
    expect(mapOidcClaimsToUser({ sub: 's', email: 'a@b.co' }).emailVerified).toBe(false);
  });

  it('throws when email or subject is missing', () => {
    expect(() => mapOidcClaimsToUser({ sub: 's' })).toThrow(OidcClaimError);
    expect(() => mapOidcClaimsToUser({ email: 'a@b.co' })).toThrow(OidcClaimError);
    expect(() => mapOidcClaimsToUser(undefined)).toThrow(OidcClaimError);
  });
});
