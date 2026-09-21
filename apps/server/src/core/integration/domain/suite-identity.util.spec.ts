import {
  isPersonUid,
  isOrgUid,
  hubIdFromPersonUid,
} from './canonical-identity.util';
import {
  parseProviderOrgUid,
  parseProviderPersonUid,
  toProviderOrgUid,
  toProviderPersonUid,
} from './suite-identity.util';

const IDP = 'conqr-zitadel';
const SUBJECT = '218374982734';
const ORG = '298347293847';

describe('provider-issued canonical identifiers', () => {
  it('round-trips a subject and an organisation', () => {
    expect(parseProviderPersonUid(toProviderPersonUid(IDP, SUBJECT))).toEqual({
      idpKey: IDP,
      externalId: SUBJECT,
    });
    expect(parseProviderOrgUid(toProviderOrgUid(IDP, ORG))).toEqual({
      idpKey: IDP,
      externalId: ORG,
    });
  });

  /**
   * The reason the `oidc:` segment exists at all.
   *
   * A bare provider subject satisfies `isPersonUid` — the pattern after the
   * prefix is `[A-Za-z0-9._-]{1,128}`, which a Zitadel subject matches — so
   * without the segment it would reach `hubIdFromPersonUid` and then a user
   * lookup, as though a subject from another system were a Hub row id.
   */
  it('is not mistakable for an identifier ConqrHub minted', () => {
    const bare = `conqr:person:${SUBJECT}`;
    expect(isPersonUid(bare)).toBe(true);
    expect(hubIdFromPersonUid(bare)).toBe(SUBJECT);

    const provider = toProviderPersonUid(IDP, SUBJECT);
    expect(isPersonUid(provider)).toBe(false);
    expect(() => hubIdFromPersonUid(provider)).toThrow();
    expect(isOrgUid(toProviderOrgUid(IDP, ORG))).toBe(false);
  });

  it('refuses anything it only partly understands', () => {
    for (const value of [
      // Hub's own form: a different namespace, resolved elsewhere.
      `conqr:person:${SUBJECT}`,
      // Wrong namespace.
      `conqr:person:saml:${IDP}:${SUBJECT}`,
      // A fourth segment. Accepting it and dropping the extra would be
      // interpreting a value we do not understand.
      `conqr:person:oidc:${IDP}:${SUBJECT}:extra`,
      // Missing a segment.
      `conqr:person:oidc:${SUBJECT}`,
      // Wrong kind of identifier.
      toProviderOrgUid(IDP, ORG),
      // Not an identifier.
      '',
      null,
      undefined,
      42,
    ]) {
      expect(parseProviderPersonUid(value)).toBeNull();
    }
  });

  it('refuses a segment that would make the split ambiguous', () => {
    expect(parseProviderPersonUid('conqr:person:oidc:idp:has:colon')).toBeNull();
    expect(parseProviderPersonUid('conqr:person:oidc:idp:has space')).toBeNull();
    expect(
      parseProviderPersonUid(`conqr:person:oidc:idp:${'x'.repeat(129)}`),
    ).toBeNull();
  });

  it('keeps two providers apart', () => {
    // The same numeric subject at two providers is two different people, and
    // without the idp key segment they would resolve to each other.
    const a = parseProviderPersonUid(toProviderPersonUid('idp-a', SUBJECT));
    const b = parseProviderPersonUid(toProviderPersonUid('idp-b', SUBJECT));
    expect(a!.idpKey).not.toEqual(b!.idpKey);
  });
});
