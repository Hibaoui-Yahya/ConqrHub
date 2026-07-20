import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MeetingRepo } from '@docmost/db/repos/meeting/meeting.repo';
import { Meeting, MeetingSegment } from '@docmost/db/types/entity.types';
import { SttService } from '../stt/stt.service';
import { MeetingStorageService } from './meeting-storage.service';
import { MeetingPipelineService } from './meeting-pipeline.service';
import { hasMeetingType } from './meeting-types/meeting-type.registry';

const CHUNK_MIME_DEFAULT = 'audio/webm';

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly sttService: SttService,
    private readonly meetingStorage: MeetingStorageService,
    private readonly pipeline: MeetingPipelineService,
  ) {}

  async start(
    workspaceId: string,
    userId: string,
    title: string | undefined,
    opts?: {
      consent?: boolean;
      meetingType?: string;
      languageConfig?: Record<string, unknown>;
    },
  ): Promise<Meeting> {
    const finalTitle = (title?.trim() || '').slice(0, 200) || this.defaultTitle();
    const meetingType =
      opts?.meetingType && hasMeetingType(opts.meetingType)
        ? opts.meetingType
        : undefined;
    return this.meetingRepo.insert({
      workspaceId,
      userId,
      title: finalTitle,
      status: 'recording',
      ...(meetingType
        ? { meetingType, meetingTypeSource: 'user' }
        : {}),
      ...(opts?.languageConfig
        ? { languageConfig: opts.languageConfig as never }
        : {}),
      ...(opts?.consent
        ? { consentConfirmedAt: new Date(), consentConfirmedBy: userId }
        : {}),
    } as never);
  }

  async ingestChunk(params: {
    meetingId: string;
    workspaceId: string;
    userId: string;
    audio: Buffer;
    mime: string;
    source: 'mic' | 'system';
    sequence: number;
    startMs: number;
    durationMs: number;
    workspaceName: string;
  }): Promise<{ text: string; segmentId: string }> {
    const meeting = await this.requireRecording(
      params.meetingId,
      params.workspaceId,
      params.userId,
    );

    // Durability first (D5): persist the audio chunk to storage BEFORE
    // transcription so the canonical batch pass can be run later. Storage
    // failure is non-fatal for the live path — recorded as a manifest gap.
    try {
      await this.meetingStorage.saveChunk({
        meeting,
        workspaceId: params.workspaceId,
        audio: params.audio,
        mime: params.mime || CHUNK_MIME_DEFAULT,
        source: params.source,
        sequence: params.sequence,
        durationMs: params.durationMs,
      });
    } catch (err) {
      this.logger.warn(
        `Chunk persistence failed meeting=${meeting.id} seq=${params.sequence}: ${(err as Error).message}`,
      );
      await this.meetingStorage
        .appendManifestWarning(
          meeting.id,
          params.workspaceId,
          `chunk-${params.source}-${params.sequence}-not-persisted`,
        )
        .catch(() => undefined);
    }

    const result = await this.sttService.transcribeAndCorrect(
      params.audio,
      params.mime || CHUNK_MIME_DEFAULT,
      // Treat each chunk as a free-form audio sample. We deliberately do
      // not bind page context here so a long meeting can be transcribed
      // regardless of which page (if any) the user is on.
      { kind: 'search' },
      params.workspaceId,
      params.workspaceName,
    );

    const text = (result.corrected || result.raw || '').trim();

    if (!text) {
      this.logger.debug(
        `Empty chunk discarded meeting=${meeting.id} source=${params.source} seq=${params.sequence}`,
      );
      return { text: '', segmentId: '' };
    }

    const segment = await this.meetingRepo.insertSegment({
      meetingId: meeting.id,
      source: params.source,
      sequence: params.sequence,
      text,
      startMs: params.startMs,
      durationMs: params.durationMs,
    });

    return { text, segmentId: segment.id };
  }

  async stop(
    meetingId: string,
    workspaceId: string,
    userId: string,
    endedAtMs: number,
  ): Promise<Meeting> {
    const meeting = await this.requireRecording(
      meetingId,
      workspaceId,
      userId,
    );

    // Step 1: atomically flip the meeting into the 'stopping' state. From
    // this point forward `requireRecording` rejects new ingestChunk calls
    // with 409, so any chunk that has not yet entered the STT call will
    // never reach the segments table. (See ingestChunk for the gate.)
    await this.meetingRepo.update(meetingId, workspaceId, {
      status: 'stopping' as never,
    });

    // Step 2: give in-flight chunks (already past the gate, currently in
    // the STT round-trip) a short grace window to settle and write their
    // segment. We then re-read segments AFTER the grace period so the
    // assembled transcript captures them.
    const IN_FLIGHT_GRACE_MS = 1500;
    await new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_GRACE_MS));

    const segments = await this.meetingRepo.listSegments(meeting.id);
    const transcript = this.assembleTranscript(segments);

    const startedMs = new Date(meeting.startedAt as unknown as string).getTime();
    const durationMs = Math.max(endedAtMs - startedMs, 0);

    const completed = (await this.meetingRepo.update(meetingId, workspaceId, {
      status: 'completed',
      transcript,
      endedAt: new Date(endedAtMs),
      durationMs,
    })) as Meeting;

    // Auto-kick the canonical batch pipeline when consent was confirmed.
    // Failure to enqueue never breaks stop(): the user can retry via
    // POST /ai/meeting/:id/process.
    if (completed.consentConfirmedAt) {
      try {
        await this.pipeline.startPipeline({
          meetingId,
          workspaceId,
          actorId: userId,
        });
      } catch (err) {
        this.logger.warn(
          `Auto-processing failed to start for meeting ${meetingId}: ${(err as Error).message}`,
        );
      }
    }

    return (await this.meetingRepo.findById(meetingId, workspaceId)) ?? completed;
  }

  async getWithSegments(
    meetingId: string,
    workspaceId: string,
    userId: string,
  ): Promise<{ meeting: Meeting; segments: MeetingSegment[] }> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.userId !== userId) {
      throw new NotFoundException('Meeting not found');
    }
    const segments = await this.meetingRepo.listSegments(meeting.id);
    return { meeting, segments };
  }

  async list(
    workspaceId: string,
    userId: string,
    opts: { limit: number; offset: number },
  ) {
    return this.meetingRepo.listByUser(workspaceId, userId, opts);
  }

  async softDelete(
    meetingId: string,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.userId !== userId) {
      throw new NotFoundException('Meeting not found');
    }
    try {
      // Full deletion workflow: storage objects + provider data + rows.
      await this.pipeline.requestDeletion(meetingId, workspaceId, userId);
    } catch (err) {
      const message = (err as Error).message ?? '';
      // Legacy statuses outside the pipeline transition table ('finalizing')
      // fall back to the original soft delete; real conflicts (legal hold,
      // deletion already running) propagate.
      if (message.startsWith('Invalid meeting transition')) {
        await this.meetingRepo.softDelete(meetingId, workspaceId);
      } else {
        throw err;
      }
    }
  }

  async saveAiOutput(
    meetingId: string,
    workspaceId: string,
    userId: string,
    key: 'summary' | 'actions' | 'decisions',
    value: string,
  ): Promise<Meeting> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.userId !== userId) {
      throw new NotFoundException('Meeting not found');
    }
    const existing = (meeting.aiOutputs as Record<string, string> | null) ?? {};
    const next = { ...existing, [key]: value };
    return (await this.meetingRepo.update(meetingId, workspaceId, {
      aiOutputs: next as never,
    })) as Meeting;
  }

  private async requireRecording(
    meetingId: string,
    workspaceId: string,
    userId: string,
  ): Promise<Meeting> {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.userId !== userId) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.status !== 'recording') {
      // 409 — the resource exists but is not in a recordable state. A 404
      // here would make clients unable to distinguish "no such meeting"
      // from "meeting already stopped" (e.g. on a retried stop call).
      throw new ConflictException('Meeting is not in recording state');
    }
    return meeting;
  }

  private assembleTranscript(segments: MeetingSegment[]): string {
    if (!segments.length) return '';

    const sorted = [...segments].sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.source.localeCompare(b.source);
    });

    const lines: string[] = [];
    for (const seg of sorted) {
      const label = seg.source === 'mic' ? 'Me' : 'Meeting';
      const t = this.formatStamp(seg.startMs);
      lines.push(`**[${t}] ${label}:** ${seg.text}`);
    }
    return lines.join('\n\n');
  }

  private formatStamp(ms: number): string {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  private defaultTitle(): string {
    const d = new Date();
    return `Meeting — ${d.toLocaleString()}`;
  }
}
