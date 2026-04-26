import { Injectable } from '@nestjs/common';
import { SignalBreakdown } from '../dto/doc-health.dto';

export const SIGNAL_WEIGHTS = {
  freshness: 0.3,
  ownership: 0.25,
  verification: 0.25,
  contentStrength: 0.2,
} as const;

export const FRESHNESS_FRESH_DAYS = 90;
export const FRESHNESS_STALE_DAYS = 365;
export const CONTENT_FULL_WORDS = 300;
export const CONTENT_MIN_WORDS = 50;
export const SPACE_MIN_PAGES_FOR_SCORE = 10;
export const VERIFICATION_STATUS_VERIFIED = 'verified';
export const VERIFICATION_STATUS_EXPIRING = 'expiring';

export type PageScoringInput = {
  updatedAt: Date;
  hasActiveOwner: boolean;
  isCritical: boolean;
  hasVerificationRecord: boolean;
  verificationStatus: string | null;
  verificationExpiresAt: Date | null;
  wordCount: number;
};

export type ScoredPage = {
  total: number;
  signals: SignalBreakdown;
};

@Injectable()
export class ScoringService {
  scoreFreshness(updatedAt: Date, now: Date = new Date()): number {
    const ageDays = (now.getTime() - updatedAt.getTime()) / 86_400_000;
    if (ageDays <= FRESHNESS_FRESH_DAYS) return 100;
    if (ageDays >= FRESHNESS_STALE_DAYS) return 0;
    const range = FRESHNESS_STALE_DAYS - FRESHNESS_FRESH_DAYS;
    const decayed = (FRESHNESS_STALE_DAYS - ageDays) / range;
    return Math.round(Math.max(0, Math.min(100, decayed * 100)));
  }

  scoreOwnership(hasActiveOwner: boolean): number {
    return hasActiveOwner ? 100 : 0;
  }

  scoreVerification(input: {
    isCritical: boolean;
    hasVerificationRecord: boolean;
    verificationStatus: string | null;
    verificationExpiresAt: Date | null;
    now?: Date;
  }): number | null {
    const isTracked = input.isCritical || input.hasVerificationRecord;
    if (!isTracked) return null;

    const status = input.verificationStatus;
    if (status === VERIFICATION_STATUS_VERIFIED) {
      const now = input.now ?? new Date();
      if (
        input.verificationExpiresAt &&
        input.verificationExpiresAt.getTime() <= now.getTime()
      ) {
        return 0;
      }
      return 100;
    }
    if (status === VERIFICATION_STATUS_EXPIRING) return 50;
    return 0;
  }

  scoreContentStrength(wordCount: number): number {
    if (wordCount >= CONTENT_FULL_WORDS) return 100;
    if (wordCount < CONTENT_MIN_WORDS) return 0;
    const range = CONTENT_FULL_WORDS - CONTENT_MIN_WORDS;
    const ratio = (wordCount - CONTENT_MIN_WORDS) / range;
    return Math.round(ratio * 100);
  }

  scorePage(input: PageScoringInput, now: Date = new Date()): ScoredPage {
    const freshness = this.scoreFreshness(input.updatedAt, now);
    const ownership = this.scoreOwnership(input.hasActiveOwner);
    const verification = this.scoreVerification({
      isCritical: input.isCritical,
      hasVerificationRecord: input.hasVerificationRecord,
      verificationStatus: input.verificationStatus,
      verificationExpiresAt: input.verificationExpiresAt,
      now,
    });
    const contentStrength = this.scoreContentStrength(input.wordCount);

    let weightSum = 0;
    let weightedTotal = 0;
    const add = (signal: number, weight: number) => {
      weightedTotal += signal * weight;
      weightSum += weight;
    };
    add(freshness, SIGNAL_WEIGHTS.freshness);
    add(ownership, SIGNAL_WEIGHTS.ownership);
    if (verification !== null) {
      add(verification, SIGNAL_WEIGHTS.verification);
    }
    add(contentStrength, SIGNAL_WEIGHTS.contentStrength);

    const total = weightSum === 0 ? 0 : Math.round(weightedTotal / weightSum);

    return {
      total,
      signals: {
        freshness,
        ownership,
        verification,
        contentStrength,
      },
    };
  }

  rollup(scoredPages: ScoredPage[]): {
    score: number | null;
    signals: SignalBreakdown;
    insufficientData: boolean;
  } {
    if (scoredPages.length < SPACE_MIN_PAGES_FOR_SCORE) {
      return {
        score: null,
        signals: {
          freshness: 0,
          ownership: 0,
          verification: null,
          contentStrength: 0,
        },
        insufficientData: true,
      };
    }
    let freshnessSum = 0;
    let ownershipSum = 0;
    let contentSum = 0;
    let verificationSum = 0;
    let verificationCount = 0;
    let totalSum = 0;
    for (const p of scoredPages) {
      freshnessSum += p.signals.freshness;
      ownershipSum += p.signals.ownership;
      contentSum += p.signals.contentStrength;
      if (p.signals.verification !== null) {
        verificationSum += p.signals.verification;
        verificationCount += 1;
      }
      totalSum += p.total;
    }
    const n = scoredPages.length;
    return {
      score: Math.round(totalSum / n),
      signals: {
        freshness: Math.round(freshnessSum / n),
        ownership: Math.round(ownershipSum / n),
        verification:
          verificationCount === 0
            ? null
            : Math.round(verificationSum / verificationCount),
        contentStrength: Math.round(contentSum / n),
      },
      insufficientData: false,
    };
  }

  countWords(text: string | null): number {
    if (!text) return 0;
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }
}
