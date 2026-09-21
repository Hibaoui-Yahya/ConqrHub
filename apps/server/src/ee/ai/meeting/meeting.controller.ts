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
import { ReviewSpeakersDto } from './dto/review-speakers.dto';
import { PublishDocumentDto } from './dto/publish-document.dto';
import { ApproveProposalDto } from './dto/approve-proposal.dto';

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300 MB uploaded recordings
const MAX_CHUNK_BYTES = 150 * 1024 * 1024; // live recorder chunk

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
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
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.list(workspace.id, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  // ──────────── GET /:id ────────────

  @HttpCode(HttpStatus.OK)
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.meetingService.getDetail(id);
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
      confirm: dto.confirm,
    });
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
  ) {
    return this.meetingService.publishDocument(id, docId, {
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
    });
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
  ) {
    return this.meetingService.approveProposal(id, pid, {
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
  ) {
    await this.meetingService.rejectProposal(id, pid);
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
