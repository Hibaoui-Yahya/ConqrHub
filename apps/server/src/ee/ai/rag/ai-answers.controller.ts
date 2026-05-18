import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { RagRetrievalService, RetrievedContext } from './rag-retrieval.service';
import { AiProviderService, StreamTextResult } from '../providers/ai-provider.service';
import { AiAnswersDto } from './dto/ai-answers.dto';

const MAX_OUTPUT_TOKENS = 1024;
const RAG_TEMPERATURE = 0.2;

@UseGuards(JwtAuthGuard)
@Controller('ai/answers')
export class AiAnswersController {
  private readonly logger = new Logger(AiAnswersController.name);

  constructor(
    private readonly retrieval: RagRetrievalService,
    private readonly aiProvider: AiProviderService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async answers(
    @Body() dto: AiAnswersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    if (!this.aiProvider.isAvailable()) {
      throw new ServiceUnavailableException('AI is not configured');
    }

    const context = await this.retrieval.retrieve({
      question: dto.query,
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
    });

    const { system, prompt } = buildAnswersPrompt(dto.query, context);

    const stream = this.aiProvider.stream({
      system,
      prompt,
      temperature: RAG_TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    try {
      // Send sources first as a separate SSE event
      if (context.chunks.length > 0) {
        const sources = context.chunks.map((c) => ({
          pageId: c.sourceId,
          title: c.title ?? 'Untitled',
          kind: c.kind,
          score: c.score,
          excerpt: c.chunkText.slice(0, 200),
          label: c.label,
        }));
        reply.raw.write(`data: ${JSON.stringify({ sources })}\n\n`);
      }

      for await (const delta of stream.textStream) {
        if (delta) {
          reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`AI Answers stream failed: ${message}`);
      reply.raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
}

function buildAnswersPrompt(
  question: string,
  context: RetrievedContext,
): { system: string; prompt: string } {
  const system = context.isEmpty
    ? [
        'You are ConqrHub AI. No relevant content was found in the knowledge base for this question.',
        'Politely let the user know and suggest they try rephrasing or checking ConqrHub directly.',
      ].join(' ')
    : [
        'You are ConqrHub AI, an intelligent knowledge assistant.',
        'Answer the user\'s question using ONLY the context provided below.',
        'Cite sources inline using their labels (e.g. "[E1]" or "[P2]").',
        'If the context is insufficient, say so — do not invent facts.',
        'Be concise and helpful.',
      ].join(' ');

  const prompt = context.isEmpty
    ? `Question: ${question}`
    : `Context:\n${context.contextText}\n\nQuestion: ${question}`;

  return { system, prompt };
}
