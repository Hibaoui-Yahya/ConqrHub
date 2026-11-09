/**
 * Progressive live capture (start → many chunks → stop). Pure helpers,
 * unit-tested in meeting-capture.util.spec.ts; the contract is documented in
 * MEET_CONTRACT.md.
 *
 * A recorder uploads its audio every few seconds, per source ("mic" and
 * "system"), with a sequence number that starts at 0 and grows by one per
 * source. A chunk is either standalone (a complete, decodable file) or a
 * continuation of the previous sequence of the same source: MediaRecorder's
 * timeslice parts carry the container header only in the first part, so
 * continuation bytes are only decodable once appended to what came before.
 * A page reload starts a new MediaRecorder, hence a new standalone chunk at
 * the next sequence number. The stored chunks stay the only copy of the
 * audio; a "take" is a run of chunks read back as one file.
 */

export const CAPTURE_SOURCES = ['mic', 'system'] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

const MINUTE_MS = 60_000;
const MIB = 1024 * 1024;

/** Default upper bound of one recording: 2 hours of audio. Longer runs are untested against the provider, the pipeline and the ffmpeg mix. */
export const DEFAULT_MAX_CAPTURE_MINUTES = 120;
/** Default upper bound of the stored audio of one meeting, all chunks. */
export const DEFAULT_MAX_CAPTURE_MIB = 1536;
/** One uploaded chunk (multipart file part). Matches the controller. */
export const MAX_CHUNK_BYTES = 150 * MIB;
/** Chunks of one source (4 h at one chunk per second is 14 400). */
export const MAX_CHUNKS_PER_SOURCE = 20_000;
/** Highest sequence number accepted. */
export const MAX_SEQUENCE = 100_000;
/** A chunk may end this much past the duration limit (clock drift). */
export const CAPTURE_LIMIT_GRACE_MS = 2 * MINUTE_MS;

export type CaptureLimits = {
  maxDurationMs: number;
  maxBytes: number;
  maxChunkBytes: number;
  maxChunksPerSource: number;
  maxSequence: number;
};

