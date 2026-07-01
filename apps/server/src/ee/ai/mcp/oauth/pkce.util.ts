import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * RFC 7636 code_verifier: 43–128 chars from the unreserved set
 * `ALPHA / DIGIT / "-" / "." / "_" / "~"`.
 */
const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * Verify a PKCE `S256` challenge (the only method we accept — OAuth 2.1).
 *
 *   code_challenge == BASE64URL( SHA256( ASCII(code_verifier) ) )   (unpadded)
 *
 * Node's `base64url` digest encoding is already URL-safe and unpadded, matching
 * RFC 7636 §4.2. Comparison is constant-time. Verified against the RFC 7636
 * Appendix B test vector in the unit tests.
 */
export function verifyPkceS256(
  codeVerifier: string,
  storedChallenge: string,
): boolean {
  if (typeof codeVerifier !== 'string' || typeof storedChallenge !== 'string') {
    return false;
  }
  if (!CODE_VERIFIER_RE.test(codeVerifier)) {
    return false;
  }

  const recomputed = createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');

  const a = Buffer.from(recomputed);
  const b = Buffer.from(storedChallenge);
  // Length check first: timingSafeEqual throws on length mismatch, and an
  // early length compare doesn't leak anything the caller can't already see.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True only for the one PKCE method we support. */
export function isSupportedChallengeMethod(method: string | undefined): boolean {
  return method === 'S256';
}
