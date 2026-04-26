import { Test, TestingModule } from '@nestjs/testing';
import {
  CONTENT_FULL_WORDS,
  CONTENT_MIN_WORDS,
  FRESHNESS_FRESH_DAYS,
  FRESHNESS_STALE_DAYS,
  ScoringService,
  SPACE_MIN_PAGES_FOR_SCORE,
} from './scoring.service';

const NOW = new Date('2026-04-26T12:00:00Z');

const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000);

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService],
    }).compile();
    service = module.get<ScoringService>(ScoringService);
  });

  describe('scoreFreshness', () => {
    it('returns 100 for a page updated today', () => {
      expect(service.scoreFreshness(NOW, NOW)).toBe(100);
    });

    it('returns 100 at the fresh-day cutoff', () => {
      expect(service.scoreFreshness(daysAgo(FRESHNESS_FRESH_DAYS), NOW)).toBe(
        100,
      );
    });

    it('returns 0 at or beyond the stale cutoff', () => {
      expect(service.scoreFreshness(daysAgo(FRESHNESS_STALE_DAYS), NOW)).toBe(
        0,
      );
      expect(
        service.scoreFreshness(daysAgo(FRESHNESS_STALE_DAYS + 30), NOW),
      ).toBe(0);
    });

    it('decays linearly between fresh and stale cutoffs', () => {
      const midpoint = (FRESHNESS_FRESH_DAYS + FRESHNESS_STALE_DAYS) / 2;
      const score = service.scoreFreshness(daysAgo(midpoint), NOW);
      expect(score).toBeGreaterThanOrEqual(48);
      expect(score).toBeLessThanOrEqual(52);
    });
  });

  describe('scoreOwnership', () => {
    it('rewards an active owner', () => {
      expect(service.scoreOwnership(true)).toBe(100);
    });
    it('penalises a missing or deactivated owner', () => {
      expect(service.scoreOwnership(false)).toBe(0);
    });
  });

  describe('scoreVerification', () => {
    it('returns null for non-critical pages with no verification record', () => {
      expect(
        service.scoreVerification({
          isCritical: false,
          hasVerificationRecord: false,
          verificationStatus: null,
          verificationExpiresAt: null,
          now: NOW,
        }),
      ).toBeNull();
    });

    it('returns 100 for a critical page with verified status and future expiry', () => {
      expect(
        service.scoreVerification({
          isCritical: true,
          hasVerificationRecord: true,
          verificationStatus: 'verified',
          verificationExpiresAt: new Date(NOW.getTime() + 86_400_000),
          now: NOW,
        }),
      ).toBe(100);
    });

    it('returns 0 for a verified page whose expiry is past', () => {
      expect(
        service.scoreVerification({
          isCritical: true,
          hasVerificationRecord: true,
          verificationStatus: 'verified',
          verificationExpiresAt: new Date(NOW.getTime() - 86_400_000),
          now: NOW,
        }),
      ).toBe(0);
    });

    it('returns 50 for an expiring verification', () => {
      expect(
        service.scoreVerification({
          isCritical: true,
          hasVerificationRecord: true,
          verificationStatus: 'expiring',
          verificationExpiresAt: new Date(NOW.getTime() + 5 * 86_400_000),
          now: NOW,
        }),
      ).toBe(50);
    });

    it('returns 0 when a critical page has no verification record', () => {
      expect(
        service.scoreVerification({
          isCritical: true,
          hasVerificationRecord: false,
          verificationStatus: null,
          verificationExpiresAt: null,
          now: NOW,
        }),
      ).toBe(0);
    });
  });

  describe('scoreContentStrength', () => {
    it('returns 100 for content above the full-words threshold', () => {
      expect(service.scoreContentStrength(CONTENT_FULL_WORDS)).toBe(100);
      expect(service.scoreContentStrength(CONTENT_FULL_WORDS + 100)).toBe(100);
    });

    it('returns 0 for content below the minimum', () => {
      expect(service.scoreContentStrength(0)).toBe(0);
      expect(service.scoreContentStrength(CONTENT_MIN_WORDS - 1)).toBe(0);
    });

    it('scales between min and full word counts', () => {
      const midpoint = Math.round(
        (CONTENT_MIN_WORDS + CONTENT_FULL_WORDS) / 2,
      );
      const score = service.scoreContentStrength(midpoint);
      expect(score).toBeGreaterThanOrEqual(48);
      expect(score).toBeLessThanOrEqual(52);
    });
  });

  describe('scorePage', () => {
    const baseInput = {
      updatedAt: NOW,
      hasActiveOwner: true,
      isCritical: false,
      hasVerificationRecord: false,
      verificationStatus: null,
      verificationExpiresAt: null,
      wordCount: 500,
    };

    it('produces 100 for a perfect non-critical page', () => {
      const result = service.scorePage(baseInput, NOW);
      expect(result.total).toBe(100);
    });

    it('drops the score when a signal underperforms', () => {
      const result = service.scorePage(
        { ...baseInput, hasActiveOwner: false },
        NOW,
      );
      expect(result.total).toBeLessThan(100);
      expect(result.signals.ownership).toBe(0);
    });

    it('does not penalise a non-critical page on the verification axis', () => {
      const noVerification = service.scorePage(baseInput, NOW);
      const verifiedNonCritical = service.scorePage(
        {
          ...baseInput,
          hasVerificationRecord: false,
          verificationStatus: null,
        },
        NOW,
      );
      expect(noVerification.total).toBe(verifiedNonCritical.total);
    });

    it('marks the verification signal null for non-critical pages', () => {
      const result = service.scorePage(baseInput, NOW);
      expect(result.signals.verification).toBeNull();
    });

    it('penalises a critical page with no verification', () => {
      const critical = service.scorePage(
        { ...baseInput, isCritical: true },
        NOW,
      );
      expect(critical.total).toBeLessThan(100);
      expect(critical.signals.verification).toBe(0);
    });
  });

  describe('rollup', () => {
    const perfect = (n: number) =>
      Array.from({ length: n }, () => ({
        total: 100,
        signals: {
          freshness: 100,
          ownership: 100,
          verification: 100,
          contentStrength: 100,
        },
      }));

    it('returns insufficientData when below the minimum page count', () => {
      const result = service.rollup(perfect(SPACE_MIN_PAGES_FOR_SCORE - 1));
      expect(result.score).toBeNull();
      expect(result.insufficientData).toBe(true);
    });

    it('returns the average score when the page count is sufficient', () => {
      const result = service.rollup(perfect(SPACE_MIN_PAGES_FOR_SCORE));
      expect(result.score).toBe(100);
      expect(result.insufficientData).toBe(false);
    });

    it('averages mixed scores correctly', () => {
      const mixed = [
        ...perfect(5),
        ...Array.from({ length: 5 }, () => ({
          total: 50,
          signals: {
            freshness: 50,
            ownership: 50,
            verification: 50,
            contentStrength: 50,
          },
        })),
      ];
      const result = service.rollup(mixed);
      expect(result.score).toBe(75);
      expect(result.signals.freshness).toBe(75);
    });

    it('averages verification only over pages where it applies', () => {
      const critical = Array.from({ length: 4 }, () => ({
        total: 50,
        signals: {
          freshness: 50,
          ownership: 50,
          verification: 0,
          contentStrength: 50,
        },
      }));
      const nonCritical = Array.from({ length: 6 }, () => ({
        total: 100,
        signals: {
          freshness: 100,
          ownership: 100,
          verification: null,
          contentStrength: 100,
        },
      }));
      const result = service.rollup([...critical, ...nonCritical]);

      expect(result.signals.verification).toBe(0);
      expect(result.signals.freshness).toBe(80);
    });

    it('returns null verification when no page contributes', () => {
      const onlyNonCritical = Array.from(
        { length: SPACE_MIN_PAGES_FOR_SCORE },
        () => ({
          total: 100,
          signals: {
            freshness: 100,
            ownership: 100,
            verification: null,
            contentStrength: 100,
          },
        }),
      );
      const result = service.rollup(onlyNonCritical);
      expect(result.signals.verification).toBeNull();
      expect(result.score).toBe(100);
    });
  });

  describe('countWords', () => {
    it('returns 0 for null or empty strings', () => {
      expect(service.countWords(null)).toBe(0);
      expect(service.countWords('')).toBe(0);
      expect(service.countWords('   ')).toBe(0);
    });

    it('counts whitespace-separated tokens', () => {
      expect(service.countWords('hello world')).toBe(2);
      expect(service.countWords('   one  two   three  ')).toBe(3);
      expect(service.countWords('multi\nline\ttext here')).toBe(4);
    });
  });
});
