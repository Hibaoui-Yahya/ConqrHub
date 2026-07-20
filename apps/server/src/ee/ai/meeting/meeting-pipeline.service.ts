import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MeetingRepo } from '@docmost/db/repos/meeting/meeting.repo';
import { MeetingIntelligenceRepo } from '@docmost/db/repos/meeting/meeting-intelligence.repo';
import { Meeting, MeetingTranscript } from '@docmost/db/types/entity.types';
import {
  QueueJob,
  QueueName,
} from '../../../integrations/queue/constants';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  BATCH_TRANSCRIPTION_PROVIDER,
  BatchTranscriptionProvider,
} from '../transcription/transcription-provider.interface';
import {
  CanonicalTranscript,
  SpeakerMap,
  TranscriptSegment,
} from '../transcription/transcript.types';
import {
  assertTransition,
  isProcessingState,
  MeetingPipelineStatus,
  PIPELINE_ENTRY_STATES,
  REANALYZE_STATES,
} from './meeting-state.machine';
import { MeetingStorageService } from './meeting-storage.service';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { MeetingDocumentsService } from './meeting-documents.service';
import { MeetingProposalsService } from './meeting-proposals.service';
import { getMeetingType, hasMeetingType } from './meeting-types/meeting-type.registry';

const PRESIGN_FETCH_SECONDS = 900;
const POLL_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];
/** Diarization quality gate: send to speaker review above this UU share. */
const UU_REVIEW_THRESHOLD = 0.2;

/**
 * Pipeline orchestrator (CONQR_MEETING_STATE_MACHINES.md): executes guarded
 * state transitions, records processing events, and drives the MEETING_QUEUE
 * jobs. Every step is idempotent — transitions use conditional updates, jobs
 * use deterministic ids, and provider callbacks no-op once handled.
 */
