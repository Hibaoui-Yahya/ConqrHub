import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { MeetingPipelineService } from './meeting-pipeline.service';
import { MeetingProposalsService } from './meeting-proposals.service';

interface MeetingJobPayload {
  meetingId: string;
  workspaceId: string;
}
interface PollJobPayload extends MeetingJobPayload {
  providerJobId: string;
  attempt: number;
}
interface TranscriptJobPayload extends MeetingJobPayload {
  providerJobId: string;
}
interface AnalyzeJobPayload extends MeetingJobPayload {
  transcriptVersion: number;
  reason: string;
}
interface ExecuteProposalPayload {
  proposalId: string;
  workspaceId: string;
  actorId: string;
}
interface DeleteDataPayload extends MeetingJobPayload {
  actorId: string;
}

@Processor(QueueName.MEETING_QUEUE)
export class MeetingQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingQueueProcessor.name);

  constructor(
    private readonly pipeline: MeetingPipelineService,
    private readonly proposals: MeetingProposalsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case QueueJob.MEETING_ASSEMBLE_AUDIO: {
          const p = job.data as MeetingJobPayload;
          await this.pipeline.handleAssembleAudio(p.meetingId, p.workspaceId);
          break;
        }
        case QueueJob.MEETING_SUBMIT_BATCH: {
          const p = job.data as MeetingJobPayload;
          await this.pipeline.handleSubmitBatch(p.meetingId, p.workspaceId);
          break;
        }
        case QueueJob.MEETING_POLL_BATCH: {
          const p = job.data as PollJobPayload;
          await this.pipeline.handlePollBatch(
            p.meetingId,
            p.workspaceId,
            p.providerJobId,
            p.attempt ?? 0,
          );
          break;
        }
        case QueueJob.MEETING_PROCESS_TRANSCRIPT: {
          const p = job.data as TranscriptJobPayload;
          await this.pipeline.handleProcessTranscript(
            p.meetingId,
            p.workspaceId,
            p.providerJobId,
          );
          break;
        }
        case QueueJob.MEETING_ANALYZE: {
          const p = job.data as AnalyzeJobPayload;
          await this.pipeline.handleAnalyze(
            p.meetingId,
            p.workspaceId,
            p.transcriptVersion,
          );
          break;
        }
        case QueueJob.MEETING_EXECUTE_PROPOSAL: {
          const p = job.data as ExecuteProposalPayload;
          await this.proposals.execute({
            proposalId: p.proposalId,
            workspaceId: p.workspaceId,
            actorId: p.actorId,
          });
          break;
        }
        case QueueJob.MEETING_DELETE_DATA: {
          const p = job.data as DeleteDataPayload;
          await this.pipeline.handleDeleteData(
            p.meetingId,
            p.workspaceId,
            p.actorId,
          );
          break;
        }
        default:
          this.logger.warn(`Unknown meeting job: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(
        `Meeting job ${job.name} (${job.id}) attempt ${job.attemptsMade + 1} failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
