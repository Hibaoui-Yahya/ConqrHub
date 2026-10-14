import {
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Interval } from '@nestjs/schedule';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { MeetingService } from './meeting.service';

interface MeetingPipelinePayload {
  meetingId: string;
  reason?: string;
}

const RECOVERY_SWEEP_MS = 5 * 60 * 1000;

/**
 * Worker of the durable meeting pipeline (LTC-01). BullMQ keeps the job in
 * Redis: a transient failure is retried with backoff, and a run cut short by
 * a restart or a crash becomes a stalled job that a live worker picks up
 * again. The service resumes from the meeting's status, so a resumed run
 * neither re-transcribes nor duplicates outputs.
 *
 * Every few minutes it also sweeps meetings stuck in a processing status
 * with no live job (runs lost before this release) and marks them
 * interrupted, so a person can resume them from ConqrMeet — unless the
 * meeting holds a person's request that was never queued, which is queued.
 */
@Processor(QueueName.MEETING_QUEUE, {
  concurrency: 2,
  // A long transcription keeps renewing this lock; only a dead process lets
  // it expire, which is what makes the job "stalled" and resumable.
  lockDuration: 2 * 60 * 1000,
  stalledInterval: 60 * 1000,
  maxStalledCount: 2,
})
export class MeetingPipelineProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MeetingPipelineProcessor.name);
  private bootstrapSweep: NodeJS.Timeout | null = null;

  constructor(private readonly meetings: MeetingService) {
    super();
  }

  async process(job: Job<MeetingPipelinePayload>) {
    if (job.name !== QueueJob.MEETING_PIPELINE) return;
    const meetingId = job.data?.meetingId;
    if (typeof meetingId !== 'string') return;
    return this.meetings.runPipelineJob(meetingId, {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
      reason: job.data.reason,
    });
  }

  /**
   * A job has left BullMQ (moved to completed or failed, so its stable job
   * id is free again). A person's request that arrived while it was still
   * active could not be queued then: it is queued now, once (see
   * MeetingService.continueRequestedRun). A failed attempt that BullMQ
   * retries keeps a live job, so nothing is queued twice.
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<MeetingPipelinePayload>) {
    return this.continueAfter(job);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MeetingPipelinePayload> | undefined) {
    return this.continueAfter(job);
  }

  private async continueAfter(job: Job<MeetingPipelinePayload> | undefined) {
    if (job?.name !== QueueJob.MEETING_PIPELINE) return;
    const meetingId = job.data?.meetingId;
    if (typeof meetingId !== 'string') return;
    try {
      await this.meetings.continueRequestedRun(meetingId);
    } catch (err) {
      // The recovery sweep tries again before it would mark the run stale.
      this.logger.warn(
        `Meeting ${meetingId}: could not queue the waiting request: ${(err as Error).message}`,
      );
    }
  }

  onApplicationBootstrap() {
    // Give the other instances' workers a moment to reclaim their stalled
    // jobs before deciding that a run was lost.
    this.bootstrapSweep = setTimeout(() => void this.sweep(), 90 * 1000);
    this.bootstrapSweep.unref?.();
  }

  async onModuleDestroy() {
    if (this.bootstrapSweep) clearTimeout(this.bootstrapSweep);
    await this.worker?.close().catch(() => undefined);
  }

  @Interval('meeting-pipeline-recovery', RECOVERY_SWEEP_MS)
  async sweep() {
    try {
      await this.meetings.markStalledProcessing();
    } catch (err) {
      this.logger.warn(
        `Meeting recovery sweep failed: ${(err as Error).message}`,
      );
    }
  }
}