@Injectable()
export class MeetingPipelineService {
  private readonly logger = new Logger(MeetingPipelineService.name);

  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly intelRepo: MeetingIntelligenceRepo,
    private readonly storage: MeetingStorageService,
    private readonly analysis: MeetingAnalysisService,
    private readonly documents: MeetingDocumentsService,
    private readonly proposals: MeetingProposalsService,
    private readonly environment: EnvironmentService,
    @Inject(BATCH_TRANSCRIPTION_PROVIDER)
    private readonly batchProvider: BatchTranscriptionProvider,
    @InjectQueue(QueueName.MEETING_QUEUE) private readonly queue: Queue,
  ) {}

  // ---------- transitions ----------

  /**
   * Guarded, race-safe transition. Returns the updated meeting or null when
   * another worker already moved the meeting out of `from` (no-op).
   */
  async transition(
    meetingId: string,
    workspaceId: string,
    from: MeetingPipelineStatus,
    to: MeetingPipelineStatus,
    opts?: {
      actorId?: string;
      detail?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    },
  ): Promise<Meeting | null> {
    assertTransition(from, to);
    const updated = await this.intelRepo.transitionStatus(
      meetingId,
      workspaceId,
      from,
      to,
      opts?.extra,
    );
    if (!updated) return null;
    await this.intelRepo.insertEvent({
      meetingId,
      event: 'transition',
      fromStatus: from,
      toStatus: to,
      detail: (opts?.detail ?? {}) as never,
      actorId: opts?.actorId ?? null,
    });
    return updated;
  }

  private async recordEvent(
    meetingId: string,
    event: string,
    detail: Record<string, unknown>,
    actorId?: string,
  ): Promise<void> {
    await this.intelRepo.insertEvent({
      meetingId,
      event,
      fromStatus: null,
      toStatus: null,
      detail: detail as never,
      actorId: actorId ?? null,
    });
  }

  private async failStep(
    meeting: Meeting,
    from: MeetingPipelineStatus,
    reason: string,
  ): Promise<void> {
    await this.transition(meeting.id, meeting.workspaceId, from, 'partially_failed', {
      detail: { reason: reason.slice(0, 500) },
      extra: { failureReason: reason.slice(0, 500) },
    });
  }

  // ---------- entry points ----------

  /**
   * Kick (or resume) the batch pipeline. `reanalyzeOnly` re-runs analysis
   * from the existing canonical transcript (meeting-type change) without
   * re-transcribing.
   */
  async startPipeline(params: {
    meetingId: string;
    workspaceId: string;
    actorId: string;
    meetingType?: string;
    languageConfig?: Record<string, unknown>;
  }): Promise<Meeting> {
    const meeting = await this.requireMeeting(
      params.meetingId,
      params.workspaceId,
    );
    if (!meeting.consentConfirmedAt) {
      throw new BadRequestException(
        'Recording consent has not been confirmed for this meeting',
      );
    }

    if (params.meetingType) {
      if (!hasMeetingType(params.meetingType)) {
        throw new BadRequestException(
          `Unknown meeting type: ${params.meetingType}`,
        );
      }
      await this.meetingRepo.update(meeting.id, params.workspaceId, {
        meetingType: params.meetingType,
        meetingTypeSource: 'user',
        meetingTypeConfidence: null,
      } as never);
      meeting.meetingType = params.meetingType;
    }
    if (params.languageConfig) {
      await this.meetingRepo.update(meeting.id, params.workspaceId, {
        languageConfig: params.languageConfig as never,
      } as never);
    }

    const status = meeting.status as MeetingPipelineStatus;

    // Type change on an already-transcribed meeting: re-run analysis only.
    const canonical = await this.intelRepo.findLatestTranscript(meeting.id, {
      kind: 'canonical',
      status: 'ready',
    });
    if (canonical && REANALYZE_STATES.includes(status)) {
      const moved = await this.transition(
        meeting.id,
        params.workspaceId,
        status,
        'analyzing',
        { actorId: params.actorId, detail: { reason: 'reanalyze' } },
      );
      if (moved) {
        await this.enqueue(QueueJob.MEETING_ANALYZE, meeting.id, {
          meetingId: meeting.id,
          workspaceId: params.workspaceId,
          transcriptVersion: canonical.version,
          reason: 'type-change',
        });
      }
      return (await this.requireMeeting(meeting.id, params.workspaceId))!;
    }

    // Stuck-state recovery: a processing state whose job was lost (crash,
    // failed enqueue) can re-enqueue its own step. Deterministic job ids
    // make this a no-op while the original job is still queued/active.
    if (isProcessingState(status)) {
      await this.reenqueueCurrentStep(meeting, status);
      return (await this.requireMeeting(meeting.id, params.workspaceId))!;
    }

    if (!PIPELINE_ENTRY_STATES.includes(status)) {
      throw new ConflictException(
        `Meeting cannot start processing from status "${status}"`,
      );
    }

    const moved = await this.transition(
      meeting.id,
      params.workspaceId,
      status,
      'normalizing_audio',
      { actorId: params.actorId },
    );
    if (moved) {
      await this.enqueue(QueueJob.MEETING_ASSEMBLE_AUDIO, meeting.id, {
        meetingId: meeting.id,
        workspaceId: params.workspaceId,
      });
    }
    return (await this.requireMeeting(meeting.id, params.workspaceId))!;
  }

  /** Re-enqueue the job that corresponds to the meeting's current state. */
  private async reenqueueCurrentStep(
    meeting: Meeting,
    status: MeetingPipelineStatus,
  ): Promise<void> {
    const base = { meetingId: meeting.id, workspaceId: meeting.workspaceId };
    switch (status) {
      case 'normalizing_audio':
        await this.enqueue(QueueJob.MEETING_ASSEMBLE_AUDIO, meeting.id, base);
        return;
      case 'batch_submitted':
        await this.enqueue(QueueJob.MEETING_SUBMIT_BATCH, meeting.id, base);
        return;
      case 'batch_processing': {
        const pending = await this.intelRepo.findLatestTranscript(meeting.id, {
          kind: 'canonical',
          status: 'processing',
        });
        if (pending?.providerJobId) {
          await this.schedulePoll(
            meeting.id,
            meeting.workspaceId,
            pending.providerJobId,
            0,
          );
        } else {
          await this.failStep(meeting, status, 'No pending provider job to resume');
        }
        return;
      }
      case 'transcribed':
      case 'analyzing':
      case 'documents_generating':
      case 'proposals_generating': {
        const ready = await this.intelRepo.findLatestTranscript(meeting.id, {
          kind: 'canonical',
          status: 'ready',
        });
        if (!ready) {
          await this.failStep(meeting, status, 'No canonical transcript to analyze');
          return;
        }
        // Analysis re-entry requires the meeting to be in 'analyzing'.
        if (status !== 'analyzing') {
          await this.intelRepo.transitionStatus(
            meeting.id,
            meeting.workspaceId,
            status,
            'analyzing',
          );
        }
        await this.enqueue(QueueJob.MEETING_ANALYZE, meeting.id, {
          ...base,
          transcriptVersion: ready.version,
          reason: 'retry',
        });
        return;
      }
      default:
        return;
    }
  }

  // ---------- queue step handlers (called by the processor) ----------

  async handleAssembleAudio(meetingId: string, workspaceId: string): Promise<void> {
    const meeting = await this.requireMeeting(meetingId, workspaceId);
    if (meeting.status !== 'normalizing_audio') return; // stale job

    try {
      await this.ensureLiveTranscriptPersisted(meeting);

      const original = await this.storage.assembleOriginalFromChunks(
        meeting,
        workspaceId,
      );
      if (!original) {
        const manifest = meeting.audioManifest as { original?: { key: string } };
        if (!manifest?.original?.key) {
          await this.failStep(meeting, 'normalizing_audio', 'No audio available to process');
          return;
        }
      }

      // Audio normalization (ffmpeg) is optional (D16): record skip.
      if (!this.environment.getFfmpegPath()) {
        await this.storage.recordNormalizationSkipped(
          meetingId,
          workspaceId,
          'ffmpeg-unavailable',
        );
      }
      await this.storage.mirrorManifest(meeting, workspaceId);

      if (!this.batchProvider.isConfigured()) {
        // Fallback (D3/CONQR_SPEECHMATICS_INTEGRATION.md §6): canonical from
        // live segments, no diarization — recorded honestly as mistral-live.
        await this.createFallbackCanonical(meeting, workspaceId);
        return;
      }

      const moved = await this.transition(
        meetingId,
        workspaceId,
        'normalizing_audio',
        'batch_submitted',
      );
      if (moved) {
        await this.enqueue(QueueJob.MEETING_SUBMIT_BATCH, meetingId, {
          meetingId,
          workspaceId,
        });
      }
    } catch (err) {
      await this.failStep(meeting, 'normalizing_audio', (err as Error).message);
      throw err;
    }
  }

  async handleSubmitBatch(meetingId: string, workspaceId: string): Promise<void> {
    const meeting = await this.requireMeeting(meetingId, workspaceId);
    if (meeting.status !== 'batch_submitted') return;

    // Resubmit guard: a pending canonical attempt means submit already ran.
    const pending = await this.intelRepo.findLatestTranscript(meetingId, {
      kind: 'canonical',
      status: 'processing',
    });
    if (pending?.providerJobId) {
      await this.schedulePoll(meetingId, workspaceId, pending.providerJobId, 0);
      return;
    }

    try {
      const manifest = meeting.audioManifest as {
        original?: { key: string; mime: string };
      };
      if (!manifest.original?.key) {
        await this.failStep(meeting, 'batch_submitted', 'Original audio missing');
        return;
      }

      // fetch_data via presigned GET only works on S3-compatible storage
      // (D6). The local driver cannot presign — submit the audio directly
      // (Speechmatics accepts <1 GB request bodies; uploads are capped well
      // below that).
      let audioUrl: string | null = null;
      let audioBuffer: Buffer | undefined;
      if (this.storage.supportsPresignedFetch()) {
        audioUrl = await this.storage.getPresignedAudioUrl(
          meeting,
          'original',
          PRESIGN_FETCH_SECONDS,
        );
      } else {
        audioBuffer = await this.storage.readObject(manifest.original.key);
      }

      const webhookToken = randomBytes(32).toString('hex');
      const webhookBase = this.environment.getMeetingWebhookBaseUrl();
      const languageConfig =
        (meeting.languageConfig as Record<string, unknown>) ?? {};

      const version = await this.intelRepo.nextTranscriptVersion(meetingId);
      const { providerJobId, submittedConfig } = await this.batchProvider.submit({
        audioUrl: audioUrl ?? undefined,
        audio: audioBuffer,
        fileName: manifest.original.key.split('/').pop(),
        mime: manifest.original.mime,
        language: {
          language: (languageConfig.language as string) ?? 'en',
          expectedLanguages: languageConfig.expectedLanguages as string[] | undefined,
          operatingPoint: languageConfig.operatingPoint as
            | 'standard'
            | 'enhanced'
            | undefined,
        },
        diarization: 'speaker',
        notification: webhookBase
          ? {
              url: `${webhookBase.replace(/\/$/, '')}/api/ai/meeting/webhook/speechmatics`,
              authToken: webhookToken,
            }
          : undefined,
      });

      await this.intelRepo.insertTranscript({
        meetingId,
        version,
        kind: 'canonical',
        status: 'processing',
        provider: this.batchProvider.name,
        providerJobId,
        webhookTokenHash: sha256(webhookToken),
        language: (languageConfig.language as string) ?? 'en',
        processingConfig: submittedConfig as never,
      });

      await this.recordEvent(meetingId, 'provider_submitted', {
        provider: this.batchProvider.name,
        providerJobId,
      });

      const moved = await this.transition(
        meetingId,
        workspaceId,
        'batch_submitted',
        'batch_processing',
        { detail: { providerJobId } },
      );
      if (moved) {
        await this.schedulePoll(meetingId, workspaceId, providerJobId, 0);
      }
    } catch (err) {
      await this.failStep(meeting, 'batch_submitted', (err as Error).message);
      throw err;
    }
  }

  async handlePollBatch(
    meetingId: string,
    workspaceId: string,
    providerJobId: string,
    attempt: number,
  ): Promise<void> {
    const transcript =
      await this.intelRepo.findTranscriptByProviderJobId(providerJobId);
    if (!transcript || transcript.status !== 'processing') return; // handled

    const meeting = await this.requireMeeting(meetingId, workspaceId);
    const timedOut =
      Date.now() -
        new Date(transcript.createdAt as unknown as string).getTime() >
      this.environment.getMeetingBatchTimeoutMinutes() * 60_000;

    let status: string;
    try {
      status = await this.batchProvider.getStatus(providerJobId);
    } catch (err) {
      status = 'error';
      this.logger.warn(
        `Poll failed for job ${providerJobId}: ${(err as Error).message}`,
      );
    }
    await this.recordEvent(meetingId, 'job_completed', {
      job: 'poll',
      providerJobId,
      providerStatus: status,
      attempt,
    });

    if (status === 'done') {
      await this.enqueue(
        QueueJob.MEETING_PROCESS_TRANSCRIPT,
        `${meetingId}:${providerJobId}`,
        { meetingId, workspaceId, providerJobId },
      );
      return;
    }
    if (status === 'rejected' || status === 'expired') {
      await this.intelRepo.updateTranscript(transcript.id, {
        status: 'failed',
        error: `Provider reported ${status}`,
      });
      await this.failStep(meeting, 'batch_processing', `Transcription ${status}`);
      return;
    }
    if (timedOut) {
      await this.intelRepo.updateTranscript(transcript.id, {
        status: 'failed',
        error: 'Batch processing timed out',
      });
      await this.failStep(meeting, 'batch_processing', 'Batch processing timed out');
      return;
    }
    await this.schedulePoll(meetingId, workspaceId, providerJobId, attempt + 1);
  }

  /** Webhook entry — token-authenticated hint; transcript is re-fetched. */
  async handleProviderCallback(params: {
    providerJobId: string;
    status: string;
    bearerToken: string | null;
  }): Promise<'accepted' | 'noop'> {
    const transcript = await this.intelRepo.findTranscriptByProviderJobId(
      params.providerJobId,
    );
    if (!transcript || !transcript.webhookTokenHash || !params.bearerToken) {
      throw new NotFoundException();
    }
    if (!constantTimeEquals(sha256(params.bearerToken), transcript.webhookTokenHash)) {
      throw new NotFoundException();
    }

    const meeting = await this.meetingRepo.findByIdUnscoped(
      transcript.meetingId,
    );
    if (!meeting) throw new NotFoundException();

    await this.recordEvent(meeting.id, 'webhook_received', {
      providerJobId: params.providerJobId,
      providerStatus: params.status,
    });

    if (transcript.status !== 'processing') return 'noop'; // duplicate webhook

    if (params.status === 'success') {
      await this.enqueue(
        QueueJob.MEETING_PROCESS_TRANSCRIPT,
        `${meeting.id}:${params.providerJobId}`,
        {
          meetingId: meeting.id,
          workspaceId: meeting.workspaceId,
          providerJobId: params.providerJobId,
        },
      );
    } else {
      await this.intelRepo.updateTranscript(transcript.id, {
        status: 'failed',
        error: `Provider callback status: ${params.status}`,
      });
      await this.failStep(
        meeting,
        'batch_processing',
        `Transcription failed (${params.status})`,
      );
    }
    return 'accepted';
  }

  async handleProcessTranscript(
    meetingId: string,
    workspaceId: string,
    providerJobId: string,
  ): Promise<void> {
    const transcript =
      await this.intelRepo.findTranscriptByProviderJobId(providerJobId);
    if (!transcript || transcript.status !== 'processing') return; // idempotent

    const meeting = await this.requireMeeting(meetingId, workspaceId);

    try {
      const { canonical, rawPayload } =
        await this.batchProvider.fetchTranscript(providerJobId);

      // Provider retains data only 7 days — persist the raw payload first.
      const rawPath = await this.storage.saveRawTranscript(
        meeting,
        workspaceId,
        transcript.version,
        rawPayload,
      );

      await this.intelRepo.updateTranscript(transcript.id, {
        status: 'ready',
        segments: canonical.segments as never,
        speakers: canonical.speakers as never,
        detectedLanguages: canonical.detectedLanguages as never,
        rawPayloadPath: rawPath,
      });

      await this.accumulateCost(meeting, workspaceId, {
        audioSeconds: canonical.audioDurationSeconds ?? 0,
        sttProvider: this.batchProvider.name,
      });

      // Data minimization: provider-side deletion once we own the data.
      await this.batchProvider.deleteJob(providerJobId);

      const needsSpeakerReview = this.needsSpeakerReview(canonical);
      const moved = await this.transition(
        meetingId,
        workspaceId,
        'batch_processing',
        'transcribed',
        { detail: { transcriptVersion: transcript.version } },
      );
      if (!moved) return;

      if (needsSpeakerReview) {
        await this.transition(meetingId, workspaceId, 'transcribed', 'speakers_pending_review', {
          detail: { reason: 'low diarization confidence' },
        });
        return;
      }
      await this.beginAnalysis(meetingId, workspaceId, transcript.version, 'initial');
    } catch (err) {
      await this.intelRepo.updateTranscript(transcript.id, {
        status: 'failed',
        error: (err as Error).message.slice(0, 500),
      });
      await this.failStep(meeting, 'batch_processing', (err as Error).message);
      throw err;
    }
  }

  async handleAnalyze(
    meetingId: string,
    workspaceId: string,
    transcriptVersion: number,
  ): Promise<void> {
    const meeting = await this.requireMeeting(meetingId, workspaceId);
    if (meeting.status !== 'analyzing') return;

    const transcript = await this.intelRepo.findTranscript(
      meetingId,
      transcriptVersion,
    );
    if (!transcript || transcript.status !== 'ready') {
      await this.failStep(meeting, 'analyzing', 'Transcript version unavailable');
      return;
    }
    const segments = (transcript.segments ?? []) as unknown as TranscriptSegment[];
    const speakers = (transcript.speakers ?? {}) as unknown as SpeakerMap;

    try {
      // Type detection (skipped when the user chose explicitly).
      if (meeting.meetingTypeSource !== 'user') {
        const detected = await this.analysis.detectType({
          userSelectedType: null,
          segments,
        });
        await this.meetingRepo.update(meetingId, workspaceId, {
          meetingType: detected.typeId,
          meetingTypeSource: detected.source,
          meetingTypeConfidence: detected.confidence,
        } as never);
        meeting.meetingType = detected.typeId;
      }

      const definition = getMeetingType(meeting.meetingType);
      const extraction = await this.analysis.extract({
        definition,
        segments,
        speakers: Object.values(speakers).map((s) => s.displayName),
      });
      await this.accumulateCost(meeting, workspaceId, {
        llmTokens: extraction.llmTokens,
      });

      const movedDocs = await this.transition(
        meetingId,
        workspaceId,
        'analyzing',
        'documents_generating',
      );
      if (!movedDocs) return;

      const document = await this.documents.generate({
        meeting,
        transcriptVersion,
        structured: extraction.structured,
        speakers,
      });

      const movedProps = await this.transition(
        meetingId,
        workspaceId,
        'documents_generating',
        'proposals_generating',
      );
      if (!movedProps) return;

      const seeds = definition.buildProposals(
        extraction.structured as never,
        {
          meetingTitle: meeting.title,
          meetingDate: new Date(
            meeting.startedAt as unknown as string,
          ).toISOString().slice(0, 10),
          meetingType: definition.name,
          speakers: Object.values(speakers).map((s) => s.displayName),
        },
      );
      const created = await this.proposals.createFromSeeds({
        meeting,
        workspaceId,
        transcriptVersion,
        documentId: document.id,
        seeds,
      });

      await this.transition(
        meetingId,
        workspaceId,
        'proposals_generating',
        'awaiting_review',
        { detail: { documents: 1, proposals: created.length } },
      );
    } catch (err) {
      const raw = (err as Error & { rawOutput?: string }).rawOutput;
      if (raw) {
        await this.recordEvent(meetingId, 'job_failed', {
          job: 'analyze',
          error: (err as Error).message.slice(0, 500),
          rawOutputPreserved: true,
        });
      }
      await this.failStep(
        meeting,
        meeting.status as MeetingPipelineStatus,
        (err as Error).message,
      );
      throw err;
    }
  }

  async handleDeleteData(
    meetingId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.status !== 'deletion_pending') return;

    const canonical = await this.intelRepo.findLatestTranscript(meetingId, {
      kind: 'canonical',
    });
    if (canonical?.providerJobId) {
      await this.batchProvider.deleteJob(canonical.providerJobId);
    }

    const { deleted, failed } = await this.storage.deleteAllObjects(meeting);
    await this.recordEvent(
      meetingId,
      'user_action',
      {
        action: 'delete-data',
        deletedObjects: deleted.length,
        failedObjects: failed,
      },
      actorId,
    );

    await this.transition(meetingId, workspaceId, 'deletion_pending', 'deleted', {
      actorId,
    });
    await this.meetingRepo.softDelete(meetingId, workspaceId);
  }

  // ---------- user-facing operations ----------

  async requestDeletion(
    meetingId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const meeting = await this.requireMeeting(meetingId, workspaceId);
    if (meeting.legalHold) {
      throw new ConflictException('Meeting is under legal hold and cannot be deleted');
    }
    const from = meeting.status as MeetingPipelineStatus;
    const moved = await this.transition(meetingId, workspaceId, from, 'deletion_pending', {
      actorId,
    });
    if (!moved) {
      throw new ConflictException('Meeting is already being deleted');
    }
    await this.enqueue(QueueJob.MEETING_DELETE_DATA, meetingId, {
      meetingId,
      workspaceId,
      actorId,
    });
  }

  /** Speaker review: rename/merge/link -> NEW canonical version (never in place). */
  async applySpeakerEdits(params: {
    meetingId: string;
    workspaceId: string;
    actorId: string;
    baseVersion: number;
    renames?: Record<string, string>;
    merges?: [string, string][];
    userLinks?: Record<string, string>;
    confirm?: boolean;
  }): Promise<MeetingTranscript> {
    const meeting = await this.requireMeeting(params.meetingId, params.workspaceId);
    const base = await this.intelRepo.findTranscript(
      params.meetingId,
      params.baseVersion,
    );
    if (!base || base.status !== 'ready') {
      throw new NotFoundException('Base transcript version not found');
    }

    const segments = [
      ...((base.segments ?? []) as unknown as TranscriptSegment[]),
    ].map((s) => ({ ...s }));
    const speakers = JSON.parse(
      JSON.stringify(base.speakers ?? {}),
    ) as SpeakerMap;

    for (const [fromLabel, intoLabel] of params.merges ?? []) {
      for (const seg of segments) {
        if (seg.speaker === fromLabel) {
          seg.speaker = intoLabel;
          seg.edited = true;
        }
      }
      delete speakers[fromLabel];
    }
    for (const [label, displayName] of Object.entries(params.renames ?? {})) {
      if (speakers[label]) speakers[label].displayName = displayName;
    }
    for (const [label, userId] of Object.entries(params.userLinks ?? {})) {
      if (speakers[label]) speakers[label].userId = userId;
    }

    const version = await this.intelRepo.nextTranscriptVersion(params.meetingId);
    const created = await this.intelRepo.insertTranscript({
      meetingId: params.meetingId,
      version,
      kind: 'canonical',
      status: 'ready',
      provider: 'manual-edit',
      language: base.language,
      detectedLanguages: base.detectedLanguages as never,
      processingConfig: base.processingConfig as never,
      segments: segments as never,
      speakers: speakers as never,
      rawPayloadPath: base.rawPayloadPath,
      editedFromVersion: base.version,
      createdBy: params.actorId,
    });
    await this.intelRepo.updateTranscript(base.id, { status: 'superseded' });
    await this.recordEvent(
      params.meetingId,
      'user_action',
      { action: 'speaker-edit', baseVersion: base.version, newVersion: version },
      params.actorId,
    );

    if (params.confirm && meeting.status === 'speakers_pending_review') {
      await this.beginAnalysisFromReview(meeting, version);
    }
    return created;
  }

  async confirmSpeakers(
    meetingId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const meeting = await this.requireMeeting(meetingId, workspaceId);
    if (meeting.status !== 'speakers_pending_review') {
      throw new ConflictException('Meeting is not awaiting speaker review');
    }
    const latest = await this.intelRepo.findLatestTranscript(meetingId, {
      kind: 'canonical',
      status: 'ready',
    });
    if (!latest) throw new ConflictException('No canonical transcript available');
    await this.recordEvent(meetingId, 'user_action', { action: 'speakers-confirmed' }, actorId);
    await this.beginAnalysisFromReview(meeting, latest.version);
  }

  // ---------- helpers ----------

  private async beginAnalysisFromReview(
    meeting: Meeting,
    transcriptVersion: number,
  ): Promise<void> {
    const moved = await this.transition(
      meeting.id,
      meeting.workspaceId,
      'speakers_pending_review',
      'analyzing',
    );
    if (moved) {
      await this.enqueue(QueueJob.MEETING_ANALYZE, meeting.id, {
        meetingId: meeting.id,
        workspaceId: meeting.workspaceId,
        transcriptVersion,
        reason: 'initial',
      });
    }
  }

  private async beginAnalysis(
    meetingId: string,
    workspaceId: string,
    transcriptVersion: number,
    reason: string,
  ): Promise<void> {
    const moved = await this.transition(meetingId, workspaceId, 'transcribed', 'analyzing');
    if (moved) {
      await this.enqueue(QueueJob.MEETING_ANALYZE, meetingId, {
        meetingId,
        workspaceId,
        transcriptVersion,
        reason,
      });
    }
  }

  /** Live transcript from meeting_segments persisted as version 0. */
  private async ensureLiveTranscriptPersisted(meeting: Meeting): Promise<void> {
    const existing = await this.intelRepo.findTranscript(meeting.id, 0);
    if (existing) return;
    const liveSegments = await this.meetingRepo.listSegments(meeting.id);
    if (liveSegments.length === 0) return;
    const segments: TranscriptSegment[] = liveSegments.map((s, i) => ({
      id: `s${i.toString().padStart(4, '0')}`,
      speaker: s.source === 'mic' ? 'ME' : 'MEETING',
      channel: s.source,
      startMs: s.startMs,
      endMs: s.startMs + s.durationMs,
      text: s.text,
      confidence: null,
      language: null,
      redacted: false,
      excludedFromAi: false,
      edited: false,
    }));
    await this.intelRepo.insertTranscript({
      meetingId: meeting.id,
      version: 0,
      kind: 'live',
      status: 'ready',
      provider: 'mistral-live',
      isProvisional: true,
      segments: segments as never,
      speakers: {
        ME: { label: 'ME', displayName: 'Me', userId: meeting.userId, confidence: 1 },
        MEETING: { label: 'MEETING', displayName: 'Meeting', userId: null, confidence: 1 },
      } as never,
    });
  }

  /** No Speechmatics key: promote live segments to a canonical version. */
  private async createFallbackCanonical(
    meeting: Meeting,
    workspaceId: string,
  ): Promise<void> {
    const live = await this.intelRepo.findTranscript(meeting.id, 0);
    if (!live) {
      await this.failStep(
        meeting,
        'normalizing_audio',
        'No transcription provider configured and no live transcript available',
      );
      return;
    }
    const version = await this.intelRepo.nextTranscriptVersion(meeting.id);
    await this.intelRepo.insertTranscript({
      meetingId: meeting.id,
      version,
      kind: 'canonical',
      status: 'ready',
      provider: 'mistral-live',
      segments: live.segments as never,
      speakers: live.speakers as never,
      processingConfig: { fallback: 'live-segments-promoted' } as never,
    });
    await this.storage.appendManifestWarning(
      meeting.id,
      workspaceId,
      'canonical-from-live-fallback (no diarization)',
    );
    // Walk the states so observers see a consistent path.
    const a = await this.transition(meeting.id, workspaceId, 'normalizing_audio', 'batch_submitted', {
      detail: { fallback: true },
    });
    if (!a) return;
    const b = await this.transition(meeting.id, workspaceId, 'batch_submitted', 'batch_processing');
    if (!b) return;
    const c = await this.transition(meeting.id, workspaceId, 'batch_processing', 'transcribed');
    if (!c) return;
    await this.beginAnalysis(meeting.id, workspaceId, version, 'initial');
  }

  private needsSpeakerReview(canonical: CanonicalTranscript): boolean {
    const labels = Object.keys(canonical.speakers).filter((l) => l !== 'UU');
    if (labels.length === 0) return true;
    const total = canonical.segments.length || 1;
    const uu = canonical.segments.filter((s) => s.speaker === 'UU').length;
    return uu / total > UU_REVIEW_THRESHOLD;
  }

  private async accumulateCost(
    meeting: Meeting,
    workspaceId: string,
    delta: { audioSeconds?: number; llmTokens?: number; sttProvider?: string },
  ): Promise<void> {
    const cost = ((meeting.cost as Record<string, unknown>) ?? {}) as {
      audioSeconds?: number;
      llmTokens?: number;
      sttProvider?: string;
    };
    await this.meetingRepo.update(meeting.id, workspaceId, {
      cost: {
        ...cost,
        audioSeconds: (cost.audioSeconds ?? 0) + (delta.audioSeconds ?? 0),
        llmTokens: (cost.llmTokens ?? 0) + (delta.llmTokens ?? 0),
        sttProvider: delta.sttProvider ?? cost.sttProvider,
      } as never,
    } as never);
  }

  private async schedulePoll(
    meetingId: string,
    workspaceId: string,
    providerJobId: string,
    attempt: number,
  ): Promise<void> {
    const delay =
      POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)];
    await this.queue.add(
      QueueJob.MEETING_POLL_BATCH,
      { meetingId, workspaceId, providerJobId, attempt },
      {
        delay,
        // No ':' — BullMQ rejects custom ids containing its key separator.
        jobId: `${QueueJob.MEETING_POLL_BATCH}--${providerJobId}-${attempt}`.replace(
          /:/g,
          '-',
        ),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async enqueue(
    job: QueueJob,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // BullMQ forbids ':' in custom job ids (its Redis key separator).
    const jobId = `${job}--${dedupeKey}`.replace(/:/g, '-');
    await this.queue.add(job, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    await this.recordEvent(String(payload.meetingId ?? dedupeKey), 'job_started', {
      job,
    });
  }

  private async requireMeeting(
    meetingId: string,
    workspaceId: string,
  ): Promise<Meeting> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
