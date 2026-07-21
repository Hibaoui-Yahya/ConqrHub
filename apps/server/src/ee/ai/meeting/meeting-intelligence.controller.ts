import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { MeetingRepo } from '@docmost/db/repos/meeting/meeting.repo';
import { MeetingIntelligenceRepo } from '@docmost/db/repos/meeting/meeting-intelligence.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { QueueJob } from '../../../integrations/queue/constants';
import { MeetingPipelineService } from './meeting-pipeline.service';
import { MeetingStorageService } from './meeting-storage.service';
import { MeetingDocumentsService } from './meeting-documents.service';
import { MeetingProposalsService } from './meeting-proposals.service';
import { hasMeetingType } from './meeting-types/meeting-type.registry';
import {
  ApproveProposalDto,
  AudioUrlQueryDto,
  ProcessMeetingDto,
  PublishDocumentDto,
  SpeakerEditDto,
  TranscriptQueryDto,
} from './dto/meeting-intelligence.dto';

const UPLOAD_MIME_ALLOWLIST = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'video/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/flac',
]);
const PLAYBACK_URL_TTL_SECONDS = 300;

/**
 * Meeting-intelligence endpoints (CONQR_MEETING_API_CONTRACTS.md §2).
 * Owner-only access in MVP, matching the shipped meeting module.
 */
