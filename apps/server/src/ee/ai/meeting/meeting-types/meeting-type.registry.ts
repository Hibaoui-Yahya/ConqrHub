import { MeetingTypeDefinition } from './meeting-type.types';
import { genericMeeting } from './types/generic-meeting';
import { dailyStandup } from './types/daily-standup';
import { salesDiscovery } from './types/sales-discovery';
import { recruitmentInterview } from './types/recruitment-interview';

/**
 * Platform meeting-type registry (D8). The full 22-type catalog is
 * documented in CONQR_MEETING_USE_CASE_CATALOG.md; types are added here
 * as one file each under ./types with no pipeline changes. DB-stored
 * workspace template overrides (meeting_templates) merge onto these
 * definitions in later phases.
 */
const REGISTRY = new Map<string, MeetingTypeDefinition>(
  [genericMeeting, dailyStandup, salesDiscovery, recruitmentInterview].map(
    (d) => [d.id, d] as const,
  ),
);

export const DEFAULT_MEETING_TYPE = genericMeeting.id;

/** Sensitive types are excluded from workspace-wide knowledge by default (D14). */
export const SENSITIVE_TYPES = new Set(
  [...REGISTRY.values()].filter((d) => d.sensitivity === 's3').map((d) => d.id),
);

export function getMeetingType(id: string): MeetingTypeDefinition {
  return REGISTRY.get(id) ?? genericMeeting;
}

export function hasMeetingType(id: string): boolean {
  return REGISTRY.has(id);
}

export function listMeetingTypes(): MeetingTypeDefinition[] {
  return [...REGISTRY.values()];
}

/**
 * Rule-based classification (detection priority step 4): keyword hits over
 * the transcript text. Returns null when nothing clears the floor.
 */
export function classifyByRules(
  text: string,
): { typeId: string; confidence: number } | null {
  const lower = text.toLowerCase();
  let best: { typeId: string; hits: number; total: number } | null = null;
  for (const def of REGISTRY.values()) {
    if (def.detectionKeywords.length === 0) continue;
    const hits = def.detectionKeywords.filter((k) => lower.includes(k)).length;
    if (hits >= 2 && (!best || hits > best.hits)) {
      best = { typeId: def.id, hits, total: def.detectionKeywords.length };
    }
  }
  if (!best) return null;
  return {
    typeId: best.typeId,
    confidence: Math.min(0.9, 0.4 + 0.1 * best.hits),
  };
}
