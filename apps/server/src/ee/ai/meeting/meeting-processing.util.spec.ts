import {
  BadRequestException,
  HttpException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import {
  failureReasonFor,
  isPermanentPipelineError,
  isStale,
  PermanentPipelineError,
  PipelineTimeoutError,
  pipelineJobId,
  StaleRunError,
  PROCESSING_STATUSES,
  resumeStatus,
  stageForStatus,
  STALE_PROCESSING_MS,
  withTimeout,
} from './meeting-processing.util';
import { canEditMeeting, isMeetingId } from './meeting-access.util';

describe('pipeline stages and recovery scope (LTC-01)', () => {
  it('maps every processing status to its stage and leaves human / recording states alone', () => {
    expect(stageForStatus('finalizing')).toBe('transcribe');
    expect(stageForStatus('normalizing_audio')).toBe('transcribe');
    expect(stageForStatus('transcribed')).toBe('identify');
    expect(stageForStatus('documents_generating')).toBe('analyze');
    for (const s of ['recording', 'created', 'uploaded', 'speakers_pending_review', 'awaiting_review', 'completed', 'published', 'failed', null]) {
      expect(stageForStatus(s)).toBe('none');
      expect(PROCESSING_STATUSES.has(String(s))).toBe(false);
    }
  });

  it('resumes after what was already obtained', () => {
    expect(resumeStatus({ hasTranscript: false, latestTranscriptVersion: 0, interruptedAt: 'analyzing' })).toBe('normalizing_audio');
    expect(resumeStatus({ hasTranscript: true, latestTranscriptVersion: 1, interruptedAt: 'normalizing_audio' })).toBe('transcribed');
    expect(resumeStatus({ hasTranscript: true, latestTranscriptVersion: 1, interruptedAt: null })).toBe('transcribed');
    expect(resumeStatus({ hasTranscript: true, latestTranscriptVersion: 1, interruptedAt: 'documents_generating' })).toBe('analyzing');
    // Speakers already confirmed by a person: never ask again.
    expect(resumeStatus({ hasTranscript: true, latestTranscriptVersion: 2, interruptedAt: 'normalizing_audio' })).toBe('analyzing');
  });

  it('calls a run stale only after the threshold', () => {
    const now = Date.parse('2026-10-13T15:20:00Z');
    expect(isStale('2026-10-13T12:07:35.422Z', now)).toBe(true); // the audited meeting
    expect(isStale(new Date(now - STALE_PROCESSING_MS + 1000), now)).toBe(false);
    expect(isStale(null, now)).toBe(true);
    expect(pipelineJobId('01a13526-6226-74b8-b690-5dd5ccc45ce8')).not.toContain(':');
  });

  it('separates permanent failures from transient ones and words them in French', () => {
    expect(isPermanentPipelineError(new PermanentPipelineError('x'))).toBe(true);
    expect(isPermanentPipelineError(new NotFoundException())).toBe(true);
    expect(isPermanentPipelineError(new BadRequestException())).toBe(true);
    expect(isPermanentPipelineError(new Error('ECONNRESET'))).toBe(false);
    expect(isPermanentPipelineError(new PipelineTimeoutError())).toBe(false);
    expect(isPermanentPipelineError(new StaleRunError('x'))).toBe(false);
  });

  it('keeps rate limits, timeouts and provider outages retryable (bounded by BullMQ attempts)', () => {
    const withStatus = (key: string, status: number) => Object.assign(new Error(`HTTP ${status}`), { [key]: status });
    // Nest exceptions raised by shared helpers.
    expect(isPermanentPipelineError(new RequestTimeoutException())).toBe(false); // 408
    expect(isPermanentPipelineError(new HttpException('slow down', 429))).toBe(false);
    // AI SDK APICallError (statusCode, isRetryable), fetch/axios errors.
    expect(isPermanentPipelineError(withStatus('statusCode', 429))).toBe(false);
    expect(isPermanentPipelineError(withStatus('status', 503))).toBe(false);
    expect(isPermanentPipelineError(withStatus('status', 425))).toBe(false);
    expect(isPermanentPipelineError(Object.assign(new Error('x'), { response: { status: 502 } }))).toBe(false);
    expect(isPermanentPipelineError(Object.assign(new Error('x'), { statusCode: 400, isRetryable: true }))).toBe(false);
    // Bad input, refused credential, unsupported media: retrying cannot help.
    expect(isPermanentPipelineError(withStatus('statusCode', 400))).toBe(true);
    expect(isPermanentPipelineError(withStatus('statusCode', 401))).toBe(true);
    expect(isPermanentPipelineError(withStatus('status', 415))).toBe(true);
    expect(failureReasonFor(new Error('503'), true)).toBe(
      'Le traitement a échoué après plusieurs tentatives. L’audio est conservé : relancez le traitement. Détail : 503',
    );
    expect(failureReasonFor(new PermanentPipelineError('Aucun audio.'), true)).toBe('Aucun audio.');
    expect(failureReasonFor(new PipelineTimeoutError(), true)).toContain('relancez le traitement');
    expect(failureReasonFor(new Error('x'.repeat(900)), true).length).toBeLessThanOrEqual(500);
  });

  it('bounds a hung run', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toBeInstanceOf(PipelineTimeoutError);
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});

describe('meeting edit rule (LTC-03)', () => {
  const meeting = { userId: 'creator', workspaceId: 'w1' };
  it('allows the creator and Owners/Admins of the same workspace only', () => {
    expect(canEditMeeting(meeting, { id: 'creator', role: 'member', workspaceId: 'w1' })).toBe(true);
    expect(canEditMeeting(meeting, { id: 'x', role: 'admin', workspaceId: 'w1' })).toBe(true);
    expect(canEditMeeting(meeting, { id: 'x', role: 'owner', workspaceId: 'w1' })).toBe(true);
    expect(canEditMeeting(meeting, { id: 'x', role: 'member', workspaceId: 'w1' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'x', role: null, workspaceId: 'w1' })).toBe(false);
    // Never across workspaces, even for an owner or the same user id.
    expect(canEditMeeting(meeting, { id: 'x', role: 'owner', workspaceId: 'w2' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'creator', role: 'member', workspaceId: 'w2' })).toBe(false);
  });
  it('only accepts uuid meeting ids', () => {
    expect(isMeetingId('01a13526-6226-74b8-b690-5dd5ccc45ce8')).toBe(true);
    expect(isMeetingId("1' or '1'='1")).toBe(false);
    expect(isMeetingId(undefined)).toBe(false);
  });
});