@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('meeting')
@Controller('ai/meeting')
export class MeetingIntelligenceController {
  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly intelRepo: MeetingIntelligenceRepo,
    private readonly pipeline: MeetingPipelineService,
    private readonly storage: MeetingStorageService,
    private readonly documents: MeetingDocumentsService,
    private readonly proposals: MeetingProposalsService,
    private readonly environment: EnvironmentService,
  ) {}

  // ---- upload ----

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @Req() req: FastifyRequest,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Expected multipart/form-data');
    }
    let fileData: any;
    try {
      fileData = await (req as any).file({
        limits: {
          fileSize: this.environment.getMeetingUploadSizeLimit(),
          fields: 8,
          files: 1,
        },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('Uploaded file too large');
      }
      throw new BadRequestException('Failed to process upload');
    }
    if (!fileData) throw new BadRequestException('No file provided');

    const mime = (fileData.mimetype ?? '').toLowerCase().split(';')[0].trim();
    if (!UPLOAD_MIME_ALLOWLIST.has(mime)) {
      throw new BadRequestException(`Unsupported media type: ${mime}`);
    }

    // Drain the file BEFORE reading fields: multipart parts are parsed
    // sequentially, so fields sent after the file part only exist once the
    // file stream is consumed (same pattern as the chunk endpoint).
    const buffer: Buffer = await fileData.toBuffer();
    if (buffer.length === 0) throw new BadRequestException('Empty file');

    const fields = fileData.fields ?? {};
    const consent = String(fields.consent?.value ?? '') === 'true';
    if (!consent) {
      throw new BadRequestException(
        'Recording consent must be confirmed (consent=true)',
      );
    }
    const title =
      String(fields.title?.value ?? '').slice(0, 200) ||
      `Uploaded meeting — ${new Date().toISOString().slice(0, 10)}`;
    const meetingType = fields.meetingType?.value
      ? String(fields.meetingType.value)
      : undefined;
    if (meetingType && !hasMeetingType(meetingType)) {
      throw new BadRequestException(`Unknown meeting type: ${meetingType}`);
    }
    let languageConfig: Record<string, unknown> | undefined;
    if (fields.languageConfig?.value) {
      try {
        languageConfig = JSON.parse(String(fields.languageConfig.value));
      } catch {
        throw new BadRequestException('languageConfig must be valid JSON');
      }
    }
    const autoProcess = String(fields.autoProcess?.value ?? 'true') !== 'false';

    // Duplicate content detection (workspace-scoped sha256).
    const sha = this.storage.sha256(buffer);
    const duplicate = await this.intelRepo.findMeetingByContentHash(
      workspace.id,
      sha,
    );
    if (duplicate) {
      throw new ConflictException(
        `This audio was already uploaded (meeting ${duplicate.id})`,
      );
    }

    const retentionDays = this.environment.getMeetingAudioRetentionDays();
    const meeting = await this.meetingRepo.insert({
      workspaceId: workspace.id,
      userId: user.id,
      title,
      status: 'uploading' as never,
      captureKind: 'upload',
      meetingType: meetingType ?? 'generic-meeting',
      meetingTypeSource: meetingType ? 'user' : 'default',
      languageConfig: (languageConfig ?? {}) as never,
      consentConfirmedAt: new Date(),
      consentConfirmedBy: user.id,
      retentionUntil:
        retentionDays > 0
          ? new Date(Date.now() + retentionDays * 86_400_000)
          : null,
    } as never);

    await this.storage.saveOriginal({
      meeting,
      workspaceId: workspace.id,
      data: buffer,
      mime,
    });
    const uploaded = await this.pipeline.transition(
      meeting.id,
      workspace.id,
      'uploading',
      'uploaded',
      { actorId: user.id, detail: { bytes: buffer.length } },
    );

    if (autoProcess) {
      await this.pipeline.startPipeline({
        meetingId: meeting.id,
        workspaceId: workspace.id,
        actorId: user.id,
      });
    }

    const fresh = await this.meetingRepo.findById(meeting.id, workspace.id);
    return { meeting: fresh ?? uploaded ?? meeting };
  }

  // ---- pipeline control ----

  @Post(':id/process')
  @HttpCode(HttpStatus.ACCEPTED)
  async processMeeting(
    @Param('id') meetingId: string,
    @Body() dto: ProcessMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const meeting = await this.pipeline.startPipeline({
      meetingId,
      workspaceId: workspace.id,
      actorId: user.id,
      meetingType: dto.meetingType,
      languageConfig: dto.languageConfig,
    });
    return { status: meeting.status };
  }

  @Get(':id/status')
  async status(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const meeting = await this.requireOwnedMeeting(
      meetingId,
      workspace.id,
      user.id,
    );
    const [versions, events] = await Promise.all([
      this.intelRepo.listTranscriptVersions(meetingId),
      this.intelRepo.listEvents(meetingId, 50),
    ]);
    const manifest = meeting.audioManifest as {
      original?: { key?: string };
    } | null;
    return {
      status: meeting.status,
      // Playback needs an S3-compatible driver AND stored audio — lets the
      // client skip the audio probe instead of eating a guaranteed 404.
      audioAvailable:
        this.storage.supportsPresignedFetch() &&
        Boolean(manifest?.original?.key),
      meetingType: meeting.meetingType,
      meetingTypeSource: meeting.meetingTypeSource,
      meetingTypeConfidence: meeting.meetingTypeConfidence,
      consentConfirmedAt: meeting.consentConfirmedAt,
      failureReason: meeting.failureReason,
      cost: meeting.cost,
      transcriptVersions: versions,
      events,
    };
  }

  // ---- transcripts & speakers ----

  @Get(':id/transcript')
  async transcript(
    @Param('id') meetingId: string,
    @Query() query: TranscriptQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const transcript =
      !query.version || query.version === 'latest'
        ? await this.intelRepo.findLatestTranscript(meetingId, {
            status: 'ready',
          })
        : await this.intelRepo.findTranscript(
            meetingId,
            Number.parseInt(query.version, 10),
          );
    if (!transcript) throw new NotFoundException('Transcript not found');
    const { webhookTokenHash: _hash, rawPayloadPath: _raw, ...safe } =
      transcript as Record<string, unknown>;
    return safe;
  }

  @Post(':id/transcript/speakers')
  @HttpCode(HttpStatus.OK)
  async editSpeakers(
    @Param('id') meetingId: string,
    @Body() dto: SpeakerEditDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const hasEdits =
      Object.keys(dto.renames ?? {}).length > 0 ||
      (dto.merges ?? []).length > 0 ||
      Object.keys(dto.userLinks ?? {}).length > 0;

    if (!hasEdits && dto.confirm) {
      await this.pipeline.confirmSpeakers(meetingId, workspace.id, user.id);
      return { confirmed: true };
    }
    const created = await this.pipeline.applySpeakerEdits({
      meetingId,
      workspaceId: workspace.id,
      actorId: user.id,
      baseVersion: dto.baseVersion,
      renames: dto.renames,
      merges: dto.merges,
      userLinks: dto.userLinks,
      confirm: dto.confirm,
    });
    return {
      version: created.version,
      kind: created.kind,
      status: created.status,
    };
  }

  // ---- documents ----

  @Get(':id/documents')
  async listDocuments(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    return this.intelRepo.listDocuments(meetingId);
  }

  @Post(':id/documents/:documentId/publish')
  @HttpCode(HttpStatus.OK)
  async publishDocument(
    @Param('id') meetingId: string,
    @Param('documentId') documentId: string,
    @Body() dto: PublishDocumentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const meeting = await this.requireOwnedMeeting(
      meetingId,
      workspace.id,
      user.id,
    );
    const { pageId, document } = await this.documents.publish({
      meeting,
      documentId,
      workspaceId: workspace.id,
      user,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId ?? null,
    });
    // First publish moves the meeting to published.
    if (meeting.status === 'awaiting_review') {
      await this.pipeline.transition(
        meetingId,
        workspace.id,
        'awaiting_review',
        'published',
        {
          actorId: user.id,
          detail: { pageId },
          extra: { publishedAt: new Date(), spaceId: dto.spaceId },
        },
      );
    }
    return { pageId, documentStatus: document.status };
  }

  // ---- proposals (Action Review) ----

  @Get(':id/proposals')
  async listProposals(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    return this.intelRepo.listProposals(meetingId, workspace.id);
  }

  @Post(':id/proposals/:proposalId/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  async approveProposal(
    @Param('id') meetingId: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: ApproveProposalDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const approved = await this.proposals.approve({
      proposalId,
      workspaceId: workspace.id,
      user,
      editedPayload: dto.payload,
      confirmRisk: dto.confirmRisk,
    });
    await this.pipeline.enqueue(
      QueueJob.MEETING_EXECUTE_PROPOSAL,
      `${proposalId}:${approved.decidedAt?.toString() ?? ''}`,
      { proposalId, workspaceId: workspace.id, actorId: user.id, meetingId },
    );
    return { status: approved.status };
  }

  @Post(':id/proposals/:proposalId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectProposal(
    @Param('id') meetingId: string,
    @Param('proposalId') proposalId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const rejected = await this.proposals.reject(
      proposalId,
      workspace.id,
      user,
    );
    return { status: rejected.status };
  }

  @Post(':id/proposals/approve-safe')
  @HttpCode(HttpStatus.OK)
  async approveSafe(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    const result = await this.proposals.approveSafe(
      meetingId,
      workspace.id,
      user,
    );
    for (const proposalId of result.approved) {
      await this.pipeline.enqueue(
        QueueJob.MEETING_EXECUTE_PROPOSAL,
        `${proposalId}:bulk`,
        { proposalId, workspaceId: workspace.id, actorId: user.id, meetingId },
      );
    }
    return result;
  }

  // ---- audio ----

  @Get(':id/audio')
  async audioUrl(
    @Param('id') meetingId: string,
    @Query() query: AudioUrlQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const meeting = await this.requireOwnedMeeting(
      meetingId,
      workspace.id,
      user.id,
    );
    const url = await this.storage.getPresignedAudioUrl(
      meeting,
      query.target ?? 'original',
      PLAYBACK_URL_TTL_SECONDS,
    );
    if (!url) throw new NotFoundException('No audio stored for this meeting');
    await this.intelRepo.insertEvent({
      meetingId,
      event: 'user_action',
      fromStatus: null,
      toStatus: null,
      detail: { action: 'audio-url-issued', target: query.target ?? 'original' } as never,
      actorId: user.id,
    });
    return { url, expiresIn: PLAYBACK_URL_TTL_SECONDS };
  }

  // ---- deletion ----

  @Post(':id/delete')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireOwnedMeeting(meetingId, workspace.id, user.id);
    await this.pipeline.requestDeletion(meetingId, workspace.id, user.id);
    return { status: 'deletion_pending' };
  }

  private async requireOwnedMeeting(
    meetingId: string,
    workspaceId: string,
    userId: string,
  ) {
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting || meeting.userId !== userId) {
      throw new NotFoundException('Meeting not found');
    }
    return meeting;
  }
}
