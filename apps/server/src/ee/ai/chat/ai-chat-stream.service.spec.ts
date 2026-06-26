jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AiChatStreamService } from './ai-chat-stream.service';
import { AiProviderService } from '../providers/ai-provider.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChatMessageRepo } from '@docmost/db/repos/ai-chat/ai-chat-message.repo';
import { AiChatTitleService } from './ai-chat-title.service';
import { ChatToolRegistry } from './tools/chat-tool.registry';
import { SendMessageDto } from './dto/send-message.dto';
import { AiChat, AiChatMessage } from '@docmost/db/types/entity.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS = 'ws-1';
const USER: any = { id: 'user-1', workspaceId: WS };

// Captures everything written to SSE via reply.raw.write.
function makeFakeReply(): {
  reply: any;
  events: string[];
  ended: boolean;
} {
  const events: string[] = [];
  let ended = false;
  const raw = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => events.push(chunk)),
    end: jest.fn(() => { ended = true; }),
  };
  return { reply: { raw }, events, get ended() { return ended; } };
}

function parseSseEvents(rawWrites: string[]): Array<any> {
  const parsed: any[] = [];
  for (const w of rawWrites) {
    if (w === 'data: [DONE]\n\n') {
      parsed.push({ type: '__DONE__' });
      continue;
    }
    if (w.startsWith('data: ')) {
      try {
        parsed.push(JSON.parse(w.slice(6)));
      } catch {
        // skip
      }
    }
  }
  return parsed;
}

// Creates a fake fullStream async iterable from a list of stream parts.
async function* fakeFullStream(parts: any[]) {
  for (const part of parts) {
    yield part;
  }
}

function makeAiProvider(
  parts: any[] = [
    { type: 'text-delta', id: 't1', text: 'Hello ' },
    { type: 'text-delta', id: 't2', text: 'world' },
    { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 10 } },
  ],
  available = true,
): jest.Mocked<Pick<AiProviderService, 'isAvailable' | 'chat'>> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    chat: jest.fn().mockReturnValue({
      fullStream: fakeFullStream(parts),
    }),
  } as any;
}

function makeChat(id = 'chat-1'): AiChat {
  return {
    id,
    workspaceId: WS,
    creatorId: USER.id,
    title: null,
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
    deletedAt: null,
  } as AiChat;
}

function makeChatRepo(existing?: AiChat): jest.Mocked<AiChatRepo> {
  return {
    insert: jest.fn().mockResolvedValue(makeChat()),
    findById: jest.fn().mockImplementation(async (id, wsId) =>
      existing && existing.id === id && existing.workspaceId === wsId
        ? existing
        : undefined,
    ),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    hasTitleSet: jest.fn().mockResolvedValue(false),
    listByCreator: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
  } as any;
}

function makeMessageRepo(history: AiChatMessage[] = []): jest.Mocked<AiChatMessageRepo> {
  return {
    listByChat: jest.fn().mockResolvedValue(history),
    insert: jest.fn().mockImplementation(async (vals) => ({
      id: 'msg-new',
      role: vals.role,
      content: vals.content,
      chatId: vals.chatId,
      workspaceId: vals.workspaceId,
      toolCalls: vals.toolCalls ?? null,
      confidence: vals.confidence ?? null,
      groundedSourceCount: vals.groundedSourceCount ?? null,
    })),
    countByChat: jest.fn().mockResolvedValue(2),
  } as any;
}

