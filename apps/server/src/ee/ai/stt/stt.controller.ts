import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
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
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { SttService, SttContext } from './stt.service';
import { SttContextDto } from './dto/stt-context.dto';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('stt')
@Controller('ai')
export class SttController {
  private readonly logger = new Logger(SttController.name);

  constructor(
    private readonly stt: SttService,
    private readonly env: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('stt')
  async transcribe(
    @Req() req: FastifyRequest,
    @AuthUser() _user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!this.env.getAiSttEnabled()) {
      throw new ServiceUnavailableException({
        code: 'STT_DISABLED',
        message: 'Speech-to-text is disabled',
      });
    }

    if (!req.isMultipart()) {
      throw new BadRequestException('Expected multipart/form-data');
    }

    let fileData: any;
    try {
      fileData = await (req as any).file({
        limits: { fileSize: MAX_AUDIO_BYTES, fields: 4, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('Audio too large (max 5MB)');
      }
      throw new BadRequestException('Failed to process audio upload');
    }

    if (!fileData) {
      throw new BadRequestException('No audio file provided');
    }

    const mime = (fileData.mimetype ?? '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new UnsupportedMediaTypeException(`Unsupported audio mime: ${mime}`);
    }

    const buffer: Buffer = await fileData.toBuffer();
    if (buffer.length === 0) {
      throw new BadRequestException('Empty audio file');
    }

    const rawContext = fileData.fields?.context?.value;
    let context: SttContext;
    try {
      const parsed =
        typeof rawContext === 'string' ? JSON.parse(rawContext) : rawContext;
      const dto = plainToInstance(SttContextDto, parsed);
      const errs = validateSync(dto, { whitelist: true });
      if (errs.length > 0) {
        throw new BadRequestException('Invalid context payload');
      }
      context = dto;
    } catch {
      throw new BadRequestException('Invalid context payload');
    }

    const result = await this.stt.transcribeAndCorrect(
      buffer,
      mime,
      context,
      workspace.id,
      workspace.name ?? '',
    );

    this.logger.log(
      `STT ok user=${_user.id} ws=${workspace.id} kind=${context.kind} bytes=${buffer.length} ms=${result.durationMs}`,
    );

    return result;
  }
}
