import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModelMessage, stepCountIs } from 'ai';
import { FastifyReply } from 'fastify';
import { User } from '@docmost/db/types/entity.types';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChatMessageRepo } from '@docmost/db/repos/ai-chat/ai-chat-message.repo';
import { AiProviderService } from '../providers/ai-provider.service';
import { AiChatTitleService } from './ai-chat-title.service';
import { ChatToolRegistry } from './tools/chat-tool.registry';
import { SendMessageDto } from './dto/send-message.dto';
import { PageService } from '../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';

const CHAT_TEMPERATURE = 0.4;
const CHAT_MAX_OUTPUT_TOKENS = 2048;
const CHAT_MAX_STEPS = 5;

const SYSTEM_PROMPT = [
  'You are ConqrHub AI, a helpful assistant built into a team wiki platform.',
  'You have access to tools to read and write the wiki.',
  '',
  'READ tools — use proactively when users ask about content:',
  '  search_pages: full-text search across all pages.',
  '  rag_retrieve: semantic/knowledge search (best for detailed Q&A).',
  '  get_page: fetch the full content of a page by its UUID.',
  '  list_recent_pages: pages recently edited across the workspace.',
  '  list_spaces: spaces the user belongs to.',
  '  list_space_pages: page tree inside a specific space.',
  '  get_page_breadcrumbs: ancestor path of a page.',
  '  get_space_info: metadata about a space.',
  '  get_page_comments: comments on a page.',
  '  get_page_history: revision history of a page.',
  '',
  'WRITE tools — only use when the user explicitly asks:',
  '  create_page: create a new wiki page (markdown content supported).',
  '  update_page_title: rename a page.',
  '  update_page_content: replace, append, or prepend page content (markdown).',
  '  move_page: move a page to a different parent.',
  '  create_comment: post a comment on a page.',
  '',
  'For write actions, briefly describe what you are about to do before calling the tool.',
  'Cite sources inline using their labels when you use retrieved content (e.g. [E1], [P2]).',
  'When no wiki content is relevant, answer from general knowledge and say so.',
  'Be concise and accurate.',
].join('\n');

// Minimal shape of a tool call accumulated during streaming for persistence.
interface AccumulatedToolCall {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
}

/**
 * Maps a grounded tool call result to a confidence score and source count.
 * For rag_retrieve tool results, scores from the returned chunks are averaged.
 * For search_pages, each result counts as a grounded source at a flat 0.75 score.
 */
function computeConfidence(toolCalls: AccumulatedToolCall[]): {
  groundedSourceCount: number;
  confidence: number | null;
} {
  const sourceIds = new Set<string>();
  const scores: number[] = [];

  for (const tc of toolCalls) {
    if (tc.name === 'rag_retrieve' && tc.result && typeof tc.result === 'object') {
      const r = tc.result as { chunks?: Array<{ sourceId: string; score: number }> };
      for (const chunk of r.chunks ?? []) {
        sourceIds.add(chunk.sourceId);
        scores.push(chunk.score);
      }
    } else if (tc.name === 'search_pages' && Array.isArray(tc.result)) {
      for (const item of tc.result as Array<{ id: string }>) {
        sourceIds.add(item.id);
        scores.push(0.75);
      }
    }
  }

  const groundedSourceCount = sourceIds.size;
  if (groundedSourceCount === 0) return { groundedSourceCount: 0, confidence: null };

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const confidence = Math.min(1, Math.max(0, avg));
  return { groundedSourceCount, confidence };
}

