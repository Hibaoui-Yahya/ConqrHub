import {
  assertTransition,
  canTransition,
  MeetingPipelineStatus,
  PIPELINE_ENTRY_STATES,
} from './meeting-state.machine';

describe('meeting state machine', () => {
  it('allows the happy-path pipeline sequence', () => {
    const path: MeetingPipelineStatus[] = [
      'uploaded',
      'normalizing_audio',
      'batch_submitted',
      'batch_processing',
      'transcribed',
      'analyzing',
      'documents_generating',
      'proposals_generating',
      'awaiting_review',
      'published',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('allows the live-capture path into the pipeline', () => {
    expect(canTransition('recording', 'stopping')).toBe(true);
    expect(canTransition('stopping', 'completed')).toBe(true);
    expect(canTransition('completed', 'normalizing_audio')).toBe(true);
  });

  it('routes low-confidence diarization through speaker review', () => {
    expect(canTransition('transcribed', 'speakers_pending_review')).toBe(true);
    expect(canTransition('speakers_pending_review', 'analyzing')).toBe(true);
  });

  it('rejects skipping pipeline steps', () => {
    expect(canTransition('uploaded', 'batch_processing')).toBe(false);
    expect(canTransition('normalizing_audio', 'transcribed')).toBe(false);
    expect(canTransition('recording', 'published')).toBe(false);
    expect(canTransition('awaiting_review', 'batch_submitted')).toBe(false);
  });

  it('never resurrects deleted meetings', () => {
    expect(canTransition('deleted', 'created')).toBe(false);
    expect(canTransition('deleted', 'analyzing')).toBe(false);
    expect(canTransition('deleted', 'deletion_pending')).toBe(false);
  });

  it('supports retry re-entry from partially_failed', () => {
    for (const to of ['normalizing_audio', 'batch_submitted', 'analyzing']) {
      expect(
        canTransition('partially_failed', to as MeetingPipelineStatus),
      ).toBe(true);
    }
    expect(PIPELINE_ENTRY_STATES).toContain('partially_failed');
  });

  it('allows re-analysis after publication (type change, D4)', () => {
    expect(canTransition('published', 'analyzing')).toBe(true);
  });

  it('gates deletion through deletion_pending', () => {
    expect(canTransition('published', 'deletion_pending')).toBe(true);
    expect(canTransition('deletion_pending', 'deleted')).toBe(true);
    expect(canTransition('published', 'deleted')).toBe(false);
  });

  it('assertTransition throws ConflictException for invalid moves', () => {
    expect(() => assertTransition('uploaded', 'published')).toThrow(
      'Invalid meeting transition: uploaded -> published',
    );
    expect(() => assertTransition('completed', 'normalizing_audio')).not.toThrow();
  });

  it('treats unknown/legacy statuses as non-transitionable', () => {
    expect(
      canTransition('finalizing' as MeetingPipelineStatus, 'deletion_pending'),
    ).toBe(false);
  });
});
