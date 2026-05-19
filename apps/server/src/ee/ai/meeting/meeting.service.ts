import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MeetingRepo } from '@docmost/db/repos/meeting/meeting.repo';
import { Meeting, MeetingSegment } from '@docmost/db/types/entity.types';
import { SttService } from '../stt/stt.service';

const CHUNK_MIME_DEFAULT = 'audio/webm';

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly sttService: SttService,
  ) {}

  async start(
    workspaceId: string,
    userId: string,
    title: string | undefined,
  ): Promise<Meeting> {
    const finalTitle = (title?.trim() || '').slice(0, 200) || this.defaultTitle();
    return this.meetingRepo.insert({
      workspaceId,
      userId,
      title: finalTitle,
      status: 'recording',
    });
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
    const segments = await this.meetingRepo.listSegments(meeting.id);
    const transcript = this.assembleTranscript(segments);

    const startedMs = new Date(meeting.startedAt as unknown as string).getTime();
    const durationMs = Math.max(endedAtMs - startedMs, 0);

    return (await this.meetingRepo.update(meetingId, workspaceId, {
      status: 'completed',
      transcript,
      endedAt: new Date(endedAtMs),
      durationMs,
    })) as Meeting;
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
    await this.meetingRepo.softDelete(meetingId, workspaceId);
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
      throw new NotFoundException('Meeting is not in recording state');
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
