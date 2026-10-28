import type { TranscriptSegment } from './meeting-transcript.util';

/**
 * Without headphones the microphone also hears the call through the
 * speakers, and the browser's echo cancellation only removes what the
 * browser itself plays (not the Teams or Zoom app). Each remote sentence
 * then reaches the transcript twice: once from the shared meeting audio,
 * once from the microphone. The meeting-audio copy is the clean one; the
 * microphone copy is dropped when it repeats, in order, words spoken in
 * the meeting audio at the same time. The audio files are never changed.
 * Pure; unit-tested in meeting-echo.util.spec.ts.
 */

/** Timing slack between the two channels (sentence timings may be estimated). */
const WINDOW_MS = 4_000;
/** Tighter slack for very short lines ("oui", "d'accord"). */
const SHORT_WINDOW_MS = 1_500;
/** Below this many words a line must be repeated in full. */
const SHORT_WORDS = 4;
/** Share of the microphone line's words found, in order, in the meeting audio. */
const MIN_SHARED = 0.6;

function words(text: string): string[] {
  return (
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Length of the longest common subsequence of two word lists. */
function sharedInOrder(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      row[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[b.length];
}

export interface EchoResult {
  kept: TranscriptSegment[];
  /** Microphone lines recognised as the call heard through the speakers. */
  dropped: TranscriptSegment[];
}

export function dropChannelEchoes(segments: TranscriptSegment[]): EchoResult {
  const system = segments
    .filter((s) => s.channel === 'system')
    .map((s) => ({ s, words: words(s.rawText ?? s.text) }))
    .sort((a, b) => a.s.startMs - b.s.startMs);
  if (system.length === 0) return { kept: segments, dropped: [] };

  const dropped = new Set<TranscriptSegment>();
  for (const mic of segments) {
    if (mic.channel !== 'mic') continue;
    const said = words(mic.rawText ?? mic.text);
    if (said.length === 0) continue;
    const short = said.length < SHORT_WORDS;
    const slack = short ? SHORT_WINDOW_MS : WINDOW_MS;
    const heard = system
      .filter(
        ({ s }) =>
          s.startMs <= mic.endMs + slack && s.endMs >= mic.startMs - slack,
      )
      .flatMap((x) => x.words);
    const shared = sharedInOrder(said, heard);
    if (short ? shared === said.length : shared / said.length >= MIN_SHARED) {
      dropped.add(mic);
    }
  }
  if (dropped.size === 0) return { kept: segments, dropped: [] };
  return {
    kept: segments.filter((s) => !dropped.has(s)),
    dropped: segments.filter((s) => dropped.has(s)),
  };
}