function boundedInt(raw: unknown, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Limits of a live recording. MEETING_CAPTURE_MAX_MINUTES (1–1440, default
 * 120) and MEETING_CAPTURE_MAX_MB (16–8192 MiB, default 1536) override them.
 */
export function captureLimits(
  env: Record<string, string | undefined> = process.env,
): CaptureLimits {
  return {
    maxDurationMs:
      boundedInt(env.MEETING_CAPTURE_MAX_MINUTES, DEFAULT_MAX_CAPTURE_MINUTES, 1, 24 * 60) *
      MINUTE_MS,
    maxBytes: boundedInt(env.MEETING_CAPTURE_MAX_MB, DEFAULT_MAX_CAPTURE_MIB, 16, 8192) * MIB,
    maxChunkBytes: MAX_CHUNK_BYTES,
    maxChunksPerSource: MAX_CHUNKS_PER_SOURCE,
    maxSequence: MAX_SEQUENCE,
  };
}

/** "4 h", "1 h 30", "45 min": the limit as people read it (French UI). */
export function formatCaptureDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** One chunk as the audio manifest stores it. */
export type ManifestChunk = {
  source?: string;
  sequence?: number;
  startMs?: number;
  durationMs?: number;
  path: string;
  bytes?: number;
  mime?: string;
  sha256?: string;
  /** Appends to the previous sequence of the same source. */
  continuation?: boolean;
};

/** One decodable file to read back: one chunk, or several appended. */
export type CaptureTake = {
  source: string;
  /** First chunk's path (the whole take when it has one part). */
  path: string;
  /** Every chunk path in order, when the take spans several chunks. */
  parts?: string[];
  mime: string;
  sequence: number;
  lastSequence: number;
  startMs: number;
  durationMs: number;
  /** Continuation chunks appended across a missing sequence (lossy). */
  gapped?: boolean;
};

export type CapturePlan = {
  takes: CaptureTake[];
  /** Sequences missing between 0 and the last stored one, per source. */
  missing: Record<string, number[]>;
  /** Continuation chunks with no header before them: not decodable. */
  orphans: Array<{ source: string; sequence: number; path: string }>;
};

function seq(chunk: ManifestChunk) {
  return Number(chunk.sequence ?? 0);
}

/** Sequences absent from [0, max] (bounded list, never a huge array). */
function missingSequences(sequences: number[], limit = 500): number[] {
  if (sequences.length === 0) return [];
  const present = new Set(sequences);
  const max = Math.max(...sequences);
  const missing: number[] = [];
  for (let s = 0; s <= max && missing.length < limit; s++) {
    if (!present.has(s)) missing.push(s);
  }
  return missing;
}

/**
 * The files a recording reads back as, per source in sequence order. A new
 * take starts at every standalone chunk; continuation chunks join the take
 * before them. A continuation after a missing sequence still joins it
 * (`gapped`: the audio between is lost) and one with no standalone chunk
 * before it at all is an orphan: without its header it cannot be decoded.
 */
export function planCapture(chunks: ManifestChunk[]): CapturePlan {
  const bySource = new Map<string, ManifestChunk[]>();
  for (const chunk of chunks ?? []) {
    if (!chunk?.path) continue;
    const source = chunk.source || 'mic';
    bySource.set(source, [...(bySource.get(source) ?? []), chunk]);
  }
  const takes: CaptureTake[] = [];
  const missing: Record<string, number[]> = {};
  const orphans: CapturePlan['orphans'] = [];
  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => seq(a) - seq(b));
    missing[source] = missingSequences(sorted.map(seq));
    let current: (CaptureTake & { parts: string[] }) | null = null;
    let previousSequence: number | null = null;
    for (const chunk of sorted) {
      const sequence = seq(chunk);
      const startMs = Number(chunk.startMs ?? 0);
      const endMs = startMs + Number(chunk.durationMs ?? 0);
      if (chunk.continuation === true) {
        if (!current) {
          orphans.push({ source, sequence, path: chunk.path });
          previousSequence = sequence;
          continue;
        }
        if (previousSequence !== sequence - 1) current.gapped = true;
        current.parts.push(chunk.path);
        current.lastSequence = sequence;
        current.durationMs = Math.max(current.durationMs, endMs - current.startMs);
      } else {
        if (current) takes.push(current);
        current = {
          source,
          path: chunk.path,
          parts: [chunk.path],
          mime: chunk.mime || 'audio/webm',
          sequence,
          lastSequence: sequence,
          startMs,
          durationMs: endMs - startMs,
        };
      }
      previousSequence = sequence;
    }
    if (current) takes.push(current);
  }
  return {
    takes: takes
      .map(({ parts, gapped, ...take }) => ({
        ...take,
        ...(parts.length > 1 ? { parts } : {}),
        ...(gapped ? { gapped: true } : {}),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.source.localeCompare(b.source)),
    missing,
    orphans,
  };
}

export type SourceCaptureState = {
  count: number;
  bytes: number;
  /** -1 when nothing was stored yet. */
  lastSequence: number;
  /** The sequence the recorder sends next for this source. */
  nextSequence: number;
  missingSequences: number[];
  /** End of the stored audio on the meeting timeline. */
  endMs: number;
  takes: number;
  chunks: Array<{
    sequence: number;
    startMs: number;
    durationMs: number;
    bytes: number;
    sha256: string | null;
    continuation: boolean;
  }>;
};

/** What a recorder needs to resume after a reload, per source. */
export function captureState(chunks: ManifestChunk[]): {
  totalBytes: number;
  durationMs: number;
  sources: Record<CaptureSource, SourceCaptureState>;
} {
  const plan = planCapture(chunks);
  const sources = {} as Record<CaptureSource, SourceCaptureState>;
  let totalBytes = 0;
  let durationMs = 0;
  for (const source of CAPTURE_SOURCES) {
    const list = (chunks ?? [])
      .filter((c) => c?.path && (c.source || 'mic') === source)
      .sort((a, b) => seq(a) - seq(b));
    const bytes = list.reduce((n, c) => n + Number(c.bytes ?? 0), 0);
    const endMs = list.reduce(
      (max, c) => Math.max(max, Number(c.startMs ?? 0) + Number(c.durationMs ?? 0)),
      0,
    );
    const lastSequence = list.length ? seq(list[list.length - 1]) : -1;
    totalBytes += bytes;
    durationMs = Math.max(durationMs, endMs);
    sources[source] = {
      count: list.length,
      bytes,
      lastSequence,
      nextSequence: lastSequence + 1,
      missingSequences: plan.missing[source] ?? [],
      endMs,
      takes: plan.takes.filter((t) => t.source === source).length,
      chunks: list.map((c) => ({
        sequence: seq(c),
        startMs: Number(c.startMs ?? 0),
        durationMs: Number(c.durationMs ?? 0),
        bytes: Number(c.bytes ?? 0),
        sha256: typeof c.sha256 === 'string' ? c.sha256 : null,
        continuation: c.continuation === true,
      })),
    };
  }
  return { totalBytes, durationMs, sources };
}

/**
 * What a stop would lose: sequences missing inside what was stored, and
 * the tail a recorder says it sent but the Hub never received.
 */
export function captureGaps(
  chunks: ManifestChunk[],
  expectedLastSequence?: Partial<Record<string, number>>,
): Record<string, number[]> {
  const state = captureState(chunks);
  const gaps: Record<string, number[]> = {};
  for (const source of CAPTURE_SOURCES) {
    const s = state.sources[source];
    const missing = [...s.missingSequences];
    const expected = expectedLastSequence?.[source];
    if (typeof expected === 'number' && Number.isSafeInteger(expected) && expected > s.lastSequence) {
      for (let q = s.lastSequence + 1; q <= expected && missing.length < 500; q++) missing.push(q);
    }
    if (missing.length) gaps[source] = missing;
  }
  return gaps;
}
