import { DuplicatesService } from './duplicates.service';

describe('DuplicatesService', () => {
  describe('threshold()', () => {
    const svc = new DuplicatesService({} as any);
    let orig: string | undefined;

    beforeEach(() => {
      orig = process.env.DOC_HEALTH_DUPLICATE_THRESHOLD;
    });

    afterEach(() => {
      if (orig === undefined) {
        delete process.env.DOC_HEALTH_DUPLICATE_THRESHOLD;
      } else {
        process.env.DOC_HEALTH_DUPLICATE_THRESHOLD = orig;
      }
    });

    it('returns the default when the env var is unset', () => {
      delete process.env.DOC_HEALTH_DUPLICATE_THRESHOLD;
      expect(svc.threshold()).toBeCloseTo(0.6);
    });

    it('honours the env override', () => {
      process.env.DOC_HEALTH_DUPLICATE_THRESHOLD = '0.8';
      expect(svc.threshold()).toBeCloseTo(0.8);
    });

    it('clamps to MIN when override is too low', () => {
      process.env.DOC_HEALTH_DUPLICATE_THRESHOLD = '0.05';
      expect(svc.threshold()).toBeCloseTo(0.3);
    });

    it('clamps to MAX when override is too high', () => {
      process.env.DOC_HEALTH_DUPLICATE_THRESHOLD = '0.99';
      expect(svc.threshold()).toBeCloseTo(0.95);
    });

    it('falls back to the default when the override is non-numeric', () => {
      process.env.DOC_HEALTH_DUPLICATE_THRESHOLD = 'oops';
      expect(svc.threshold()).toBeCloseTo(0.6);
    });
  });
});
