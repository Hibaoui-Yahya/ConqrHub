/**
 * Pure OIDC claim → Conqr user mapping (blueprint §9.1). Kept separate from the
 * network flow so it is unit-testable without a live IdP. Tenant + authorization
 * are validated server-side by the caller; this only normalizes identity claims.
 */

export interface OidcIdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  [k: string]: unknown;
}

export interface MappedOidcUser {
  email: string;
  name: string;
  sub: string;
  emailVerified: boolean;
}

export class OidcClaimError extends Error {}

export function mapOidcClaimsToUser(
  claims: OidcIdTokenClaims | undefined,
): MappedOidcUser {
  if (!claims) throw new OidcClaimError('Missing ID token claims');
  const email = (claims.email ?? '').trim().toLowerCase();
  if (!email) throw new OidcClaimError('OIDC provider returned no email claim');
  if (!claims.sub) throw new OidcClaimError('OIDC provider returned no subject');

  const name =
    (claims.name && String(claims.name).trim()) ||
    [claims.given_name, claims.family_name].filter(Boolean).join(' ').trim() ||
    (claims.preferred_username && String(claims.preferred_username)) ||
    email.split('@')[0];

  return {
    email,
    name,
    sub: String(claims.sub),
    emailVerified: claims.email_verified === true,
  };
}
