import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * On-behalf-of / delegated authorization tokens (blueprint §9.1).
 *
 * User-initiated cross-product operations must preserve the acting user's
 * identity — never a single all-powerful integration bot. These are short-lived,
 * audience-bound, least-privilege tokens carrying the actor (`sub`), the
 * delegating context, and explicit scopes, signed with the app secret. Compact
 * HMAC format (no external dep): base64url(header).base64url(payload).sig
 */

export interface DelegatedClaims {
  /** Subject — the acting user id (on-behalf-of). */
  sub: string;
  /** Tenant/workspace the action is scoped to. */
  tid: string;
  /** Audience — the target product/service, e.g. "plane-adapter". */
  aud: string;
  /** Least-privilege scopes, e.g. ["work-item:create"]. */
  scope: string[];
  /** Issued-at / expiry (epoch seconds). */
  iat: number;
  exp: number;
  /** Marks this as an on-behalf-of delegation, not a raw user session. */
  act: 'obo';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'CONQR-OBO' }));

export function mintDelegatedToken(
  params: {
    sub: string;
    tid: string;
    aud: string;
    scope: string[];
    ttlSeconds: number;
    nowSeconds: number;
  },
  secret: string,
): string {
  if (!secret) throw new Error('App secret required to mint delegated token');
  const claims: DelegatedClaims = {
    sub: params.sub,
    tid: params.tid,
    aud: params.aud,
    scope: params.scope,
    iat: params.nowSeconds,
    exp: params.nowSeconds + Math.max(1, params.ttlSeconds),
    act: 'obo',
  };
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${HEADER}.${payload}`;
  const sig = b64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

export interface VerifyOptions {
  audience: string;
  requiredScope?: string;
  nowSeconds: number;
}

export type VerifyResult =
  | { ok: true; claims: DelegatedClaims }
  | { ok: false; reason: string };

export function verifyDelegatedToken(
  token: string | undefined,
  opts: VerifyOptions,
  secret: string,
): VerifyResult {
  if (!token || !secret) return { ok: false, reason: 'missing_token_or_secret' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, payload, sig] = parts;

  const expected = b64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest(),
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: DelegatedClaims;
  try {
    claims = JSON.parse(b64urlDecode(payload).toString());
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }

  if (claims.act !== 'obo') return { ok: false, reason: 'not_delegated' };
  if (claims.aud !== opts.audience) return { ok: false, reason: 'wrong_audience' };
  if (opts.nowSeconds >= claims.exp) return { ok: false, reason: 'expired' };
  if (opts.requiredScope && !claims.scope.includes(opts.requiredScope)) {
    return { ok: false, reason: 'insufficient_scope' };
  }
  return { ok: true, claims };
}
