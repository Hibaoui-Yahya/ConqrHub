import {
  buildSourceSegments,
  splitIntoSegments,
  transcriptToText,
} from './meeting-transcript.util';

const seg = (text: string, start: number, end: number, speakerId: string | null) => ({
  text,
  startMs: start,
  endMs: end,
  speakerId,
});

describe('buildSourceSegments', () => {
  const src = { channel: 'mic', startMs: 0, durationMs: 40_000 };

  it('labels diarized speakers by first appearance and merges their turns', () => {
    const { segments, speakers } = buildSourceSegments(
      {
        text: 'ignored',
        segments: [
          seg('Good morning everyone.', 200, 1600, 'speaker_2'),
          seg("Let's start.", 2500, 4600, 'speaker_2'),
          seg('Sure.', 10300, 10800, 'speaker_1'),
          seg('Almost done.', 11600, 13400, 'speaker_1'),
          seg('Great.', 20200, 20600, 'speaker_2'),
        ],
      },
      src,
      false,
    );

    expect(speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(segments.map((s) => [s.speaker, s.text, s.startMs, s.endMs])).toEqual([
      ['Speaker 1', "Good morning everyone. Let's start.", 200, 4600],
      ['Speaker 2', 'Sure. Almost done.', 10300, 13400],
      ['Speaker 1', 'Great.', 20200, 20600],
    ]);
  });

  it('does not merge across a long pause', () => {
    const { segments } = buildSourceSegments(
      {
        text: '',
        segments: [seg('One.', 0, 1000, 'speaker_1'), seg('Two.', 9000, 9500, 'speaker_1')],
      },
      src,
      false,
    );
    expect(segments).toHaveLength(2);
  });

  it('names mic and system speakers separately on dual-stream recordings', () => {
    const mic = buildSourceSegments(
      { text: '', segments: [seg('Hi.', 0, 500, 'speaker_1')] },
      src,
      true,
    );
    const system = buildSourceSegments(
      {
        text: '',
        segments: [seg('Hello.', 0, 500, 'speaker_1'), seg('Hey.', 5000, 5500, 'speaker_2')],
      },
      { ...src, channel: 'system' },
      true,
    );
    expect(mic.speakers).toEqual(['Me']);
    expect(system.speakers).toEqual(['Participant 1', 'Participant 2']);
  });

  it('offsets timings by the source start', () => {
    const { segments } = buildSourceSegments(
      { text: '', segments: [seg('Hi.', 1000, 2000, 'speaker_1')] },
      { ...src, startMs: 60_000 },
      false,
    );
    expect([segments[0].startMs, segments[0].endMs]).toEqual([61_000, 62_000]);
  });

  it('falls back to paragraphs of plain text when not diarized', () => {
    const { segments, speakers } = buildSourceSegments(
      { text: 'First sentence. Second sentence.', segments: [] },
      src,
      false,
    );
    expect(speakers).toEqual(['Speaker 1']);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('First sentence. Second sentence.');
  });

  it('returns nothing for a silent source', () => {
    expect(buildSourceSegments({ text: '  ', segments: [] }, src, false)).toEqual({
      segments: [],
      speakers: [],
    });
  });
});

describe('splitIntoSegments', () => {
  it('chunks long text into ~400 char paragraphs spread over the duration', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} says something useful.`).join(' ');
    const out = splitIntoSegments(text, {
      speaker: 'Speaker 1',
      channel: null,
      startMs: 0,
      durationMs: 600_000,
    });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((s) => s.text.length <= 400)).toBe(true);
    expect(out[0].startMs).toBe(0);
    expect(out[out.length - 1].endMs).toBe(600_000);
  });
});

describe('transcriptToText', () => {
  it('prefixes speaker names (display name first) when there are several', () => {
    const text = transcriptToText(
      [
        { speaker: 'Speaker 1', text: 'Hello.' },
        { speaker: 'Speaker 1', text: 'How are you?' },
        { speaker: 'Speaker 2', text: 'Fine.' },
      ],
      { 'Speaker 2': { displayName: 'Sarah' } },
    );
    expect(text).toBe('Speaker 1: Hello. How are you?\n\nSarah: Fine.');
  });

  it('keeps plain paragraphs for a single speaker', () => {
    expect(
      transcriptToText([
        { speaker: 'Speaker 1', text: 'A.' },
        { speaker: 'Speaker 1', text: 'B.' },
      ]),
    ).toBe('A.\n\nB.');
  });
});
