/**
 * The language a meeting asks speech recognition for, from its
 * languageConfig (`{ language }` sent at start / upload / process, e.g.
 * ConqrMeet's "en", "fr", "ar", "ar_en"). Pure; unit-tested in
 * meeting-stt-language.util.spec.ts.
 *
 * What reaches the provider: nothing today. Meeting transcription is the
 * diarized Mistral request, which needs segment timestamps, and Mistral
 * documents `language` as not compatible with `timestamp_granularities`
 * (docs.mistral.ai, audio transcription). Sending it would make the
 * diarized call fail and fall back to the single-speaker path. So the
 * provider auto-detects, and the requested language is applied everywhere
 * the Hub decides: the transcript's language, the report language and the
 * recorded processing config. `PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION`
 * is the one switch to flip if the provider lifts that restriction.
 */

export const PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION = false;

/**
 * Code-switching meetings (e.g. Arabic + English in one sentence). A
 * single-language hint would push the model to transcribe — or translate —
 * everything into one language, so these always auto-detect.
 */
const CODE_SWITCHING = new Set(['ar_en', 'en_ar']);

export type SttLanguage = {
  /** What the meeting asked for, normalised ("fr", "ar_en", …), or null. */
  requested: string | null;
  /** ISO 639-1 code for the provider, or null (auto-detect). */
  hint: string | null;
  mode: 'auto' | 'single' | 'code_switching';
  /** Whether `hint` is sent to the provider in this deployment. */
  sentToProvider: boolean;
};

/** "fr", "fr-CA", "FR_fr" → "fr"; "ar_en" → code-switching; else auto. */
export function sttLanguage(languageConfig: unknown): SttLanguage {
  const raw =
    languageConfig && typeof languageConfig === 'object'
      ? (languageConfig as { language?: unknown }).language
      : undefined;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase().replace('-', '_') : '';
  if (!value || value === 'auto') {
    return { requested: null, hint: null, mode: 'auto', sentToProvider: false };
  }
  if (CODE_SWITCHING.has(value)) {
    return { requested: value, hint: null, mode: 'code_switching', sentToProvider: false };
  }
  const m = value.match(/^([a-z]{2})(?:_[a-z]{2,4})?$/);
  if (!m) return { requested: null, hint: null, mode: 'auto', sentToProvider: false };
  return {
    requested: m[1],
    hint: m[1],
    mode: 'single',
    sentToProvider: PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION,
  };
}

/**
 * The language a report is written in, from the meeting's own choice: a
 * code-switching meeting names no single report language (the account and
 * company defaults decide), instead of "ar_en" being read as Arabic.
 */
export function reportLanguageCandidate(languageConfig: unknown): string | null {
  const stt = sttLanguage(languageConfig);
  return stt.mode === 'single' ? stt.requested : null;
}
