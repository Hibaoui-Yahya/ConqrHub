import {
  computeSignature,
  verifyPlaneSignature,
} from './webhook-signature.util';

describe('webhook-signature.util', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ event: 'issue', action: 'updated', id: 'wi_1' });

  it('verifies a correct signature over the raw body', () => {
    const sig = computeSignature(body, secret);
    expect(verifyPlaneSignature(body, sig, secret)).toBe(true);
  });

  it('accepts an algorithm-prefixed signature (sha256=...)', () => {
    const sig = computeSignature(body, secret);
    expect(verifyPlaneSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = computeSignature(body, secret);
    expect(verifyPlaneSignature(body + ' ', sig, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = computeSignature(body, secret);
    expect(verifyPlaneSignature(body, sig, 'other-secret')).toBe(false);
  });

  it('returns false (never throws) on missing inputs', () => {
    expect(verifyPlaneSignature(undefined, 'x', secret)).toBe(false);
    expect(verifyPlaneSignature(body, undefined, secret)).toBe(false);
    expect(verifyPlaneSignature(body, 'x', undefined)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyPlaneSignature(body, 'abc', secret)).toBe(false);
  });
});
