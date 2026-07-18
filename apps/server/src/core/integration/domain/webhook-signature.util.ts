import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Plane webhook signature verification (blueprint §9.4).
 *
 * Plane signs each delivery with HMAC-SHA256 over the RAW request body and
 * sends it in `X-Plane-Signature` (delivery id in `X-Plane-Delivery`, event in
 * `X-Plane-Event`). We must verify against the exact bytes received — never a
 * re-serialized object — and compare in constant time.
 */

export const PLANE_SIGNATURE_HEADER = 'x-plane-signature';
export const PLANE_DELIVERY_HEADER = 'x-plane-delivery';
export const PLANE_EVENT_HEADER = 'x-plane-event';

export function computeSignature(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Constant-time verification. Returns false (never throws) for any missing or
 * malformed input so callers can respond with a uniform 401 without leaking
 * which check failed.
 */
export function verifyPlaneSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = computeSignature(rawBody, secret);
  // Some senders prefix the algorithm (e.g. "sha256=..."); accept both.
  const provided = signature.includes('=')
    ? signature.slice(signature.indexOf('=') + 1)
    : signature;

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided.trim(), 'utf8');

  // timingSafeEqual throws on length mismatch — guard first, but still do a
  // dummy compare so timing doesn't reveal the length difference.
  if (expectedBuf.length !== providedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
