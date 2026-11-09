/**
 * Markdown for the pages a meeting is published as in Hub ("Publier dans
 * Hub"): a meeting page (summary, next steps) and a timestamped transcript
 * page. Pure; unit-tested in meeting-publish.util.spec.ts.
 */
import type { MeetingMarker } from './meeting-markers.util';
import { formatMeetingDateTime, resolveTimeZone } from './meeting-locale.util';
import { pick, type UiLanguage } from '../../../common/i18n/ui-language';

export interface PublishSegment {
  speaker: string;
  startMs: number;
  text: string;
}

export interface PublishSpeaker {
  displayName?: string | null;
}

/**
 * Fixed wording of the published pages, in the meeting's report language
 * (the language the AI wrote the summary in), so a page never mixes French
 * headings with an English summary. French is the default: it is what every
 * page published so far says.
 */
const MARKER_LABELS: Record<UiLanguage, Record<string, string>> = {
  fr: {
    moment: 'Moment',
    highlight: 'Point fort',
    concern: 'Vigilance',
    followup: 'À creuser',
    compensation: 'Rémunération',
  },
  en: {
    moment: 'Moment',
    highlight: 'Highlight',
    concern: 'Concern',
    followup: 'Follow up',
    compensation: 'Compensation',
  },
};

const PAGE_TEXT = {
  markedMoments: { fr: 'Moments marqués', en: 'Marked moments' },
  transcript: { fr: 'Transcription', en: 'Transcript' },
  nothingTranscribed: { fr: 'Aucun contenu transcrit.', en: 'Nothing was transcribed.' },
  meetingOf: {
    fr: (meta: string) => `Réunion du ${meta} · publiée depuis ConqrMeet.`,
    en: (meta: string) => `Meeting of ${meta} · published from ConqrMeet.`,
  },
  summary: { fr: 'Résumé', en: 'Summary' },
  nextSteps: { fr: 'Prochaines étapes', en: 'Next steps' },
  below: {
    fr: 'Le rapport et la transcription sont dans les pages ci-dessous.',
    en: 'The report and the transcript are in the pages below.',
  },
  transcriptTitle: {
    fr: (title: string) => `Transcription — ${title}`,
    en: (title: string) => `Transcript — ${title}`,
  },
} as const;

/** Title of the transcript page published under the meeting page. */
export function transcriptPageTitle(meetingTitle: string, lang: UiLanguage = 'fr'): string {
  return pick(PAGE_TEXT.transcriptTitle, lang)(meetingTitle);
}

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
  lang: UiLanguage = 'fr',
): string {
  const lines: string[] = [];
  if (markers.length > 0) {
    lines.push(`## ${pick(PAGE_TEXT.markedMoments, lang)}`, '');
    for (const m of markers) {
      const label = MARKER_LABELS[lang][m.kind] ?? 'Moment';
      lines.push(`- **${formatStamp(m.atMs)}** · ${label}${m.note ? ` — ${m.note}` : ''}`);
    }
    lines.push('');
  }
  lines.push(`## ${pick(PAGE_TEXT.transcript, lang)}`, '');
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
  if (last === null) lines.push(`_${pick(PAGE_TEXT.nothingTranscribed, lang)}_`, '');
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
  /** IANA zone of the dates (the company's, LTC-05). The page names the
   *  zone, so the time is never ambiguous for a reader elsewhere. */
  timeZone?: string;
  /** Language of the page's own wording and date (default French). */
  lang?: UiLanguage;
}): string {
  const lang = input.lang ?? 'fr';
  const lines: string[] = [];
  const when = formatMeetingDateTime(
    input.startedAt,
    resolveTimeZone([input.timeZone]),
    lang,
  );
  const minutes = input.durationMs ? Math.round(input.durationMs / 60000) : null;
  const meta = [when, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ');
  if (meta) lines.push(`_${pick(PAGE_TEXT.meetingOf, lang)(meta)}_`, '');
  if (input.summary?.trim())
    lines.push(`## ${pick(PAGE_TEXT.summary, lang)}`, '', input.summary.trim(), '');
  if (input.nextSteps?.trim())
    lines.push(`## ${pick(PAGE_TEXT.nextSteps, lang)}`, '', input.nextSteps.trim(), '');
  if (input.evaluationMarkdown?.trim()) lines.push(input.evaluationMarkdown.trim(), '');
  lines.push(pick(PAGE_TEXT.below, lang));
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
