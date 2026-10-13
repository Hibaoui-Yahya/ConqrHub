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
import { StartMeetingDto } from './dto/start-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { AiOutputDto } from './dto/ai-output.dto';
import { ProcessMeetingDto } from './dto/process-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { SaveMarkersDto } from './dto/save-markers.dto';
import { PublishBundleDto } from './dto/publish-bundle.dto';
import { MeetingAccessGuard } from './meeting-access.guard';
import { isWorkspaceManager } from './meeting-access.util';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GenerateEvaluationDto, SaveEvaluationDto } from './dto/evaluation.dto';
import { ReviewMeetingDto } from './dto/review-meeting.dto';
import { AttributeSpeakersDto } from './dto/attribute-speakers.dto';
import { ReviewSpeakersDto } from './dto/review-speakers.dto';
import { PublishDocumentDto } from './dto/publish-document.dto';
import { ApproveProposalDto } from './dto/approve-proposal.dto';

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300 MB uploaded recordings
const MAX_CHUNK_BYTES = 150 * 1024 * 1024; // live recorder chunk

// MeetingAccessGuard: every /:id route answers 404 unless the caller may
// read that meeting (author, member of its space, workspace manager).
@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard, MeetingAccessGuard)
@RequireAiFeature('stt')
@Controller('ai/meeting')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(
    private readonly meetingService: MeetingService,
    private readonly spaceMembers: SpaceMemberRepo,
  ) {}

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
        throw new BadRequestException('Audio chunk too large');
      }
      throw new BadRequestException('Failed to process audio chunk');
    }

    if (!fileData) {
      throw new BadRequestException('No audio file provided');
    }

    const file: Buffer = await fileData.toBuffer();
    const fields = fileData.fields || {};

    return this.meetingService.ingestChunk(id, file, {
      source: fields.source?.value || 'mic',
      sequence: Number(fields.sequence?.value || 0),
      startMs: Number(fields.startMs?.value || 0),
      durationMs: Number(fields.durationMs?.value || 0),
      mime: fileData.mimetype,
    });
  }

  // ──────────── POST /:id/stop ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    return this.meetingService.stop(id);
  }

  // ──────────── GET / (list) ────────────

  @HttpCode(HttpStatus.OK)
  @Get()
  async list(
    @Query() query: ListMeetingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const isManager = isWorkspaceManager(user.role);
    return this.meetingService.list(workspace.id, {
      limit: query.limit,
      offset: query.offset,
      q: query.q,
      mine: query.scope === 'mine',
      viewer: {
        id: user.id,
        isManager,
        spaceIds: isManager ? [] : await this.spaceMembers.getUserSpaceIds(user.id),
      },
    });
  }

  // ──────────── GET /:id ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.meetingService.getDetail(id);
  }

  // ──────────── PATCH /:id (editable metadata) ────────────

  @HttpCode(HttpStatus.OK)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetingService.update(id, { title: dto.title });
  }

  // ──────────── POST /:id/markers (moments marked while recording) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/markers')
  async saveMarkers(
    @Param('id') id: string,
    @Body() dto: SaveMarkersDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveMarkers(workspace.id, id, dto.markers);
  }

  // ──────────── DELETE /:id ────────────

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.meetingService.delete(id);
  }

  // ──────────── POST /:id/ai-output ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/ai-output')
  async saveAiOutput(
    @Param('id') id: string,
    @Body() dto: AiOutputDto,
  ) {
    return this.meetingService.saveAiOutput(id, dto.key, dto.value);
  }

  // ──────────── POST /:id/process ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/process')
  async process(
    @Param('id') id: string,
    @Body() dto: ProcessMeetingDto,
  ) {
    return this.meetingService.process(id, {
      meetingType: dto.meetingType,
      languageConfig: dto.languageConfig,
      force: dto.force,
    });
  }

  // ──────────── GET /:id/status ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/status')
  async status(@Param('id') id: string) {
    return this.meetingService.getStatus(id);
  }

  // ──────────── GET /:id/transcript ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/transcript')
  async transcript(
    @Param('id') id: string,
    @Query('version') version?: string,
  ) {
    const v = version === 'latest' || !version ? 'latest' : Number(version);
    return this.meetingService.getTranscript(id, v);
  }

  // ──────────── POST /:id/transcript/speakers ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/transcript/speakers')
  async reviewSpeakers(
    @Param('id') id: string,
    @Body() dto: ReviewSpeakersDto,
  ) {
    return this.meetingService.reviewSpeakers(id, {
      baseVersion: dto.baseVersion,
      renames: dto.renames,
      merges: dto.merges,
      userLinks: dto.userLinks,
      reassign: dto.reassign,
      confirm: dto.confirm,
    });
  }

  // ──────────── POST /:id/transcript/attribute (AI turn attribution proposal) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/transcript/attribute')
  async attributeSpeakers(
    @Param('id') id: string,
    @Body() dto: AttributeSpeakersDto,
  ) {
    return this.meetingService.attributeSpeakers(id, dto.baseVersion);
  }

  // ──────────── GET /:id/documents ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/documents')
  async listDocuments(@Param('id') id: string) {
    return this.meetingService.listDocuments(id);
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
    await this.meetingService.assertMeetingInWorkspace(id, workspace.id);
    await this.meetingService.assertCanPublishIn(user, workspace.id, dto.spaceId);
    return this.meetingService.publishDocument(id, docId, {
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
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.generateEvaluation(workspace.id, id, dto.criteria);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/evaluation')
  async saveEvaluation(
    @Param('id') id: string,
    @Body() dto: SaveEvaluationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.saveEvaluation(workspace.id, id, dto, user.id);
  }

  // ──────────── GET /:id/proposals ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/proposals')
  async listProposals(@Param('id') id: string) {
    return this.meetingService.listProposals(id);
  }

  // ──────────── POST /:id/proposals/:pid/approve ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/:pid/approve')
  async approveProposal(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Body() dto: ApproveProposalDto,
    @AuthUser() user: User,
  ) {
    return this.meetingService.approveProposal(id, pid, {
      payload: dto.payload,
      confirmRisk: dto.confirmRisk,
      actorId: user.id,
    });
  }

  // ──────────── POST /:id/proposals/:pid/reject ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/:pid/reject')
  async rejectProposal(
    @Param('id') id: string,
    @Param('pid') pid: string,
  ) {
    await this.meetingService.rejectProposal(id, pid);
  }

  // ──────────── POST /:id/review (close / reopen the review stage) ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/review')
  async reviewMeeting(
    @Param('id') id: string,
    @Body() dto: ReviewMeetingDto,
    @AuthUser() user: User,
  ) {
    return this.meetingService.reviewMeeting(id, dto.action, user.id);
  }

  // ──────────── POST /:id/proposals/approve-safe ────────────

  @HttpCode(HttpStatus.OK)
  @Post(':id/proposals/approve-safe')
  async approveSafeProposals(@Param('id') id: string) {
    return this.meetingService.approveSafeProposals(id);
  }

  // ──────────── GET /:id/audio ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id/audio')
  async getAudio(
    @Param('id') id: string,
    @Query('target') target?: string,
  ) {
    return this.meetingService.getAudioUrl(id, target || 'original');
  }

  // ──────────── GET /:id/audio/file (auth-protected audio stream) ────────────

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get(':id/audio/file')
  async streamAudio(
    @Param('id') id: string,
    @Query('target') target: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const { stream, mime } = await this.meetingService.getAudioFile(
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
