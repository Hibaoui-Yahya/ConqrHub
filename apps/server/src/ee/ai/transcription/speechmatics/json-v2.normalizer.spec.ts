import { normalizeJsonV2 } from './json-v2.normalizer';

function word(
  content: string,
  start: number,
  end: number,
  speaker?: string,
  confidence = 0.9,
  language?: string,
) {
  return {
    type: 'word' as const,
    start_time: start,
    end_time: end,
    alternatives: [{ content, confidence, speaker, language }],
  };
}

function punct(content: string, at: number) {
  return {
    type: 'punctuation' as const,
    start_time: at,
    end_time: at,
    attaches_to: 'previous',
    alternatives: [{ content, confidence: 1 }],
  };
}

const twoSpeakerPayload = {
  format: '2.9',
  job: { duration: 61.5 },
  metadata: {
    transcription_config: { language: 'en', diarization: 'speaker' },
    language_pack_info: { word_delimiter: ' ' },
  },
  results: [
    word('Hello', 0.1, 0.4, 'S1'),
    word('team', 0.5, 0.8, 'S1', 0.95),
    punct('.', 0.8),
    word('We', 3.0, 3.2, 'S2', 0.8),
    word('agreed', 3.3, 3.7, 'S2', 0.85),
    punct('.', 3.7),
  ],
};

describe('normalizeJsonV2', () => {
  it('groups words into speaker-split segments with punctuation attached', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(t.segments).toHaveLength(2);
    expect(t.segments[0].text).toBe('Hello team.');
    expect(t.segments[0].speaker).toBe('S1');
    expect(t.segments[1].text).toBe('We agreed.');
    expect(t.segments[1].speaker).toBe('S2');
  });

  it('assigns stable sequential segment ids', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(t.segments.map((s) => s.id)).toEqual(['s0000', 's0001']);
  });

  it('converts times to milliseconds', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(t.segments[0].startMs).toBe(100);
    expect(t.segments[0].endMs).toBe(800);
  });

  it('computes mean confidence per segment', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(t.segments[0].confidence).toBeCloseTo((0.9 + 0.95) / 2, 3);
  });

  it('builds a speaker map with mean confidence', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(Object.keys(t.speakers).sort()).toEqual(['S1', 'S2']);
    expect(t.speakers.S1.displayName).toBe('S1');
    expect(t.speakers.S1.userId).toBeNull();
  });

  it('reports duration and language metadata', () => {
    const t = normalizeJsonV2(twoSpeakerPayload);
    expect(t.audioDurationSeconds).toBe(61.5);
    expect(t.language).toBe('en');
  });

  it('splits on silence gaps above 2s within the same speaker', () => {
    const t = normalizeJsonV2({
      results: [
        word('before', 0, 0.5, 'S1'),
        word('after', 5.0, 5.4, 'S1'),
      ],
    });
    expect(t.segments).toHaveLength(2);
  });

  it('labels unidentified speech UU and marks Unknown display name', () => {
    const t = normalizeJsonV2({
      results: [word('mystery', 0, 0.5, 'UU')],
    });
    expect(t.segments[0].speaker).toBe('UU');
    expect(t.speakers.UU.displayName).toBe('Unknown');
  });

  it('collects detected languages (code-switching, e.g. ar_en)', () => {
    const t = normalizeJsonV2({
      results: [
        word('hello', 0, 0.4, 'S1', 0.9, 'en'),
        word('مرحبا', 3.5, 4.0, 'S1', 0.9, 'ar'),
      ],
    });
    expect(t.detectedLanguages.sort()).toEqual(['ar', 'en']);
  });

  it('handles empty and malformed payloads without throwing', () => {
    expect(normalizeJsonV2({}).segments).toHaveLength(0);
    expect(normalizeJsonV2(null).segments).toHaveLength(0);
    expect(
      normalizeJsonV2({ results: [{ type: 'word', start_time: 0, end_time: 1 }] })
        .segments,
    ).toHaveLength(0);
  });

  it('preserves channel labels when channel diarization is used', () => {
    const t = normalizeJsonV2({
      results: [
        { ...word('agent', 0, 0.4), channel: 'Me' },
        { ...word('caller', 3.5, 4.0), channel: 'Meeting' },
      ],
    });
    expect(t.segments[0].channel).toBe('Me');
    expect(t.segments[1].channel).toBe('Meeting');
    expect(t.segments).toHaveLength(2);
  });
});
