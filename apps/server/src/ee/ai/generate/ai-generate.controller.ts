import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AiGenerateService } from './ai-generate.service';
import { AiGenerateDto } from './dto/ai-generate.dto';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('generative')
@Controller('ai')
export class AiGenerateController {
  private readonly logger = new Logger(AiGenerateController.name);

  constructor(private readonly service: AiGenerateService) {}

  @HttpCode(HttpStatus.OK)
  @Post('generate')
  async generate(@Body() dto: AiGenerateDto) {
    const result = await this.service.generate(dto);
    return {
      text: result.text,
      action: result.action,
      usage:
        result.totalTokens !== undefined
          ? { totalTokens: result.totalTokens }
          : undefined,
    };
  }

  @Post('generate/stream')
  async generateStream(
    @Body() dto: AiGenerateDto,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const { result } = this.service.stream(dto);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    try {
      for await (const delta of result.textStream) {
        if (delta) {
          reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`AI stream failed: ${message}`);
      reply.raw.write(
        `data: ${JSON.stringify({ error: message })}\n\n`,
      );
    } finally {
      reply.raw.end();
    }
  }
}
