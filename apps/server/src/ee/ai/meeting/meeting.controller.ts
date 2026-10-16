import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { MeetingService } from './meeting.service';
import type { MeetingActor } from './meeting-access.util';
import { StartMeetingDto } from './dto/start-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { AiOutputDto } from './dto/ai-output.dto';
import { ProcessMeetingDto } from './dto/process-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { SaveMarkersDto } from './dto/save-markers.dto';
import { PublishBundleDto } from './dto/publish-bundle.dto';
import { MeetingAccessGuard } from './meeting-access.guard';
import { GenerateEvaluationDto, SaveEvaluationDto } from './dto/evaluation.dto';
import { ReviewMeetingDto } from './dto/review-meeting.dto';
import { AttributeSpeakersDto } from './dto/attribute-speakers.dto';
import { LinkableMembersDto, ReviewSpeakersDto } from './dto/review-speakers.dto';
import { PublishDocumentDto } from './dto/publish-document.dto';
import { ApproveProposalDto } from './dto/approve-proposal.dto';
import { StopMeetingDto } from './dto/stop-meeting.dto';
import { ListInsightsDto, SaveInsightDto } from './dto/meeting-insight.dto';
import { MAX_CHUNK_BYTES } from './meeting-capture.util';

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300 MB uploaded recordings

/** Every route works in the caller's workspace with the caller's role:
 *  members read every meeting of the company; the creator and
 *  Owners/Admins change it (LTC-03). */
function actor(user: User, workspace: Workspace): MeetingActor {
  return { id: user.id, role: user.role, workspaceId: workspace.id };
}

