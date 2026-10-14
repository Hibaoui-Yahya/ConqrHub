/**
 * Markdown for the pages a meeting is published as in Hub ("Publier dans
 * Hub"): a meeting page (summary, next steps) and a timestamped transcript
 * page. Pure; unit-tested in meeting-publish.util.spec.ts.
 */
import type { MeetingMarker } from './meeting-markers.util';

export interface PublishSegment {
  speaker: string;
  startMs: number;
  text: string;
}

export interface PublishSpeaker {
  displayName?: string | null;
}

const MARKER_LABELS: Record<string, string> = {
  moment: 'Moment',
  highlight: 'Point fort',
  concern: 'Vigilance',
  followup: 'À creuser',
  compensation: 'Rémunération',
};

export function formatStamp(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Turns grouped by consecutive speaker, each with its start time. */
export function buildTranscriptMarkdown(
  segments: PublishSegment[],
  speakers: Record<string, PublishSpeaker>,
  markers: MeetingMarker[] = [],
): string {
  const lines: string[] = [];
  if (markers.length > 0) {
    lines.push('## Moments marqués', '');
    for (const m of markers) {
      const label = MARKER_LABELS[m.kind] ?? 'Moment';
      lines.push(`- **${formatStamp(m.atMs)}** · ${label}${m.note ? ` — ${m.note}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Transcription', '');
  let last: string | null = null;
  let buffer: string[] = [];
  let start = 0;
  const flush = () => {
    if (last === null || buffer.length === 0) return;
    const name = speakers[last]?.displayName?.trim() || last;
    lines.push(`**${name}** · ${formatStamp(start)}`, '', buffer.join(' '), '');
    buffer = [];
  };
  for (const seg of segments) {
    const text = (seg.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (seg.speaker !== last) {
      flush();
      last = seg.speaker;
      start = seg.startMs;
    }
    buffer.push(text);
  }
  flush();
  if (last === null) lines.push('_Aucun contenu transcrit._', '');
  return lines.join('\n').trimEnd() + '\n';
}

/** The meeting page: date line, then the AI summary and next steps. */
export function buildMeetingPageMarkdown(input: {
  startedAt: Date | string | null;
  durationMs: number | null;
  summary?: string | null;
  nextSteps?: string | null;
  /** Validated competency evaluation, already rendered as Markdown. */
  evaluationMarkdown?: string | null;
}): string {
  const lines: string[] = [];
  const date = input.startedAt ? new Date(input.startedAt) : null;
  const when =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Toronto' })
      : null;
  const minutes = input.durationMs ? Math.round(input.durationMs / 60000) : null;
  const meta = [when, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ');
  if (meta) lines.push(`_Réunion du ${meta} · publiée depuis ConqrMeet._`, '');
  if (input.summary?.trim()) lines.push('## Résumé', '', input.summary.trim(), '');
  if (input.nextSteps?.trim()) lines.push('## Prochaines étapes', '', input.nextSteps.trim(), '');
  if (input.evaluationMarkdown?.trim()) lines.push(input.evaluationMarkdown.trim(), '');
  lines.push('Le rapport et la transcription sont dans les pages ci-dessous.');
  return lines.join('\n') + '\n';
}

/**
 * What a re-publication does with a page it made earlier:
 * - "create"  the page is gone (never made, or deleted in Hub);
 * - "update"  nobody touched it since the last sync, so it is refreshed;
 * - "keep"    someone edited it in Hub after the last sync — never overwrite.
 * The grace window covers the collaborative save of our own write, which
 * lands a few seconds after the sync is recorded.
 */
export type SyncDecision = 'create' | 'update' | 'keep';

export const SYNC_GRACE_MS = 2 * 60 * 1000;

export function syncDecision(
  page: { updatedAt: Date | string; deletedAt?: Date | string | null } | null | undefined,
  lastSyncedAt: Date | string | null | undefined,
): SyncDecision {
  if (!page || page.deletedAt) return 'create';
  if (!lastSyncedAt) return 'keep';
  const edited = new Date(page.updatedAt).getTime();
  const synced = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(edited) || !Number.isFinite(synced)) return 'keep';
  return edited <= synced + SYNC_GRACE_MS ? 'update' : 'keep';
}
