/**
 * Durable meeting processing: which statuses a queued job may work on,
 * where a retry resumes, when a run counts as stale, and how failures are
 * worded for the people who recorded the meeting.
 * Pure; unit-tested in meeting-processing.util.spec.ts.
 */

/** Statuses in which audio is prepared and transcribed. */
export const TRANSCRIBE_STATUSES: ReadonlySet<string> = new Set([
  'finalizing',
  'normalizing_audio',
  'batch_submitted',
  'batch_processing',
]);

/** Statuses in which the transcript is analysed into outputs. */
export const ANALYZE_STATUSES: ReadonlySet<string> = new Set([
  'analyzing',
  'documents_generating',
  'proposals_generating',
]);

/**
 * Statuses a worker is running through. Recordings in progress
 * (recording, created), uploads waiting for a click (uploaded) and
 * meetings waiting on a human (speakers_pending_review, awaiting_review)
 * are never in this set: recovery leaves them alone.
 */
export const PROCESSING_STATUSES: ReadonlySet<string> = new Set([
  ...TRANSCRIBE_STATUSES,
  'transcribed',
  ...ANALYZE_STATUSES,
]);

/** Statuses a person may ask to retry from. */
export const RETRYABLE_FAILED_STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'partially_failed',
]);

/** No progress event for this long and no live job → the run is stale. */
export const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** One run of the whole pipeline may not take longer than this. */
export const MAX_PIPELINE_RUN_MS = 60 * 60 * 1000;

/** Attempts of one queued run (transient provider/storage errors). */
export const PIPELINE_JOB_ATTEMPTS = 3;

export const PIPELINE_JOB_BACKOFF_MS = 30 * 1000;

export type PipelineStage = 'transcribe' | 'identify' | 'analyze' | 'none';

/** What a queued job does for the meeting's current status. */
export function stageForStatus(status: string | null | undefined): PipelineStage {
  if (!status) return 'none';
  if (TRANSCRIBE_STATUSES.has(status)) return 'transcribe';
  if (status === 'transcribed') return 'identify';
  if (ANALYZE_STATUSES.has(status)) return 'analyze';
  return 'none';
}

/**
 * Where a retry restarts so that nothing already obtained is redone:
 * audio never transcribed → transcription; a first transcript whose voices
 * were never checked → speaker identification (which may pause for the
 * human review); otherwise → analysis of the latest transcript.
 */
export function resumeStatus(input: {
  hasTranscript: boolean;
  latestTranscriptVersion: number;
  /** Status the meeting was in when the run stopped (from the timeline). */
  interruptedAt: string | null | undefined;
}): 'normalizing_audio' | 'transcribed' | 'analyzing' {
  if (!input.hasTranscript) return 'normalizing_audio';
  const stoppedEarly =
    !input.interruptedAt ||
    TRANSCRIBE_STATUSES.has(input.interruptedAt) ||
    input.interruptedAt === 'transcribed';
  if (input.latestTranscriptVersion <= 1 && stoppedEarly) return 'transcribed';
  return 'analyzing';
}

export function isStale(
  lastActivityAt: Date | string | null | undefined,
  now: number = Date.now(),
  staleMs: number = STALE_PROCESSING_MS,
): boolean {
  if (!lastActivityAt) return true;
  const t = new Date(lastActivityAt).getTime();
  return !Number.isFinite(t) || now - t > staleMs;
}

/** Stable BullMQ job id: one live pipeline run per meeting. BullMQ refuses
 *  ":" in custom ids. */
export function pipelineJobId(meetingId: string): string {
  return `meeting-pipeline-${meetingId}`;
}

/**
 * A failure retrying cannot fix (no audio, nothing said, deleted meeting,
 * missing consent). The job ends at once instead of burning attempts.
 */
export class PermanentPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentPipelineError';
  }
}

/**
 * This run no longer holds the meeting's fencing token (a newer run, a
 * person's retry, the stalled-run sweep or a deletion took over). Its
 * results are discarded; it never retries and never records a failure.
 */
export class StaleRunError extends Error {
  constructor(reason: string) {
    super(`Superseded processing run: ${reason}`);
    this.name = 'StaleRunError';
  }
}

export class PipelineTimeoutError extends Error {
  constructor() {
    super('Le traitement a dépassé la durée maximale autorisée.');
    this.name = 'PipelineTimeoutError';
  }
}

/** HTTP statuses that say "try again later", never "this cannot work". */
const TRANSIENT_STATUSES = new Set([408, 409, 425, 429]);

/** The HTTP status carried by a Nest, AI SDK, fetch or axios error. */
function statusOf(err: unknown): number | null {
  const e = err as {
    getStatus?: () => number;
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  } | null;
  const candidates = [
    typeof e?.getStatus === 'function' ? e.getStatus() : undefined,
    e?.statusCode,
    e?.status,
    e?.response?.status,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isInteger(c)) return c;
  }
  return null;
}

/**
 * Retrying cannot fix it: bad input, missing audio or consent, a deleted
 * meeting, a refused credential. Rate limits (429), timeouts (408),
 * provider errors (5xx) and network failures stay retryable — the bounded
 * BullMQ attempts still apply.
 */
export function isPermanentPipelineError(err: unknown): boolean {
  if (err instanceof PermanentPipelineError) return true;
  if (err instanceof PipelineTimeoutError || err instanceof StaleRunError) {
    return false;
  }
  // The AI SDK says explicitly whether a provider error is worth retrying.
  const retryable = (err as { isRetryable?: unknown } | null)?.isRetryable;
  if (retryable === true) return false;
  const status = statusOf(err);
  if (status === null) return false; // network / unknown: transient
  if (TRANSIENT_STATUSES.has(status) || status >= 500) return false;
  return status >= 400 && status < 500;
}

export const STALE_FAILURE_MESSAGE =
  'Le traitement s’est interrompu (redémarrage du service ou délai dépassé). L’audio est conservé : relancez le traitement.';

/** The reason stored on the meeting, in French, with the technical cause. */
export function failureReasonFor(err: unknown, finalAttempt: boolean): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim();
  const detail = raw ? ` Détail : ${raw}` : '';
  if (err instanceof PipelineTimeoutError) {
    return `${STALE_FAILURE_MESSAGE}${detail}`.slice(0, 500);
  }
  if (isPermanentPipelineError(err)) return (raw || 'Traitement impossible.').slice(0, 500);
  return (
    (finalAttempt
      ? 'Le traitement a échoué après plusieurs tentatives. L’audio est conservé : relancez le traitement.'
      : 'Le traitement a échoué.') + detail
  ).slice(0, 500);
}

export async function withTimeout<T>(
  run: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PipelineTimeoutError()), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
