import {
  captureGaps,
  captureLimits,
  captureState,
  formatCaptureDuration,
  planCapture,
  type ManifestChunk,
} from './meeting-capture.util';

const chunk = (
  source: string,
  sequence: number,
  o: Partial<ManifestChunk> = {},
): ManifestChunk => ({
  source,
  sequence,
  startMs: sequence * 10_000,
  durationMs: 10_000,
  path: `${source}-${sequence}`,
  bytes: 100,
  mime: 'audio/webm;codecs=opus',
  ...o,
});

describe('captureLimits', () => {
  it('defaults to 4 hours and 1.5 GiB', () => {
    const limits = captureLimits({});
    expect(limits.maxDurationMs).toBe(4 * 60 * 60 * 1000);
    expect(limits.maxBytes).toBe(1536 * 1024 * 1024);
  });
  it('reads the environment and clamps nonsense', () => {
    expect(captureLimits({ MEETING_CAPTURE_MAX_MINUTES: '90' }).maxDurationMs).toBe(90 * 60_000);
    expect(captureLimits({ MEETING_CAPTURE_MAX_MINUTES: '0' }).maxDurationMs).toBe(60_000);
    expect(captureLimits({ MEETING_CAPTURE_MAX_MINUTES: '99999' }).maxDurationMs).toBe(24 * 60 * 60_000);
    expect(captureLimits({ MEETING_CAPTURE_MAX_MINUTES: 'abc' }).maxDurationMs).toBe(4 * 60 * 60_000);
    expect(captureLimits({ MEETING_CAPTURE_MAX_MB: '64' }).maxBytes).toBe(64 * 1024 * 1024);
  });
  it('formats the limit in French', () => {
    expect(formatCaptureDuration(4 * 3_600_000)).toBe('4 h');
    expect(formatCaptureDuration(90 * 60_000)).toBe('1 h 30');
    expect(formatCaptureDuration(45 * 60_000)).toBe('45 min');
  });
});

describe('planCapture', () => {
  it('keeps every standalone chunk as its own take (the single-upload path)', () => {
    const plan = planCapture([chunk('mic', 0), chunk('system', 0)]);
    expect(plan.takes.map((t) => [t.source, t.path, t.parts])).toEqual([
      ['mic', 'mic-0', undefined],
      ['system', 'system-0', undefined],
    ]);
    expect(plan.missing).toEqual({ mic: [], system: [] });
  });

  it('appends continuation chunks to the chunk that carries the header, in sequence order', () => {
    const plan = planCapture([
      chunk('mic', 2, { continuation: true }),
      chunk('mic', 0),
      chunk('mic', 1, { continuation: true }),
    ]);
    expect(plan.takes).toHaveLength(1);
    expect(plan.takes[0]).toMatchObject({
      source: 'mic',
      path: 'mic-0',
      parts: ['mic-0', 'mic-1', 'mic-2'],
      startMs: 0,
      durationMs: 30_000,
      sequence: 0,
      lastSequence: 2,
      mime: 'audio/webm;codecs=opus',
    });
    expect(plan.takes[0].gapped).toBeUndefined();
  });

  it('starts a new take after a reload (a standalone chunk mid-recording)', () => {
    const plan = planCapture([
      chunk('mic', 0),
      chunk('mic', 1, { continuation: true }),
      chunk('mic', 2, { startMs: 25_000 }),
      chunk('mic', 3, { continuation: true, startMs: 35_000 }),
    ]);
    expect(plan.takes.map((t) => [t.parts, t.startMs, t.durationMs])).toEqual([
      [['mic-0', 'mic-1'], 0, 20_000],
      [['mic-2', 'mic-3'], 25_000, 20_000],
    ]);
  });

  it('keeps the two sources apart even with overlapping sequence numbers', () => {
    const plan = planCapture([
      chunk('mic', 0),
      chunk('system', 0, { startMs: 4000 }),
      chunk('mic', 1, { continuation: true }),
      chunk('system', 1, { continuation: true }),
    ]);
    expect(plan.takes.map((t) => [t.source, t.parts])).toEqual([
      ['mic', ['mic-0', 'mic-1']],
      ['system', ['system-0', 'system-1']],
    ]);
  });

  it('reports missing sequences, marks a lossy append and isolates headerless chunks', () => {
    const plan = planCapture([
      chunk('mic', 0),
      chunk('mic', 2, { continuation: true }),
      chunk('system', 1, { continuation: true }),
    ]);
    expect(plan.missing).toEqual({ mic: [1], system: [0] });
    expect(plan.takes).toHaveLength(1);
    expect(plan.takes[0]).toMatchObject({ parts: ['mic-0', 'mic-2'], gapped: true });
    expect(plan.orphans).toEqual([{ source: 'system', sequence: 1, path: 'system-1' }]);
  });

  it('treats chunks without a source or continuation flag as before (legacy manifests)', () => {
    const plan = planCapture([{ path: 'a.webm', sequence: 0 }, { path: '', sequence: 1 } as any]);
    expect(plan.takes).toEqual([
      expect.objectContaining({ source: 'mic', path: 'a.webm', mime: 'audio/webm' }),
    ]);
  });
});

describe('captureState and captureGaps', () => {
  it('tells a reloaded recorder where to resume, per source', () => {
    const state = captureState([
      chunk('mic', 0, { sha256: 'aa' }),
      chunk('mic', 1, { continuation: true }),
      chunk('system', 0, { bytes: 50 }),
    ]);
    expect(state.totalBytes).toBe(250);
    expect(state.durationMs).toBe(20_000);
    expect(state.sources.mic).toMatchObject({
      count: 2,
      lastSequence: 1,
      nextSequence: 2,
      missingSequences: [],
      endMs: 20_000,
      takes: 1,
    });
    expect(state.sources.mic.chunks[0]).toEqual({
      sequence: 0,
      startMs: 0,
      durationMs: 10_000,
      bytes: 100,
      sha256: 'aa',
      continuation: false,
    });
    expect(state.sources.system).toMatchObject({ count: 1, nextSequence: 1, bytes: 50 });
  });

  it('starts an empty source at sequence 0', () => {
    const state = captureState([]);
    expect(state.sources.mic).toMatchObject({ count: 0, lastSequence: -1, nextSequence: 0 });
    expect(state.sources.system.chunks).toEqual([]);
  });

  it('finds holes and a lost tail the recorder says it sent', () => {
    const chunks = [chunk('mic', 0), chunk('mic', 2), chunk('system', 0)];
    expect(captureGaps(chunks)).toEqual({ mic: [1] });
    expect(captureGaps(chunks, { mic: 3, system: 1 })).toEqual({ mic: [1, 3], system: [1] });
    expect(captureGaps(chunks, { mic: 2, system: 0 })).toEqual({ mic: [1] });
    expect(captureGaps([chunk('mic', 0)], { mic: 0 })).toEqual({});
  });
});
