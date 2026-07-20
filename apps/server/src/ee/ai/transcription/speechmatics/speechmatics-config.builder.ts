import { BatchSubmitRequest } from '../transcription-provider.interface';

const MAX_ADDITIONAL_VOCAB = 1000;

export interface SpeechmaticsJobConfig {
  type: 'transcription';
  transcription_config: Record<string, unknown>;
  fetch_data?: { url: string };
  notification_config?: Array<{
    url: string;
    contents: string[];
    auth_headers: string[];
  }>;
  language_identification_config?: { expected_languages: string[] };
  translation_config?: { target_languages: string[] };
}

export interface BuiltConfig {
  config: SpeechmaticsJobConfig;
  /** Degradations applied (e.g. vocab trimmed) — recorded in the manifest. */
  warnings: string[];
}

/**
 * Pure builder: BatchSubmitRequest -> Speechmatics batch job config.
 * Only emits keys the current batch API supports (feature detection over
 * assumption — see CONQR_SPEECHMATICS_INTEGRATION.md §2).
 */
export function buildSpeechmaticsJobConfig(
  req: BatchSubmitRequest,
  defaults: { operatingPoint: 'standard' | 'enhanced' },
): BuiltConfig {
  const warnings: string[] = [];

  // Punctuation stays at provider defaults (all marks enabled) — it also
  // feeds diarization accuracy. permitted_marks expects an array, so only
  // ever emit punctuation_overrides with explicit mark lists.
  const transcription: Record<string, unknown> = {
    language: req.language.language ?? 'en',
    operating_point: req.language.operatingPoint ?? defaults.operatingPoint,
  };

  if (req.diarization === 'speaker') {
    transcription.diarization = 'speaker';
    const sdc: Record<string, unknown> = {};
    if (req.speakerSensitivity !== undefined) {
      sdc.speaker_sensitivity = clamp(req.speakerSensitivity, 0, 1);
    }
    if (req.maxSpeakers !== undefined) {
      sdc.max_speakers = Math.max(2, Math.floor(req.maxSpeakers));
    }
    if (Object.keys(sdc).length > 0) {
      transcription.speaker_diarization_config = sdc;
    }
  } else if (req.diarization === 'channel') {
    transcription.diarization = 'channel';
    if (req.channelLabels?.length) {
      transcription.channel_diarization_labels = req.channelLabels;
    }
  }

  if (req.additionalVocab?.length) {
    let vocab = req.additionalVocab.filter(
      (v) => v.content && v.content.trim().length > 0,
    );
    if (vocab.length > MAX_ADDITIONAL_VOCAB) {
      warnings.push(
        `additional_vocab trimmed from ${vocab.length} to ${MAX_ADDITIONAL_VOCAB}`,
      );
      vocab = vocab.slice(0, MAX_ADDITIONAL_VOCAB);
    }
    transcription.additional_vocab = vocab.map((v) =>
      v.soundsLike?.length
        ? { content: v.content, sounds_like: v.soundsLike }
        : { content: v.content },
    );
  }

  const config: SpeechmaticsJobConfig = {
    type: 'transcription',
    transcription_config: transcription,
  };

  if (req.audioUrl) {
    config.fetch_data = { url: req.audioUrl };
  }

  if (
    !req.language.language &&
    req.language.expectedLanguages &&
    req.language.expectedLanguages.length > 0
  ) {
    config.language_identification_config = {
      expected_languages: req.language.expectedLanguages,
    };
    // language identification requires no fixed language; Speechmatics
    // requires `language: "auto"` semantics via omission is not supported,
    // so keep the default 'en' out and mark auto detection.
    config.transcription_config.language = 'auto';
  }

  if (req.language.translationTargets?.length) {
    const targets = req.language.translationTargets.slice(0, 5);
    if (targets.length < req.language.translationTargets.length) {
      warnings.push('translation targets trimmed to 5');
    }
    config.translation_config = { target_languages: targets };
  }

  if (req.notification) {
    config.notification_config = [
      {
        url: req.notification.url,
        // jobinfo only: we re-fetch the transcript ourselves so the webhook
        // body is never trusted as data (CONQR_MEETING_SECURITY_AND_PRIVACY.md).
        contents: ['jobinfo'],
        auth_headers: [`Authorization: Bearer ${req.notification.authToken}`],
      },
    ];
  }

  return { config, warnings };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