function makeTitleService(): jest.Mocked<Pick<AiChatTitleService, 'generate'>> {
  return { generate: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeRegistry(
  tools: Record<string, any> = {},
): jest.Mocked<Pick<ChatToolRegistry, 'toAiSdkTools'>> {
  return { toAiSdkTools: jest.fn().mockReturnValue(tools) } as any;
}

function makeSvc(
  ai: ReturnType<typeof makeAiProvider>,
  chatRepo: jest.Mocked<AiChatRepo>,
  msgRepo: jest.Mocked<AiChatMessageRepo>,
  titleService = makeTitleService(),
  registry = makeRegistry(),
  enrichRows: any[] = [],
): AiChatStreamService {
  const pageService = { findById: jest.fn().mockResolvedValue(undefined) };
  const spaceAbility = {
    createForUser: jest
      .fn()
      .mockResolvedValue({ cannot: jest.fn().mockReturnValue(true) }),
  };
  // DB stub for source enrichment: selectFrom().innerJoin().select().where().execute()
  const db = {
    selectFrom: () => ({
      innerJoin: () => ({
        select: () => ({
          where: () => ({ execute: jest.fn().mockResolvedValue(enrichRows) }),
        }),
      }),
    }),
  };
  return new AiChatStreamService(
    db as any,
    ai as any,
    chatRepo,
    msgRepo,
    titleService as any,
    registry as any,
    pageService as any,
    spaceAbility as any,
  );
}

const DTO: SendMessageDto = { content: 'Hello AI' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiChatStreamService.send()', () => {
  describe('guard conditions', () => {
    it('emits an error event with code=ai_unavailable when AI is not configured', async () => {
      const ai = makeAiProvider([], false);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const err = parsed.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('ai_unavailable');
      expect(err.retryable).toBe(true);

      const done = parsed.find((e) => e.type === '__DONE__');
      expect(done).toBeDefined();
    });

    it('always ends the raw stream even when AI throws ServiceUnavailableException', async () => {
      const ai = makeAiProvider([], true);
      (ai.chat as jest.Mock).mockImplementationOnce(() => {
        throw new ServiceUnavailableException('not ready');
      });
      const chatRepo = makeChatRepo();
      chatRepo.insert.mockResolvedValue(makeChat());
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, chatRepo, makeMessageRepo());

      await svc.send(DTO, USER, reply);

      expect(reply.raw.end).toHaveBeenCalled();
    });

    it('emits error with code=forbidden when a ForbiddenException is thrown', async () => {
      const ai = makeAiProvider([], true);
      (ai.chat as jest.Mock).mockImplementationOnce(() => {
        throw new ForbiddenException('no access');
      });
      const chatRepo = makeChatRepo();
      chatRepo.insert.mockResolvedValue(makeChat());
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, chatRepo, makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const err = parsed.find((e) => e.type === 'error');
      expect(err?.code).toBe('forbidden');
      expect(err?.retryable).toBe(false);
    });
  });

  describe('new chat creation', () => {
    it('creates a new chat and emits chat_created when no chatId is provided', async () => {
      const ai = makeAiProvider();
      const chatRepo = makeChatRepo();
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, chatRepo, makeMessageRepo());

      await svc.send({ content: 'Hi' }, USER, reply);

      expect(chatRepo.insert).toHaveBeenCalledTimes(1);
      const parsed = parseSseEvents(events);
      const chatCreated = parsed.find((e) => e.type === 'chat_created');
      expect(chatCreated).toBeDefined();
      expect(chatCreated.chatId).toBeDefined();
    });

    it('does not create a new chat when chatId is provided', async () => {
      const existing = makeChat('existing-chat');
      const ai = makeAiProvider();
      const chatRepo = makeChatRepo(existing);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, chatRepo, makeMessageRepo());

      await svc.send({ chatId: 'existing-chat', content: 'Hi' }, USER, reply);

      // insert should only be called once (for the user message), not for the chat
      expect(chatRepo.insert).not.toHaveBeenCalled();
      const parsed = parseSseEvents(events);
      const chatCreated = parsed.find((e) => e.type === 'chat_created');
      expect(chatCreated).toBeUndefined();
    });
  });

  describe('happy path streaming', () => {
    it('emits content events for each text-delta part', async () => {
      const ai = makeAiProvider([
        { type: 'text-delta', id: 't1', text: 'Hello ' },
        { type: 'text-delta', id: 't2', text: 'world' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 5 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const contentEvents = parsed.filter((e) => e.type === 'content');
      expect(contentEvents.map((e) => e.text).join('')).toBe('Hello world');
    });

    it('emits a done event with a messageId after streaming completes', async () => {
      const ai = makeAiProvider();
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const done = parsed.find((e) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.messageId).toBe('msg-new');
    });

    it('ends the SSE stream with data: [DONE]', async () => {
      const ai = makeAiProvider();
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      expect(parsed[parsed.length - 1].type).toBe('__DONE__');
    });

    it('persists the user message before calling the LLM', async () => {
      const ai = makeAiProvider();
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send({ content: 'What is X?' }, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const userMsgCall = calls.find((c: any[]) => c[0].role === 'user');
      expect(userMsgCall).toBeDefined();
      expect(userMsgCall[0].content).toBe('What is X?');
    });

    it('persists the assistant message with the full accumulated text', async () => {
      const ai = makeAiProvider([
        { type: 'text-delta', id: 't1', text: 'Part 1 ' },
        { type: 'text-delta', id: 't2', text: 'Part 2' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 5 } },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg[0].content).toBe('Part 1 Part 2');
    });
  });

  describe('tool call flow', () => {
    it('emits tool_call and tool_result events for a complete tool round-trip', async () => {
      const ai = makeAiProvider([
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          input: { query: 'auth' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          output: [{ id: 'p1', title: 'Auth guide' }],
        },
        { type: 'text-delta', id: 't1', text: 'Found it.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 20 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const toolCall = parsed.find((e) => e.type === 'tool_call');
      expect(toolCall).toMatchObject({ id: 'tc-1', name: 'search_pages' });
      const toolResult = parsed.find((e) => e.type === 'tool_result');
      expect(toolResult).toMatchObject({ id: 'tc-1' });
    });

    it('persists tool_calls jsonb on the assistant message', async () => {
      const ai = makeAiProvider([
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          input: { query: 'auth' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          output: [{ id: 'p1' }],
        },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 5 } },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg[0].toolCalls).toBeDefined();
      expect(Array.isArray(assistantMsg[0].toolCalls)).toBe(true);
      expect(assistantMsg[0].toolCalls[0]).toMatchObject({
        id: 'tc-1',
        name: 'search_pages',
      });
    });

    it('emits grounded sources and confidence on the done event', async () => {
      const ragResult = {
        isEmpty: false,
        chunks: [
          { sourceId: 'src-1', score: 0.9, label: 'P1', kind: 'page', title: 'Auth guide', excerpt: '...' },
          { sourceId: 'src-2', score: 0.6, label: 'P2', kind: 'page', title: 'Login flow', excerpt: '...' },
        ],
      };
      const ai = makeAiProvider([
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'rag_retrieve', input: { question: 'auth' } },
        { type: 'tool-result', toolCallId: 'tc-1', toolName: 'rag_retrieve', output: ragResult },
        { type: 'text-delta', id: 't1', text: 'Answer [P1].' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 12 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.confidence).toBeGreaterThan(0);
      expect(done.groundedSourceCount).toBe(2);
      expect(done.sources).toHaveLength(2);
      expect(done.sources[0]).toMatchObject({ sourceId: 'src-1', label: 'P1', title: 'Auth guide' });
      expect(done.sources[0].score).toBeGreaterThan(done.sources[1].score);
    });

    it('enriches page sources with slugId + spaceSlug for in-app deep links', async () => {
      const ragResult = {
        isEmpty: false,
        chunks: [
          { sourceId: 'page-1', score: 0.9, label: 'P1', kind: 'page', title: 'Auth guide', excerpt: '...' },
        ],
      };
      const ai = makeAiProvider([
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'rag_retrieve', input: { question: 'auth' } },
        { type: 'tool-result', toolCallId: 'tc-1', toolName: 'rag_retrieve', output: ragResult },
        { type: 'text-delta', id: 't1', text: 'See [P1].' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 5 } },
      ]);
      const { reply, events } = makeFakeReply();
      // Enrichment query resolves the page's slug + space slug.
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo(), makeTitleService(), makeRegistry(), [
        { id: 'page-1', slugId: 'abc123', title: 'Auth guide', spaceSlug: 'eng' },
      ]);

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.sources[0]).toMatchObject({
        sourceId: 'page-1',
        slugId: 'abc123',
        spaceSlug: 'eng',
      });
    });

    it('populates groundedSourceCount and confidence when rag_retrieve returns results', async () => {
      const ragResult = {
        isEmpty: false,
        chunks: [
          { sourceId: 'src-1', score: 0.9, label: 'P1', kind: 'page', title: 'T', excerpt: '...' },
          { sourceId: 'src-2', score: 0.7, label: 'P2', kind: 'page', title: 'T2', excerpt: '...' },
        ],
      };
      const ai = makeAiProvider([
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'rag_retrieve',
          input: { question: 'auth' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'rag_retrieve',
          output: ragResult,
        },
        { type: 'text-delta', id: 't1', text: 'Answer.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 10 } },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg[0].groundedSourceCount).toBe(2);
      expect(typeof assistantMsg[0].confidence).toBe('number');
      expect(assistantMsg[0].confidence).toBeGreaterThan(0);
    });

    it('leaves confidence null when no grounded sources are returned', async () => {
      const ai = makeAiProvider(); // no tool calls
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg[0].confidence).toBeUndefined();
    });

    it('passes the request user to the tool registry, not a different user', async () => {
      const ai = makeAiProvider();
      const registry = makeRegistry();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo(), makeTitleService(), registry);

      await svc.send(DTO, USER, reply);

      const { user } = (registry.toAiSdkTools as jest.Mock).mock.calls[0][0];
      expect(user.id).toBe(USER.id);
    });
  });

  describe('empty model output (the "first pass provides nothing" bug)', () => {
    it('emits a fallback content event when a tool-only turn produces no text', async () => {
      // Model runs a lookup and then stops without composing an answer — the
      // user would otherwise see a blank assistant bubble and no error.
      const ai = makeAiProvider([
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          input: { query: 'auth' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          output: [{ id: 'p1' }],
        },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 5 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const contentEvents = parsed.filter((e) => e.type === 'content');
      expect(contentEvents.length).toBeGreaterThan(0);
      expect(contentEvents.map((e) => e.text).join('')).not.toBe('');
    });

    it('persists the fallback text instead of a null assistant message', async () => {
      const ai = makeAiProvider([
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 0 } },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(typeof assistantMsg[0].content).toBe('string');
      expect((assistantMsg[0].content as string).length).toBeGreaterThan(0);
    });

    it('still emits a done event after the fallback', async () => {
      const ai = makeAiProvider([
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 0 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      expect(parsed.find((e) => e.type === 'done')).toBeDefined();
      expect(parsed[parsed.length - 1].type).toBe('__DONE__');
    });
  });

  describe('tool errors', () => {
    it('emits a tool_result so a failed tool does not leave the UI pending', async () => {
      const ai = makeAiProvider([
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          input: { query: 'auth' },
        },
        {
          type: 'tool-error',
          toolCallId: 'tc-1',
          toolName: 'search_pages',
          error: new Error('search backend down'),
        },
        { type: 'text-delta', id: 't1', text: 'I hit an error searching.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 7 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const toolResult = parsed.find((e) => e.type === 'tool_result');
      expect(toolResult).toBeDefined();
      expect(toolResult.id).toBe('tc-1');
      expect(toolResult.result.error).toContain('search backend down');
    });
  });

  describe('token usage', () => {
    it('includes usage on the done event when the model reports it', async () => {
      const ai = makeAiProvider([
        { type: 'text-delta', id: 't1', text: 'Answer.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 42 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const parsed = parseSseEvents(events);
      const done = parsed.find((e) => e.type === 'done');
      expect(done.usage).toEqual({ totalTokens: 42 });
    });

    it('persists tokenUsage metadata on the assistant message', async () => {
      const ai = makeAiProvider([
        { type: 'text-delta', id: 't1', text: 'Answer.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 42 } },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg[0].metadata).toEqual({ tokenUsage: { totalTokens: 42 } });
    });
  });

  describe('error in stream', () => {
    it('does not persist an assistant message when the stream raises an error part', async () => {
      const ai = makeAiProvider([
        { type: 'text-delta', id: 't1', text: 'Starting...' },
        { type: 'error', error: new Error('LLM failure') },
      ]);
      const msgRepo = makeMessageRepo();
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo);

      await svc.send(DTO, USER, reply);

      const calls = (msgRepo.insert as jest.Mock).mock.calls;
      const assistantMsg = calls.find((c: any[]) => c[0].role === 'assistant');
      expect(assistantMsg).toBeUndefined();

      const parsed = parseSseEvents(events);
      const err = parsed.find((e) => e.type === 'error');
      expect(err).toBeDefined();
    });
  });
});