// MeetingAccessGuard: every /:id route answers 404 unless the meeting is a
// live meeting of the caller's company (company-wide read, LTC-03).
@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard, MeetingAccessGuard)
@RequireAiFeature('stt')
@Controller('ai/meeting')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(private readonly meetingService: MeetingService) {}

  // ──────────── POST /start ────────────

  @HttpCode(HttpStatus.CREATED)
  @Post('start')
  async start(
    @Body() dto: StartMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.start(workspace.id, user.id, {
      title: dto.title,
      consent: dto.consent,
      meetingType: dto.meetingType,
      languageConfig: dto.languageConfig,
      templateId: dto.templateId,
    });
  }

  // ──────────── POST /upload ────────────

  @HttpCode(HttpStatus.CREATED)
  @Post('upload')
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
        limits: { fileSize: MAX_UPLOAD_BYTES, fields: 10, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('Audio too large (max 300MB)');
      }
      throw new BadRequestException('Failed to process audio upload');
    }

    if (!fileData) {
      throw new BadRequestException('No file provided');
    }

    const file: Buffer = await fileData.toBuffer();
    const filename = fileData.filename || 'meeting.webm';
    const fields = fileData.fields || {};

    return this.meetingService.upload(workspace.id, user.id, file, filename, {
      consent: fields.consent?.value === 'true',
      title: fields.title?.value,
      meetingType: fields.meetingType?.value,
      templateId: fields.templateId?.value,
      languageConfig: fields.languageConfig
        ? JSON.parse(fields.languageConfig.value)
        : undefined,
      autoProcess: fields.autoProcess?.value === 'true',
      mime: fileData.mimetype,
    });
  }

  // ──────────── POST /:id/chunk ────────────

  @HttpCode(HttpStatus.CREATED)
  @Post(':id/chunk')
  async chunk(
    @Param('id') id: string,
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
        limits: { fileSize: MAX_CHUNK_BYTES, fields: 10, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          'Ce morceau audio dépasse 150 Mo : envoyez des morceaux plus courts.',
        );
      }
      throw new BadRequestException('Le morceau audio n’a pas pu être lu.');
    }

    if (!fileData) {
      throw new BadRequestException('Aucun fichier audio dans la requête.');
    }

    const file: Buffer = await fileData.toBuffer();
    const fields = fileData.fields || {};

    return this.meetingService.ingestChunk(actor(user, workspace), id, file, {
      source: fields.source?.value || 'mic',
      sequence: Number(fields.sequence?.value || 0),
      startMs: Number(fields.startMs?.value || 0),
      durationMs: Number(fields.durationMs?.value || 0),
      mime: fileData.mimetype,
      continuation: fields.continuation?.value === 'true',
      replace: fields.replace?.value === 'true',
    });
  }

  // ──────────── GET /:id/capture (resume a live recording) ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/capture')
  async capture(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.getCaptureState(actor(user, workspace), id);
  }

  // ──────────── POST /:id/stop ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/stop')
  async stop(
    @Param('id') id: string,
    @Body() dto: StopMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.stop(actor(user, workspace), id, {
      allowGaps: dto?.allowGaps,
      expectedLastSequence: dto?.expectedLastSequence
        ? { ...dto.expectedLastSequence }
        : undefined,
    });
  }

  // ──────────── GET / (list) ────────────

  @HttpCode(HttpStatus.OK)
  @Get()
  async list(
    @Query() query: ListMeetingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.list(
      workspace.id,
      {
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        // Home: only the caller's own meetings; otherwise company-wide.
        mine: query.scope === 'mine',
        type: query.type,
        status: query.status,
        from: query.from,
        to: query.to,
        ownerId: query.ownerId,
        archived: query.archived,
      },
      actor(user, workspace),
    );
  }

  // ──────────── GET /:id ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id')
  async get(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.getDetail(actor(user, workspace), id);
  }

  // ──────────── PATCH /:id (editable metadata) ────────────

  @HttpCode(HttpStatus.OK)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.update(actor(user, workspace), id, {
      title: dto.title,
    });
  }

  // ──────────── POST /:id/archive · /:id/unarchive (not a deletion) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.archive(actor(user, workspace), id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/unarchive')
  async unarchive(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.unarchive(actor(user, workspace), id);
  }

  // ──────────── POST /:id/markers (moments marked while recording) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/markers')
  async saveMarkers(
    @Param('id') id: string,
    @Body() dto: SaveMarkersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveMarkers(
      actor(user, workspace),
      id,
      dto.markers,
    );
  }

  // ──────────── DELETE /:id ────────────

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.meetingService.delete(actor(user, workspace), id);
  }

  // ──────────── POST /:id/ai-output ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/ai-output')
  async saveAiOutput(
    @Param('id') id: string,
    @Body() dto: AiOutputDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveAiOutput(
      actor(user, workspace),
      id,
      dto.key,
      dto.value,
    );
  }

  // ──────────── saved AI insights (communication analysis, Q&A) ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/insights')
  async listInsights(
    @Param('id') id: string,
    @Query() query: ListInsightsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.listInsights(actor(user, workspace), id, query?.kind);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post(':id/insights')
  async saveInsight(
    @Param('id') id: string,
    @Body() dto: SaveInsightDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveInsight(actor(user, workspace), id, {
      kind: dto.kind,
      question: dto.question,
      content: dto.content,
      transcriptVersion: dto.transcriptVersion,
    });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/insights/:insightId')
  async deleteInsight(
    @Param('id') id: string,
    @Param('insightId') insightId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.meetingService.deleteInsight(actor(user, workspace), id, insightId);
  }

  // ──────────── POST /:id/process ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/process')
  async process(
    @Param('id') id: string,
    @Body() dto: ProcessMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.process(actor(user, workspace), id, {
      meetingType: dto.meetingType,
      languageConfig: dto.languageConfig,
      force: dto.force,
    });
  }

  // ──────────── POST /:id/retry ("Relancer le traitement") ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/retry')
  async retry(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.retryProcessing(actor(user, workspace), id);
  }

  // ──────────── GET /:id/status ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/status')
  async status(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.getStatus(actor(user, workspace), id);
  }

  // ──────────── GET /:id/transcript ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/transcript')
  async transcript(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Query('version') version?: string,
  ) {
    const v = version === 'latest' || !version ? 'latest' : Number(version);
    return this.meetingService.getTranscript(actor(user, workspace), id, v);
  }

  // ──────────── POST /:id/transcript/speakers ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/transcript/speakers')
  async reviewSpeakers(
    @Param('id') id: string,
    @Body() dto: ReviewSpeakersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.reviewSpeakers(actor(user, workspace), id, {
      baseVersion: dto.baseVersion,
      renames: dto.renames,
      merges: dto.merges,
      userLinks: dto.userLinks,
      reassign: dto.reassign,
      confirm: dto.confirm,
    });
  }

  // ──────────── GET /:id/linkable-members (speaker ↔ member links) ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/linkable-members')
  async linkableMembers(
    @Param('id') id: string,
    @Query() query: LinkableMembersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.listLinkableMembers(actor(user, workspace), id, {
      q: query?.q,
      limit: query?.limit,
    });
  }

  // ──────────── POST /:id/transcript/attribute (AI turn attribution proposal) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/transcript/attribute')
  async attributeSpeakers(
    @Param('id') id: string,
    @Body() dto: AttributeSpeakersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.attributeSpeakers(
      actor(user, workspace),
      id,
      dto.baseVersion,
    );
  }

  // ──────────── GET /:id/documents ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/documents')
  async listDocuments(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.listDocuments(actor(user, workspace), id);
  }

  // ──────────── POST /:id/documents/:docId/publish ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/documents/:docId/publish')
  async publishDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: PublishDocumentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.publishDocument(user, workspace.id, id, docId, {
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
    });
  }

  // ──────────── POST /:id/publish-bundle ("Publier dans Hub") ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/publish-bundle')
  async publishBundle(
    @Param('id') id: string,
    @Body() dto: PublishBundleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.publishBundle(
      workspace.id,
      id,
      {
        spaceId: dto.spaceId,
        parentPageId: dto.parentPageId,
        includeTranscript: dto.includeTranscript,
      },
      user,
    );
  }

  // ──────────── competency evaluation (recruitment interviews) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/evaluation/generate')
  async generateEvaluation(
    @Param('id') id: string,
    @Body() dto: GenerateEvaluationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.generateEvaluation(
      actor(user, workspace),
      id,
      dto.criteria,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/evaluation')
  async saveEvaluation(
    @Param('id') id: string,
    @Body() dto: SaveEvaluationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveEvaluation(actor(user, workspace), id, dto);
  }

  // ──────────── GET /:id/proposals ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/proposals')
  async listProposals(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.listProposals(actor(user, workspace), id);
  }

  // ──────────── POST /:id/proposals/:pid/approve ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/:pid/approve')
  async approveProposal(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Body() dto: ApproveProposalDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.approveProposal(actor(user, workspace), id, pid, {
      payload: dto.payload,
      confirmRisk: dto.confirmRisk,
    });
  }

  // ──────────── POST /:id/proposals/:pid/reject ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/:pid/reject')
  async rejectProposal(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.meetingService.rejectProposal(actor(user, workspace), id, pid);
  }

  // ──────────── POST /:id/review (close / reopen the review stage) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/review')
  async reviewMeeting(
    @Param('id') id: string,
    @Body() dto: ReviewMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.reviewMeeting(
      actor(user, workspace),
      id,
      dto.action,
    );
  }

  // ──────────── POST /:id/proposals/approve-safe ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/approve-safe')
  async approveSafeProposals(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.approveSafeProposals(actor(user, workspace), id);
  }

  // ──────────── GET /:id/audio ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/audio')
  async getAudio(
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Query('target') target?: string,
  ) {
    return this.meetingService.getAudioUrl(
      actor(user, workspace),
      id,
      target || 'original',
    );
  }

  // ──────────── GET /:id/audio/file (auth-protected audio stream) ────────────

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get(':id/audio/file')
  async streamAudio(
    @Param('id') id: string,
    @Query('target') target: string | undefined,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() reply: FastifyReply,
  ) {
    const { stream, mime } = await this.meetingService.getAudioFile(
      actor(user, workspace),
      id,
      target || 'original',
    );
    reply
      .header('Content-Type', mime)
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'no-store')
      .send(stream);
  }
}
