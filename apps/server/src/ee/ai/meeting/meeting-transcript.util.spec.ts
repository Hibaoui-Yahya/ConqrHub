import {
  buildSourceSegments,
  numberMeetingSpeakers,
  preservesSpokenWords,
  explicitSpeakerNames,
  splitIntoSegments,
  transcriptToText,
} from './meeting-transcript.util';

const seg = (
  text: string,
  start: number,
  end: number,
  speakerId: string | null,
) => ({
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
    expect(
      segments.map((s) => [s.speaker, s.text, s.startMs, s.endMs]),
    ).toEqual([
      ['Speaker 1', "Good morning everyone. Let's start.", 200, 4600],
      ['Speaker 2', 'Sure. Almost done.', 10300, 13400],
      ['Speaker 1', 'Great.', 20200, 20600],
    ]);
  });

  it('does not merge across a long pause', () => {
    const { segments } = buildSourceSegments(
      {
        text: '',
        segments: [
          seg('One.', 0, 1000, 'speaker_1'),
          seg('Two.', 9000, 9500, 'speaker_1'),
        ],
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
        segments: [
          seg('Hello.', 0, 500, 'speaker_1'),
          seg('Hey.', 5000, 5500, 'speaker_2'),
        ],
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
    expect(speakers).toEqual(['Unidentified voice (mic)']);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('First sentence. Second sentence.');
  });

  it('returns nothing for a silent source', () => {
    expect(
      buildSourceSegments({ text: '  ', segments: [] }, src, false),
    ).toEqual({
      segments: [],
      speakers: [],
    });
  });
});

describe('acoustic speaker numbering and transcript fidelity', () => {
  it('uses only self-introductions by that voice and leaves conflicting names unresolved', () => {
    const segments = [
      {
        speaker: 'Speaker 1',
        text: "Bonjour Alice, je m'appelle Julie. Le budget est fixé.",
      },
      {
        speaker: 'Speaker 2',
        text: 'My name is Paul Chenel and I will send the notes.',
      },
      { speaker: 'Speaker 3', text: "Je m'appelle Alice." },
      { speaker: 'Speaker 3', text: "Je m'appelle Sara." },
      {
        speaker: 'Speaker 4',
        text: "Je m'appelle Fiction.",
        attribution: 'unresolved',
      },
    ].map((s) => ({
      ...s,
      id: 'x',
      startMs: 0,
      endMs: 1,
      channel: 'system',
      confidence: null,
      attribution: s.attribution ?? 'acoustic',
    })) as any;
    expect(explicitSpeakerNames(segments)).toEqual({
      'Speaker 1': 'Julie',
      'Speaker 2': 'Paul Chenel',
    });
  });
  it('numbers three voices across mic and remote audio by chronological appearance', () => {
    const source = (speakerId: string, startMs: number, channel: string) =>
      buildSourceSegments(
        {
          text: '',
          segments: [seg('Words.', startMs, startMs + 800, speakerId)],
        },
        { channel, startMs: 0, durationMs: 9000 },
        true,
      ).segments[0];
    const a = source('a', 4000, 'mic');
    a.speaker = 'mic:a';
    const b = source('a', 1000, 'system');
    b.speaker = 'remote:a';
    const c = source('b', 2000, 'system');
    c.speaker = 'remote:b';
    const again = { ...b, id: 'again', startMs: 8000, endMs: 9000 };
    const turns = [a, again, c, b];
    numberMeetingSpeakers(turns);
    expect(turns.map((t) => t.speaker)).toEqual([
      'Speaker 1',
      'Speaker 2',
      'Speaker 3',
      'Speaker 1',
    ]);
    expect(turns.map((t) => t.channel)).toEqual([
      'system',
      'system',
      'mic',
      'system',
    ]);
  });
  it('keeps missing speaker ids separate from a detected voice', () => {
    const result = buildSourceSegments(
      {
        text: '',
        segments: [
          seg('Known.', 0, 1000, 'a'),
          seg('Uncertain.', 1200, 1700, null),
          seg('Known again.', 2000, 3000, 'a'),
        ],
      },
      { channel: 'system', startMs: 0, durationMs: 3000 },
      false,
    );
    expect(result.segments[1].attribution).toBe('unresolved');
    expect(result.segments[1].speaker).toBe('Unidentified voice (system)');
    expect(result.segments[0].speaker).toBe(result.segments[2].speaker);
  });
  it('does not shorten overlapping segment timing', () => {
    const result = buildSourceSegments(
      {
        text: '',
        segments: [seg('One.', 0, 3000, 'a'), seg('Two.', 1000, 2000, 'a')],
      },
      { channel: 'mic', startMs: 0, durationMs: 4000 },
      false,
    );
    expect(result.segments[0].endMs).toBe(3000);
    expect(result.segments[0].rawText).toBe('One. Two.');
  });
  it.each([
    ['oui oui le budget est 5000', 'Oui, oui, le budget est 5000.', true],
    ['Je ne suis pas disponible lundi.', 'Je suis disponible lundi.', false],
    ['trois ingénieurs pas quatre', 'Trois ingénieurs, pas quatre.', true],
    ['trois ingénieurs pas quatre', 'Nous recrutons trois ingénieurs.', false],
    ['الموعد نهار الخميس', 'الموعد نهار الخميس.', true],
    ['the budget is 5000', 'The budget is 6000.', false],
    ['oui euh oui', 'Oui.', false],
  ])('checks word preservation for %s', (raw, corrected, expected) => {
    expect(preservesSpokenWords(raw, corrected)).toBe(expected);
  });
});

describe('splitIntoSegments', () => {
  it('chunks long text into ~400 char paragraphs spread over the duration', () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Sentence ${i} says something useful.`,
    ).join(' ');
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

  it('keeps a speaker label even for a single speaker', () => {
    expect(
      transcriptToText([
        { speaker: 'Speaker 1', text: 'A.' },
        { speaker: 'Speaker 1', text: 'B.' },
      ]),
    ).toBe('Speaker 1: A. B.');
  });
});
