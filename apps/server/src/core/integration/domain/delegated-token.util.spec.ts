import {
  mintDelegatedToken,
  verifyDelegatedToken,
} from './delegated-token.util';

const SECRET = 'app-secret-at-least-32-chars-long-xx';
const base = {
  sub: 'user_1',
  tid: 'ws_1',
  aud: 'plane-adapter',
  scope: ['work-item:create'],
  ttlSeconds: 300,
  nowSeconds: 1_000_000,
};

describe('delegated-token', () => {
  it('mints a token that verifies with matching audience/scope', () => {
    const token = mintDelegatedToken(base, SECRET);
    const res = verifyDelegatedToken(
      token,
      { audience: 'plane-adapter', requiredScope: 'work-item:create', nowSeconds: 1_000_100 },
      SECRET,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.sub).toBe('user_1');
      expect(res.claims.act).toBe('obo');
    }
  });

  it('rejects a wrong audience (confused-deputy guard)', () => {
    const token = mintDelegatedToken(base, SECRET);
    const res = verifyDelegatedToken(
      token,
      { audience: 'hub', nowSeconds: 1_000_100 },
      SECRET,
    );
    expect(res).toEqual({ ok: false, reason: 'wrong_audience' });
  });

  it('rejects insufficient scope (least privilege)', () => {
    const token = mintDelegatedToken(base, SECRET);
    const res = verifyDelegatedToken(
      token,
      { audience: 'plane-adapter', requiredScope: 'work-item:delete', nowSeconds: 1_000_100 },
      SECRET,
    );
    expect(res).toEqual({ ok: false, reason: 'insufficient_scope' });
  });

  it('rejects an expired token', () => {
    const token = mintDelegatedToken(base, SECRET);
    const res = verifyDelegatedToken(
      token,
      { audience: 'plane-adapter', nowSeconds: 1_000_000 + 301 },
      SECRET,
    );
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a tampered payload', () => {
    const token = mintDelegatedToken(base, SECRET);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...base, sub: 'attacker', iat: base.nowSeconds, exp: base.nowSeconds + 300, act: 'obo' }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const res = verifyDelegatedToken(
      `${h}.${forged}.${s}`,
      { audience: 'plane-adapter', nowSeconds: 1_000_100 },
      SECRET,
    );
    expect(res.ok).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintDelegatedToken(base, SECRET);
    const res = verifyDelegatedToken(
      token,
      { audience: 'plane-adapter', nowSeconds: 1_000_100 },
      'other-secret',
    );
    expect(res).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
