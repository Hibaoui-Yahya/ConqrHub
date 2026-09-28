import { randomUUID } from 'node:crypto';
import type { DiarizedSegment } from '../stt/stt.service';

export type TranscriptSegment = {
  id: string;
  speaker: string;
  channel: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
};

export type TranscriptSpeaker = {
  label: string;
  displayName: string | null;
  userId: string | null;
  confidence: number | null;
};

type SourceInfo = {
  channel: string | null;
  startMs: number;
  durationMs: number;
};

/** Merge consecutive same-speaker segments up to this many characters. */
const MAX_PARAGRAPH_CHARS = 400;
/** ...as long as the pause between them stays under this. */
const MAX_MERGE_GAP_MS = 2_000;

/**
 * Speaker label for a diarized speaker of one audio source.
 *
 * - single stream: "Speaker 1", "Speaker 2", …
 * - mic + system: the mic is the recording user ("Me"; "Me 2"… if several
 *   people share the mic), the shared tab/system audio is "Participant N".
 */
function speakerLabel(
  index: number,
  channel: string | null,
  multiChannel: boolean,
  speakersInSource: number,
): string {
  if (!multiChannel) return `Speaker ${index + 1}`;
  if (channel === 'system') return `Participant ${index + 1}`;
  return speakersInSource > 1 ? `Me ${index + 1}` : 'Me';
}

/**
 * Turn one source's diarized STT output into transcript segments. Speakers
 * are numbered by first appearance. Falls back to paragraph-splitting the
 * plain text (single speaker, estimated timings) when the provider returned
 * no timed segments.
 */
export function buildSourceSegments(
  result: { text: string; segments: DiarizedSegment[] },
  src: SourceInfo,
  multiChannel: boolean,
): { segments: TranscriptSegment[]; speakers: string[] } {
  if (result.segments.length === 0) {
    const text = result.text.trim();
    if (!text) return { segments: [], speakers: [] };
    const label = speakerLabel(0, src.channel, multiChannel, 1);
    return {
      segments: splitIntoSegments(text, { ...src, speaker: label }),
      speakers: [label],
    };
  }

  const order: string[] = [];
  for (const seg of result.segments) {
    const id = seg.speakerId ?? 'unknown';
    if (!order.includes(id)) order.push(id);
  }
  const labels = new Map(
    order.map((id, i) => [
      id,
      speakerLabel(i, src.channel, multiChannel, order.length),
    ]),
  );

  const segments: TranscriptSegment[] = [];
  for (const seg of result.segments) {
    const speaker = labels.get(seg.speakerId ?? 'unknown')!;
    const startMs = src.startMs + seg.startMs;
    const endMs = src.startMs + Math.max(seg.endMs, seg.startMs);
    const last = segments[segments.length - 1];
    if (
      last &&
      last.speaker === speaker &&
      startMs - last.endMs <= MAX_MERGE_GAP_MS &&
      last.text.length + seg.text.length <= MAX_PARAGRAPH_CHARS
    ) {
      last.text = `${last.text} ${seg.text}`;
      last.endMs = endMs;
      continue;
    }
    segments.push({
      id: randomUUID(),
      speaker,
      channel: src.channel,
      startMs,
      endMs,
      text: seg.text,
      confidence: null,
    });
  }

  return { segments, speakers: [...labels.values()] };
}

/**
 * Break a plain transcript into readable paragraph segments (a few
 * sentences each). Without word timings, start/end are estimated
 * proportionally to the character offset within the source.
 */
export function splitIntoSegments(
  text: string,
  src: SourceInfo & { speaker: string },
): TranscriptSegment[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)
    ?.map((x) => x.trim())
    .filter(Boolean) ?? [text];

  const paragraphs: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_PARAGRAPH_CHARS) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) paragraphs.push(current);

  const totalChars = paragraphs.reduce((n, p) => n + p.length, 0) || 1;
  let offset = 0;
  return paragraphs.map((para) => {
    const startMs =
      src.startMs + Math.round((offset / totalChars) * src.durationMs);
    offset += para.length;
    const endMs =
      src.startMs + Math.round((offset / totalChars) * src.durationMs);
    return {
      id: randomUUID(),
      speaker: src.speaker,
      channel: src.channel,
      startMs,
      endMs,
      text: para,
      confidence: null,
    };
  });
}

/**
 * Plain-text rendering of a transcript for the analysis prompt and the
 * "Copy transcript" field. Speaker turns are prefixed with the speaker's
 * name once there is more than one speaker.
 */
export function transcriptToText(
  segments: Array<{ speaker?: unknown; text?: unknown }>,
  speakers: Record<string, { displayName?: string | null } | undefined> = {},
): string {
  const labels = new Set(segments.map((s) => String(s.speaker ?? '')));
  const named = labels.size > 1;
  const turns: string[] = [];
  let lastSpeaker: string | null = null;
  for (const seg of segments) {
    const text = String(seg.text ?? '').trim();
    if (!text) continue;
    const label = String(seg.speaker ?? '');
    if (named && label === lastSpeaker) {
      turns[turns.length - 1] += ` ${text}`;
      continue;
    }
    const name = speakers[label]?.displayName || label;
    turns.push(named ? `${name}: ${text}` : text);
    lastSpeaker = label;
  }
  return turns.join('\n\n');
}
