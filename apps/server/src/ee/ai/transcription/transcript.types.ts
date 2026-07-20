/**
 * Canonical, provider-independent transcript model.
 * See CONQR_MEETING_DATA_MODEL.md §2. Raw provider payloads are preserved
 * unchanged in storage; everything downstream consumes only these types.
 */

export interface TranscriptSegment {
  /** Stable within a transcript version, e.g. "s0042". */
  id: string;
  /** Diarization label ("S1", "UU") or channel label; null when unknown. */
  speaker: string | null;
  channel: string | null;
  startMs: number;
  endMs: number;
  text: string;
  /** Mean word confidence 0..1; null when the provider reports none. */
  confidence: number | null;
  language: string | null;
  redacted: boolean;
  excludedFromAi: boolean;
  edited: boolean;
}

export interface SpeakerInfo {
  label: string;
  displayName: string;
  /** Linked Hub user id when identified/mapped by a human. */
  userId: string | null;
  confidence: number;
}

export type SpeakerMap = Record<string, SpeakerInfo>;

export interface CanonicalTranscript {
  segments: TranscriptSegment[];
  speakers: SpeakerMap;
  language: string | null;
  detectedLanguages: string[];
  /** Total audio duration in seconds as reported by the provider. */
  audioDurationSeconds: number | null;
  providerMetadata: Record<string, unknown>;
}

export interface MeetingLanguageConfig {
  /** Language pack code: "en", "fr", "ar", bilingual packs like "ar_en". */
  language?: string;
  /** Batch-only language identification hint. */
  expectedLanguages?: string[];
  translationTargets?: string[];
  operatingPoint?: 'standard' | 'enhanced';
}

export interface AdditionalVocabEntry {
  content: string;
  soundsLike?: string[];
}
