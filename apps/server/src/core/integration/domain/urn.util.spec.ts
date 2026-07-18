import { buildUrn, isValidUrn, parseUrn, urnWithoutBlock } from './urn.util';

describe('urn.util', () => {
  it('builds canonical URNs', () => {
    expect(buildUrn('plane', 'work-item', 'wi_789')).toBe(
      'conqr://plane/work-item/wi_789',
    );
    expect(buildUrn('hub', 'page', 'page_123', 'req_45')).toBe(
      'conqr://hub/page/page_123#block=req_45',
    );
  });

  it('parses URNs with and without a block anchor', () => {
    const a = parseUrn('conqr://plane/work-item/wi_789');
    expect(a).toMatchObject({ product: 'plane', type: 'work-item', id: 'wi_789' });
    expect(a.block).toBeUndefined();

    const b = parseUrn('conqr://hub/page/page_123#block=req_45');
    expect(b).toMatchObject({
      product: 'hub',
      type: 'page',
      id: 'page_123',
      block: 'req_45',
    });
  });

  it('round-trips build → parse', () => {
    const urn = buildUrn('core', 'user', 'user_1');
    expect(parseUrn(urn).id).toBe('user_1');
  });

  it('rejects malformed URNs', () => {
    expect(isValidUrn('http://plane/work-item/1')).toBe(false);
    expect(isValidUrn('conqr://mars/page/1')).toBe(false);
    expect(isValidUrn('conqr://plane/work-item/')).toBe(false);
    expect(() => parseUrn('nonsense')).toThrow();
  });

  it('strips the block anchor to resolve the parent object', () => {
    expect(urnWithoutBlock('conqr://hub/page/page_123#block=req_45')).toBe(
      'conqr://hub/page/page_123',
    );
  });

  it('rejects an invalid product at build time', () => {
    expect(() => buildUrn('bogus' as any, 'page', '1')).toThrow();
  });
});
