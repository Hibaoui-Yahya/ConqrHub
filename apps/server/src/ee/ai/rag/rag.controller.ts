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
import { RagAnswerService } from './rag-answer.service';
import { AskDto } from './dto/ask.dto';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('retrieval')
@Controller('ai')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly service: RagAnswerService) {}

  @HttpCode(HttpStatus.OK)
  @Post('ask')
  async ask(@Body() dto: AskDto, @AuthUser() user: User) {
    const result = await this.service.ask(dto, user);
    return result;
  }

  @Post('ask/stream')
  async askStream(
    @Body() dto: AskDto,
    @AuthUser() user: User,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const stream = await this.service.askStream(dto, user);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    try {
      for await (const delta of stream.textStream) {
        if (delta) {
          reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`RAG stream failed: ${message}`);
      reply.raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
}
