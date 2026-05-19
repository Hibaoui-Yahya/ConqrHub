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
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { MeetingService } from './meeting.service';
import {
  ChunkMetaDto,
  ListMeetingsQueryDto,
  SaveAiOutputDto,
  StartMeetingDto,
} from './dto/meeting.dto';

// 25 MB — matches the Mistral /v1/audio/transcriptions limit. The
// recorder uploads the entire meeting as one file at stop, so the
// limit equates to roughly 50 minutes of 64 kbps audio per source.
const MAX_CHUNK_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('meeting')
@Controller('ai/meeting')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(private readonly meetingService: MeetingService) {}

  @HttpCode(HttpStatus.OK)
  @Post('start')
  async start(
    @Body() dto: StartMeetingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const meeting = await this.meetingService.start(
      workspace.id,
      user.id,
      dto.title,
    );
    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      startedAt: meeting.startedAt,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/chunk')
  async chunk(
    @Param('id') meetingId: string,
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
        limits: { fileSize: MAX_CHUNK_BYTES, fields: 8, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('Audio chunk too large');
      }
      throw new BadRequestException('Failed to process audio chunk');
    }

    if (!fileData) {
      throw new BadRequestException('No audio chunk provided');
    }

    const mime = (fileData.mimetype ?? '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`Unsupported audio mime: ${mime}`);
    }

    const buffer: Buffer = await fileData.toBuffer();
    if (buffer.length === 0) {
      throw new BadRequestException('Empty audio chunk');
    }

    const meta = {
      source: fileData.fields?.source?.value,
      sequence: Number(fileData.fields?.sequence?.value),
      startMs: Number(fileData.fields?.startMs?.value),
      durationMs: Number(fileData.fields?.durationMs?.value),
    };
    const dto = plainToInstance(ChunkMetaDto, meta);
    const errs = validateSync(dto, { whitelist: true });
    if (errs.length > 0) {
      throw new BadRequestException('Invalid chunk metadata');
    }

    const result = await this.meetingService.ingestChunk({
      meetingId,
      workspaceId: workspace.id,
      userId: user.id,
      audio: buffer,
      mime,
      source: dto.source,
      sequence: dto.sequence,
      startMs: dto.startMs,
      durationMs: dto.durationMs,
      workspaceName: workspace.name ?? '',
    });

    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/stop')
  async stop(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const endedAtMs = Date.now();
    const meeting = await this.meetingService.stop(
      meetingId,
      workspace.id,
      user.id,
      endedAtMs,
    );
    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      transcript: meeting.transcript,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      durationMs: meeting.durationMs,
    };
  }

  @Get(':id')
  async get(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.meetingService.getWithSegments(
      meetingId,
      workspace.id,
      user.id,
    );
  }

  @Get()
  async list(
    @Query() query: ListMeetingsQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    return this.meetingService.list(workspace.id, user.id, { limit, offset });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') meetingId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.meetingService.softDelete(meetingId, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/ai-output')
  async saveAiOutput(
    @Param('id') meetingId: string,
    @Body() dto: SaveAiOutputDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.logger.log(
      `ai-output save mid=${meetingId} key=${dto?.key} valueLen=${dto?.value?.length ?? 'undef'} typeofKey=${typeof dto?.key} typeofValue=${typeof dto?.value}`,
    );
    return this.meetingService.saveAiOutput(
      meetingId,
      workspace.id,
      user.id,
      dto.key,
      dto.value,
    );
  }
}
