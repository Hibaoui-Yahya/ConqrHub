/**
 * Canonical suite identifiers issued by an identity provider rather than by
 * ConqrHub.
 *
 * `canonical-identity.util.ts` handles the ones ConqrHub mints from its own
 * primary keys — `conqr:person:<hub user id>` — and says, correctly, that only
 * ConqrHub may pull the raw id back out of one. That rule is what makes this
 * file necessary: another product cannot mint those, because it does not hold
 * ConqrHub's id space, and a product that built one would be asserting that a
 * value from its own database names a row in ours.
 *
 * What every suite product does share is the identity provider. So a product
 * acting on behalf of a person sends the subject and organisation it verified:
 *
 *   conqr:person:oidc:<idp-key>:<subject>
 *   conqr:org:oidc:<idp-key>:<organisation>
 *
 * The `oidc:` segment is load-bearing, not decoration. Without it a bare
 * provider subject satisfies `isPersonUid()` — its pattern is
 * `[A-Za-z0-9._-]{1,128}`, which a subject matches — and would be handed to
 * `hubIdFromPersonUid` and then to a user lookup, as if a Zitadel subject were
 * a ConqrHub row id. With it the value contains colons, `isPersonUid()`
 * returns false, `hubIdFromPersonUid` throws, and only the resolver below
 * accepts it. That is exactly the set of readers that should.
 *
 * `<idp-key>` names *which* provider. Two deployments federated to different
 * providers can hold identical numeric subjects, and without this segment they
 * would resolve to each other's users.
 */

const PERSON_PREFIX = 'conqr:person:';
const ORG_PREFIX = 'conqr:org:';
const OIDC_NAMESPACE = 'oidc';

/** Same grammar as the canonical ids, so one vocabulary spans the suite. */
const SEGMENT_RE = /^[A-Za-z0-9._-]{1,128}$/;

export interface ProviderIdentity {
  /** Which identity provider issued the value. */
  idpKey: string;
  /** The provider's own identifier: an OIDC `sub`, or an organisation id. */
  externalId: string;
}

function parse(value: unknown, prefix: string): ProviderIdentity | null {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  // Exactly three segments. Splitting with a limit would silently accept a
  // fourth and quietly drop it, and a value we only partly understand is a
  // value we should refuse rather than interpret.
  const parts = value.slice(prefix.length).split(':');
  if (parts.length !== 3) return null;
  const [namespace, idpKey, externalId] = parts;
  if (namespace !== OIDC_NAMESPACE) return null;
  if (!SEGMENT_RE.test(idpKey) || !SEGMENT_RE.test(externalId)) return null;
  return { idpKey, externalId };
}

/** The provider subject inside a `conqr:person:oidc:…` uid, or null. */
export function parseProviderPersonUid(value: unknown): ProviderIdentity | null {
  return parse(value, PERSON_PREFIX);
}

/** The provider organisation inside a `conqr:org:oidc:…` uid, or null. */
export function parseProviderOrgUid(value: unknown): ProviderIdentity | null {
  return parse(value, ORG_PREFIX);
}

/** Build the person uid for a subject. Used by tests and by tooling. */
export function toProviderPersonUid(idpKey: string, subject: string): string {
  return `${PERSON_PREFIX}${OIDC_NAMESPACE}:${idpKey}:${subject}`;
}

/** Build the organisation uid. Used by tests and by tooling. */
export function toProviderOrgUid(idpKey: string, organisation: string): string {
  return `${ORG_PREFIX}${OIDC_NAMESPACE}:${idpKey}:${organisation}`;
}
