/**
 * Moments the recorder marks during a meeting ("Marquer un moment").
 * Stored under `meetings.settings.markers`; pure helpers, unit-tested in
 * meeting-markers.util.spec.ts.
 */

export const MARKER_KINDS = [
  'moment',
  'highlight',
  'concern',
  'followup',
  'compensation',
] as const;

export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface MeetingMarker {
  /** Offset from the start of the recording. */
  atMs: number;
  kind: MarkerKind;
  note?: string;
}

export const MAX_MARKERS = 300;
export const MAX_MARKER_NOTE = 500;
/** Recordings are capped well below a day; anything later is a client bug. */
const MAX_OFFSET_MS = 24 * 60 * 60 * 1000;

/**
 * Keep only well-formed markers, clamp notes, sort by time and drop exact
 * duplicates. Never throws: bad entries are skipped, not rejected, so a
 * single malformed marker cannot lose the others.
 */
export function normalizeMarkers(raw: unknown): MeetingMarker[] {
  if (!Array.isArray(raw)) return [];
  const out: MeetingMarker[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_MARKERS)) {
    if (!item || typeof item !== 'object') continue;
    const { atMs, kind, note } = item as Record<string, unknown>;
    if (typeof atMs !== 'number' || !Number.isFinite(atMs)) continue;
    if (atMs < 0 || atMs > MAX_OFFSET_MS) continue;
    const k = (MARKER_KINDS as readonly string[]).includes(kind as string)
      ? (kind as MarkerKind)
      : 'moment';
    const marker: MeetingMarker = { atMs: Math.round(atMs), kind: k };
    if (typeof note === 'string' && note.trim()) {
      marker.note = note.trim().slice(0, MAX_MARKER_NOTE);
    }
    const key = `${marker.atMs}|${marker.kind}|${marker.note ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(marker);
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
