import { ConflictException } from '@nestjs/common';

/**
 * Meeting pipeline state machine (CONQR_MEETING_STATE_MACHINES.md).
 * Pure transition table — persistence and side effects live in
 * MeetingPipelineService, which executes transitions with a conditional
 * `WHERE status = :from` update so concurrent workers cannot double-fire.
 */
export type MeetingPipelineStatus =
  | 'created'
  | 'recording'
  | 'stopping'
  | 'completed'
  | 'uploading'
  | 'uploaded'
  | 'normalizing_audio'
  | 'batch_submitted'
  | 'batch_processing'
  | 'transcribed'
  | 'speakers_pending_review'
  | 'analyzing'
  | 'documents_generating'
  | 'proposals_generating'
  | 'awaiting_review'
  | 'published'
  | 'partially_failed'
  | 'failed'
  | 'archived'
  | 'deletion_pending'
  | 'deleted';

const PROCESSING_STATES: MeetingPipelineStatus[] = [
  'normalizing_audio',
  'batch_submitted',
  'batch_processing',
  'transcribed',
  'analyzing',
  'documents_generating',
  'proposals_generating',
];

/** States from which the batch pipeline may be (re)started. */
export const PIPELINE_ENTRY_STATES: MeetingPipelineStatus[] = [
  'completed',
  'uploaded',
  'partially_failed',
];

/** States in which analysis may be re-run without re-transcription. */
export const REANALYZE_STATES: MeetingPipelineStatus[] = [
  'transcribed',
  'speakers_pending_review',
  'awaiting_review',
  'published',
  'partially_failed',
];

const TRANSITIONS: Record<MeetingPipelineStatus, MeetingPipelineStatus[]> = {
  created: ['uploading', 'failed', 'deletion_pending'],
  recording: ['stopping', 'failed', 'deletion_pending'],
  stopping: ['completed', 'failed'],
  completed: ['normalizing_audio', 'archived', 'deletion_pending'],
  uploading: ['uploaded', 'failed', 'deletion_pending'],
  uploaded: ['normalizing_audio', 'archived', 'deletion_pending'],
  normalizing_audio: ['batch_submitted', 'partially_failed', 'failed'],
  batch_submitted: ['batch_processing', 'partially_failed'],
  batch_processing: ['transcribed', 'partially_failed'],
  transcribed: ['speakers_pending_review', 'analyzing', 'partially_failed'],
  speakers_pending_review: ['analyzing', 'deletion_pending'],
  analyzing: ['documents_generating', 'partially_failed'],
  documents_generating: ['proposals_generating', 'partially_failed'],
  proposals_generating: ['awaiting_review', 'partially_failed'],
  awaiting_review: [
    'published',
    'analyzing',
    'archived',
    'deletion_pending',
  ],
  published: ['analyzing', 'archived', 'deletion_pending'],
  partially_failed: [
    'normalizing_audio',
    'batch_submitted',
    'analyzing',
    'archived',
    'deletion_pending',
  ],
  failed: ['deletion_pending'],
  archived: ['deletion_pending'],
  deletion_pending: ['deleted'],
  deleted: [],
};

export function canTransition(
  from: MeetingPipelineStatus,
  to: MeetingPipelineStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: MeetingPipelineStatus,
  to: MeetingPipelineStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `Invalid meeting transition: ${from} -> ${to}`,
    );
  }
}

export function isProcessingState(status: MeetingPipelineStatus): boolean {
  return PROCESSING_STATES.includes(status);
}
