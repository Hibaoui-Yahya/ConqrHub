/**
 * Filters of GET /ai/meeting (MEET_CONTRACT.md §4). Pure; unit-tested in
 * meeting-list.util.spec.ts. Filters only ever narrow the list: who may
 * read which meeting is decided elsewhere (company-wide read, LTC-03).
 */

/** Every value of the meeting_status enum. */
export const MEETING_STATUSES = [
  'analyzing',
  'archived',
  'awaiting_review',
  'batch_processing',
  'batch_submitted',
  'completed',
  'created',
  'deleted',
  'deletion_pending',
  'documents_generating',
  'failed',
  'finalizing',
  'normalizing_audio',
  'partially_failed',
  'proposals_generating',
  'published',
  'recording',
  'speakers_pending_review',
  'stopping',
  'transcribed',
  'uploaded',
  'uploading',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Comma list → distinct trimmed values (at most `max`). */
export function splitList(value: string | undefined, max = 20): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))].slice(0, max);
}

/** Status filter values, or the first unknown one. */
export function parseStatuses(value: string | undefined):
  | { ok: true; statuses: string[] }
  | { ok: false; unknown: string } {
  const statuses = splitList(value);
  const unknown = statuses.find((s) => !(MEETING_STATUSES as readonly string[]).includes(s));
  return unknown ? { ok: false, unknown } : { ok: true, statuses };
}

/**
 * The startedAt range: `from` is inclusive, `to` is inclusive — a bare date
 * covers its whole UTC day (`to=2026-10-16` keeps meetings started that
 * day). Null bounds are open. Invalid → null.
 */
export function dateRange(from?: string, to?: string): {
  from: Date | null;
  /** Exclusive upper bound. */
  toExclusive: Date | null;
  invalid: boolean;
} {
  const parse = (v: string) => {
    const d = new Date(DATE_ONLY.test(v) ? `${v}T00:00:00.000Z` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const start = from ? parse(from) : null;
  let end: Date | null = null;
  if (to) {
    const parsed = parse(to);
    end = parsed
      ? DATE_ONLY.test(to)
        ? new Date(parsed.getTime() + DAY_MS)
        : new Date(parsed.getTime() + 1)
      : null;
  }
  const invalid =
    (!!from && !start) || (!!to && !end) || (!!start && !!end && start.getTime() >= end.getTime());
  return { from: start, toExclusive: end, invalid };
}
