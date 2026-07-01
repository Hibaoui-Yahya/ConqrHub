import { isSupportedChallengeMethod, verifyPkceS256 } from './pkce.util';

describe('verifyPkceS256', () => {
  // RFC 7636 Appendix B canonical test vector.
  const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('accepts the RFC 7636 Appendix B vector', () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true);
  });

  it('rejects a tampered verifier', () => {
    expect(verifyPkceS256(VERIFIER + 'x', CHALLENGE)).toBe(false);
    expect(verifyPkceS256('a'.repeat(43), CHALLENGE)).toBe(false);
  });

  it('rejects a tampered challenge', () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE.slice(0, -1) + 'X')).toBe(false);
  });

  it('rejects verifiers outside the RFC length bounds', () => {
    expect(verifyPkceS256('short', CHALLENGE)).toBe(false);
    expect(verifyPkceS256('a'.repeat(129), CHALLENGE)).toBe(false);
  });

  it('rejects verifiers with characters outside the unreserved set', () => {
    const bad = 'a'.repeat(42) + '+'; // 43 chars, contains '+'
    expect(verifyPkceS256(bad, CHALLENGE)).toBe(false);
  });

  it('does not match a padded/standard-base64 challenge', () => {
    // A challenge that is standard base64 (padded / with +,/) must not verify.
    expect(verifyPkceS256(VERIFIER, CHALLENGE + '=')).toBe(false);
  });
});

describe('isSupportedChallengeMethod', () => {
  it('only accepts S256', () => {
    expect(isSupportedChallengeMethod('S256')).toBe(true);
    expect(isSupportedChallengeMethod('plain')).toBe(false);
    expect(isSupportedChallengeMethod('s256')).toBe(false);
    expect(isSupportedChallengeMethod(undefined)).toBe(false);
  });
});