function sseWrite(reply: FastifyReply, data: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseError(
  reply: FastifyReply,
  message: string,
  code: string,
  retryable: boolean,
): void {
  sseWrite(reply, { type: 'error', message, code, retryable });
  reply.raw.write('data: [DONE]\n\n');
}

@Injectable()
export class AiChatStreamService {
  private readonly logger = new Logger(AiChatStreamService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly chatRepo: AiChatRepo,
    private readonly messageRepo: AiChatMessageRepo,
    private readonly titleService: AiChatTitleService,
    private readonly toolRegistry: ChatToolRegistry,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private async resolveReferencedPages(
    user: User,
    workspaceId: string,
    pageIds: string[],
  ): Promise<Array<{ id: string; title: string | null; spaceId: string }>> {
    const out: Array<{ id: string; title: string | null; spaceId: string }> =
      [];
    for (const id of pageIds) {
      try {
        const page = await this.pageService.findById(id);
        if (!page || (page as any).workspaceId !== workspaceId) continue;
        const ability = await this.spaceAbility.createForUser(
          user,
          page.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) continue;
        out.push({ id: page.id, title: page.title ?? null, spaceId: page.spaceId });
      } catch {
        // Page not found or not accessible — silently drop per the plan.
      }
    }
    return out;
  }

  async send(
    dto: SendMessageDto,
    user: User,
    reply: FastifyReply,
  ): Promise<void> {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    if (!this.aiProvider.isAvailable()) {
      sseError(reply, 'AI is not configured', 'ai_unavailable', true);
      return;
    }

    try {
      await this.stream(dto, user, reply);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        sseError(reply, err.message, 'ai_unavailable', true);
      } else if (err instanceof ForbiddenException) {
        sseError(reply, err.message, 'forbidden', false);
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Chat stream error: ${message}`);
        sseError(reply, 'An internal error occurred', 'internal', true);
      }
    } finally {
      reply.raw.end();
    }
  }

  private async stream(
    dto: SendMessageDto,
    user: User,
    reply: FastifyReply,
  ): Promise<void> {
    // Resolve or create the chat.
    let chatId = dto.chatId;
    let isNewChat = false;
    if (!chatId) {
      const chat = await this.chatRepo.insert({
        workspaceId: user.workspaceId,
        creatorId: user.id,
      });
      chatId = chat.id;
      isNewChat = true;
      sseWrite(reply, { type: 'chat_created', chatId });
    }

    // Load message history (chronological, omitting metadata for model).
    // For assistant turns with tool-calls, AI SDK v6 requires a matching
    // `tool` role message containing tool-results — otherwise the next
    // streamText call rejects with MissingToolResultsError.
    const history = await this.messageRepo.listByChat(chatId, user.workspaceId);
    const modelMessages: ModelMessage[] = [];
    for (const m of history) {
      if (m.role === 'user') {
        modelMessages.push({ role: 'user', content: m.content ?? '' });
        continue;
      }
      const tcs =
        m.toolCalls && Array.isArray(m.toolCalls)
          ? (m.toolCalls as unknown as AccumulatedToolCall[])
          : [];
      // Only replay tool-calls that completed (have a result). An interrupted
      // turn from a previous error would otherwise poison the next request.
      const completed = tcs.filter((tc) => tc.result !== undefined);
      if (completed.length === 0) {
        modelMessages.push({ role: 'assistant', content: m.content ?? '' });
        continue;
      }
      modelMessages.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
          ...completed.map((tc) => ({
            type: 'tool-call' as const,
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.args,
          })),
        ],
      } as unknown as ModelMessage);
      modelMessages.push({
        role: 'tool',
        content: completed.map((tc) => ({
          type: 'tool-result' as const,
          toolCallId: tc.id,
          toolName: tc.name,
          output: { type: 'json' as const, value: tc.result as any },
        })),
      } as unknown as ModelMessage);
    }

    // Build the user message content (with optional page mentions as context prefix).
    const userContent = dto.content;

    // Persist the user message row (raw content; mentions go into metadata).
    const userMsg = await this.messageRepo.insert({
      chatId,
      workspaceId: user.workspaceId,
      userId: user.id,
      role: 'user',
      content: userContent,
      metadata: {
        ...(dto.mentionedPageIds?.length
          ? { mentionedPageIds: dto.mentionedPageIds }
          : {}),
        ...(dto.contextPageId ? { contextPageId: dto.contextPageId } : {}),
        ...(dto.attachmentIds?.length
          ? { attachmentIds: dto.attachmentIds }
          : {}),
      },
    });

    // Resolve mentions/contextPage to titles+ids the user can actually Read.
    const referenceIds = [
      ...(dto.contextPageId ? [dto.contextPageId] : []),
      ...(dto.mentionedPageIds ?? []),
    ];
    const refs = referenceIds.length
      ? await this.resolveReferencedPages(
          user,
          user.workspaceId,
          referenceIds,
        )
      : [];

    let modelUserContent = userContent;
    if (refs.length > 0) {
      const refBlock = refs
        .map((r) => `- ${r.title ?? '(untitled)'} (pageId: ${r.id})`)
        .join('\n');
      modelUserContent = `Referenced pages:\n${refBlock}\n\n${userContent}`;
    }

    // Add the new user message to the model context.
    modelMessages.push({ role: 'user', content: modelUserContent });

    // Build tools context.
    const toolCtx = { user, workspaceId: user.workspaceId };
    const tools = this.toolRegistry.toAiSdkTools(toolCtx);

    // Call the model.
    const stream = this.aiProvider.chat({
      messages: modelMessages,
      system: SYSTEM_PROMPT,
      tools,
      temperature: CHAT_TEMPERATURE,
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(CHAT_MAX_STEPS),
    });

    // Iterate the full event stream.
    let textBuffer = '';
    const toolCalls: AccumulatedToolCall[] = [];
    // Track partial tool call input accumulation.
    const partialToolInputs: Record<string, string> = {};

    for await (const part of stream.fullStream) {
      switch (part.type) {
        case 'text-delta':
          textBuffer += part.text;
          sseWrite(reply, { type: 'content', text: part.text });
          break;

        case 'tool-input-start':
          partialToolInputs[part.id] = '';
          break;

        case 'tool-input-delta':
          if (part.id in partialToolInputs) {
            partialToolInputs[part.id] += part.delta;
          }
          break;

        case 'tool-call': {
          const tc: AccumulatedToolCall = {
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          };
          toolCalls.push(tc);
          sseWrite(reply, {
            type: 'tool_call',
            id: tc.id,
            name: tc.name,
            args: tc.args,
          });
          break;
        }

        case 'tool-result': {
          const tc = toolCalls.find((t) => t.id === part.toolCallId);
          if (tc) tc.result = part.output;
          sseWrite(reply, {
            type: 'tool_result',
            id: part.toolCallId,
            result: part.output,
          });
          break;
        }

        case 'error': {
          const message =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          throw new Error(message);
        }

        // finish and other parts are silently consumed.
      }
    }

    // Compute confidence signals from grounded tool calls.
    const { groundedSourceCount, confidence } = computeConfidence(toolCalls);

    // Persist the assistant message.
    const assistantMsg = await this.messageRepo.insert({
      chatId,
      workspaceId: user.workspaceId,
      userId: null,
      role: 'assistant',
      content: textBuffer || null,
      toolCalls: toolCalls.length ? (toolCalls as unknown as any) : null,
      confidence: confidence ?? undefined,
      groundedSourceCount: groundedSourceCount || undefined,
      metadata: null,
    });

    sseWrite(reply, {
      type: 'done',
      messageId: assistantMsg.id,
    });
    reply.raw.write('data: [DONE]\n\n');

    // Fire-and-forget title generation on first exchange.
    const isFirstExchange =
      isNewChat || (await this.messageRepo.countByChat(chatId, user.workspaceId)) <= 2;
    if (isFirstExchange && !(await this.chatRepo.hasTitleSet(chatId, user.workspaceId))) {
      void this.titleService.generate(chatId, user.workspaceId, userContent);
    }
  }
}
