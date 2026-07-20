import { buildSpeechmaticsJobConfig } from './speechmatics-config.builder';
import { BatchSubmitRequest } from '../transcription-provider.interface';

const base: BatchSubmitRequest = {
  audioUrl: 'https://signed.example/audio',
  mime: 'audio/webm',
  language: { language: 'en' },
  diarization: 'speaker',
};

describe('buildSpeechmaticsJobConfig', () => {
  it('builds a speaker-diarized fetch_data job', () => {
    const { config, warnings } = buildSpeechmaticsJobConfig(base, {
      operatingPoint: 'enhanced',
    });
    expect(config.type).toBe('transcription');
    expect(config.transcription_config.language).toBe('en');
    expect(config.transcription_config.operating_point).toBe('enhanced');
    expect(config.transcription_config.diarization).toBe('speaker');
    expect(config.fetch_data).toEqual({ url: 'https://signed.example/audio' });
    expect(warnings).toHaveLength(0);
  });

  it('supports bilingual packs like ar_en', () => {
    const { config } = buildSpeechmaticsJobConfig(
      { ...base, language: { language: 'ar_en' } },
      { operatingPoint: 'enhanced' },
    );
    expect(config.transcription_config.language).toBe('ar_en');
  });

  it('clamps speaker sensitivity and enforces max_speakers >= 2', () => {
    const { config } = buildSpeechmaticsJobConfig(
      { ...base, speakerSensitivity: 1.7, maxSpeakers: 1 },
      { operatingPoint: 'standard' },
    );
    const sdc = config.transcription_config.speaker_diarization_config as {
      speaker_sensitivity: number;
      max_speakers: number;
    };
    expect(sdc.speaker_sensitivity).toBe(1);
    expect(sdc.max_speakers).toBe(2);
  });

  it('emits channel diarization with labels', () => {
    const { config } = buildSpeechmaticsJobConfig(
      { ...base, diarization: 'channel', channelLabels: ['Me', 'Meeting'] },
      { operatingPoint: 'enhanced' },
    );
    expect(config.transcription_config.diarization).toBe('channel');
    expect(config.transcription_config.channel_diarization_labels).toEqual([
      'Me',
      'Meeting',
    ]);
  });

  it('trims additional_vocab to the 1000-entry API limit with a warning', () => {
    const vocab = Array.from({ length: 1200 }, (_, i) => ({
      content: `term${i}`,
    }));
    const { config, warnings } = buildSpeechmaticsJobConfig(
      { ...base, additionalVocab: vocab },
      { operatingPoint: 'enhanced' },
    );
    expect(
      (config.transcription_config.additional_vocab as unknown[]).length,
    ).toBe(1000);
    expect(warnings[0]).toContain('trimmed');
  });

  it('formats sounds_like entries', () => {
    const { config } = buildSpeechmaticsJobConfig(
      {
        ...base,
        additionalVocab: [
          { content: 'Keycloak', soundsLike: ['key cloak'] },
          { content: 'ConqrPlane' },
        ],
      },
      { operatingPoint: 'enhanced' },
    );
    expect(config.transcription_config.additional_vocab).toEqual([
      { content: 'Keycloak', sounds_like: ['key cloak'] },
      { content: 'ConqrPlane' },
    ]);
  });

  it('sets notification_config with jobinfo only and bearer auth header', () => {
    const { config } = buildSpeechmaticsJobConfig(
      {
        ...base,
        notification: { url: 'https://hub.example/api/cb', authToken: 'tok123' },
      },
      { operatingPoint: 'enhanced' },
    );
    expect(config.notification_config).toEqual([
      {
        url: 'https://hub.example/api/cb',
        contents: ['jobinfo'],
        auth_headers: ['Authorization: Bearer tok123'],
      },
    ]);
  });

  it('uses language identification when only expectedLanguages given', () => {
    const { config } = buildSpeechmaticsJobConfig(
      { ...base, language: { expectedLanguages: ['en', 'fr', 'ar'] } },
      { operatingPoint: 'enhanced' },
    );
    expect(config.language_identification_config).toEqual({
      expected_languages: ['en', 'fr', 'ar'],
    });
  });

  it('caps translation targets at 5 with a warning', () => {
    const { config, warnings } = buildSpeechmaticsJobConfig(
      {
        ...base,
        language: {
          language: 'en',
          translationTargets: ['fr', 'de', 'es', 'it', 'pt', 'nl'],
        },
      },
      { operatingPoint: 'enhanced' },
    );
    expect(config.translation_config?.target_languages).toHaveLength(5);
    expect(warnings.some((w) => w.includes('translation'))).toBe(true);
  });
});
