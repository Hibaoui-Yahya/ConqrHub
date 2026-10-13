jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AiChatStreamService, buildSystemPrompt } from './ai-chat-stream.service';
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

interface SvcOptions {
  /** Row returned by the `spaces` lookup when a scope is requested. */
  spaceRow?: { id: string; name: string | null } | undefined;
  /** Whether the user can Read pages in the scoped space (default: false). */
  canReadSpace?: boolean;
}

function makeSvc(
  ai: ReturnType<typeof makeAiProvider>,
  chatRepo: jest.Mocked<AiChatRepo>,
  msgRepo: jest.Mocked<AiChatMessageRepo>,
  titleService = makeTitleService(),
  registry = makeRegistry(),
  enrichRows: any[] = [],
  opts: SvcOptions = {},
): AiChatStreamService {
  const pageService = { findById: jest.fn().mockResolvedValue(undefined) };
  const spaceAbility = {
    createForUser: jest.fn().mockResolvedValue({
      cannot: jest.fn().mockReturnValue(!(opts.canReadSpace ?? false)),
    }),
  };
  // DB stub for source enrichment + scope lookup. Chainable so any
  // combination of innerJoin/leftJoin/select/where resolves to the provided
  // rows (execute) or the scoped space row (executeTakeFirst).
  const dbChain: any = {
    innerJoin: () => dbChain,
    leftJoin: () => dbChain,
    select: () => dbChain,
    where: () => dbChain,
    execute: jest.fn().mockResolvedValue(enrichRows),
    executeTakeFirst: jest.fn().mockResolvedValue(opts.spaceRow),
  };
  const db = { selectFrom: () => dbChain };
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
      // Enrichment query resolves slug, space, author, update + verification.
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo(), makeTitleService(), makeRegistry(), [
        {
          id: 'page-1', slugId: 'abc123', title: 'Auth guide',
          spaceSlug: 'eng', spaceName: 'Engineering', authorName: 'Maria Lopez',
          updatedAt: new Date('2026-05-18T10:00:00Z'),
          verifiedAt: new Date('2026-05-20T09:00:00Z'), verifierName: 'Sam Chen',
        },
      ]);

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.sources[0]).toMatchObject({
        sourceId: 'page-1',
        slugId: 'abc123',
        spaceSlug: 'eng',
        spaceName: 'Engineering',
        author: 'Maria Lopez',
        verifiedBy: 'Sam Chen',
      });
      expect(done.sources[0].updatedAt).toContain('2026-05-18');
      expect(done.sources[0].verifiedAt).toContain('2026-05-20');
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

  describe('sources, labels and confidence', () => {
    const rag = (chunks: any[]) => [
      { type: 'tool-call', toolCallId: 'tc-1', toolName: 'rag_retrieve', input: { question: 'q' } },
      { type: 'tool-result', toolCallId: 'tc-1', toolName: 'rag_retrieve', output: { isEmpty: false, chunks } },
      { type: 'text-delta', id: 't1', text: 'Answer [P1].' },
      { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 1 } },
    ];
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    const row = (id: string, status: string | null, expiresAt: Date | null = null) => ({
      id, slugId: `slug-${id}`, title: `Title ${id}`, spaceSlug: 'hr', spaceName: 'RH',
      authorName: 'A', updatedAt: new Date(), verifiedAt: null, verifierName: null,
      verificationStatus: status, verificationExpiresAt: expiresAt,
    });

    it('keeps every label of a source so [P3] on the same page as [P1] still resolves', async () => {
      const ai = makeAiProvider(rag([
        { sourceId: 'page-1', score: 0.9, label: 'P1', kind: 'page', title: 'Guide', excerpt: 'first chunk' },
        { sourceId: 'page-2', score: 0.8, label: 'P2', kind: 'page', title: 'Other', excerpt: 'x' },
        { sourceId: 'page-1', score: 0.7, label: 'P3', kind: 'page', title: 'Guide', excerpt: 'third chunk' },
      ]));
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.sources).toHaveLength(2);
      const p1 = done.sources.find((s: any) => s.sourceId === 'page-1');
      expect(p1.label).toBe('P1');
      expect(p1.labels).toEqual(['P1', 'P3']);
      expect(p1.score).toBe(0.9);
      expect(p1.excerpt).toBe('first chunk');
    });

    it('collapses excerpts to a single line of at most 240 chars', async () => {
      const long = 'word '.repeat(80) + '\n\n   tail';
      const ai = makeAiProvider(rag([
        { sourceId: 'page-1', score: 0.9, label: 'P1', kind: 'page', title: 'T', excerpt: long },
      ]));
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.sources[0].excerpt.length).toBeLessThanOrEqual(240);
      expect(done.sources[0].excerpt).not.toContain('\n');
      expect(done.sources[0].excerpt).not.toMatch(/\s{2,}/);
    });

    it('adds get_page reads as page sources (score 0.7, no label)', async () => {
      const ai = makeAiProvider([
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'get_page', input: { pageId: 'page-9' } },
        { type: 'tool-result', toolCallId: 'tc-1', toolName: 'get_page',
          output: { id: 'page-9', title: 'Read me', slugId: 'rm9', spaceId: 's', content: '# hi', updatedAt: 'x' } },
        { type: 'text-delta', id: 't1', text: 'Done.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 1 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.sources).toHaveLength(1);
      expect(done.sources[0]).toMatchObject({ sourceId: 'page-9', kind: 'page', score: 0.7, label: '', labels: [], slugId: 'rm9' });
      expect(done.confidence).toBe(0.55);
      expect(done.groundedSourceCount).toBe(1);
    });

    it('flags verified pages from pv.status + expiry on every page source', async () => {
      const ai = makeAiProvider(rag([
        { sourceId: 'p-ok', score: 0.9, label: 'P1', kind: 'page', title: 'ok' },
        { sourceId: 'p-expired', score: 0.8, label: 'P2', kind: 'page', title: 'exp' },
        { sourceId: 'p-draft', score: 0.7, label: 'P3', kind: 'page', title: 'draft' },
        { sourceId: 'p-none', score: 0.6, label: 'P4', kind: 'page', title: 'none' },
      ]));
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo(), makeTitleService(), makeRegistry(), [
        row('p-ok', 'verified', future),
        row('p-expired', 'verified', past),
        row('p-draft', 'draft'),
        row('p-none', null),
      ]);

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      const byId = Object.fromEntries(done.sources.map((s: any) => [s.sourceId, s]));
      expect(byId['p-ok']).toMatchObject({ verified: true, verificationStatus: 'verified' });
      expect(byId['p-expired']).toMatchObject({ verified: false, verificationStatus: 'verified' });
      expect(byId['p-draft']).toMatchObject({ verified: false, verificationStatus: 'draft' });
      expect(byId['p-none']).toMatchObject({ verified: false, verificationStatus: 'none' });
    });

    it('computes confidence as 0.6*top + 0.4*mean(top-3) of rag scores', async () => {
      const ai = makeAiProvider(rag([
        { sourceId: 'a', score: 0.9, label: 'P1', kind: 'page', title: 'a' },
        { sourceId: 'b', score: 0.6, label: 'P2', kind: 'page', title: 'b' },
      ]));
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      // top=0.9, mean(top3)=0.75 -> 0.54 + 0.30
      expect(done.confidence).toBeCloseTo(0.84, 4);
    });

    it('boosts confidence by 0.1 when at least two distinct sources are verified, clamped to 1', async () => {
      const ai = makeAiProvider(rag([
        { sourceId: 'a', score: 0.9, label: 'P1', kind: 'page', title: 'a' },
        { sourceId: 'b', score: 0.6, label: 'P2', kind: 'page', title: 'b' },
      ]));
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo(), makeTitleService(), makeRegistry(), [
        row('a', 'verified', future),
        row('b', 'expiring', future),
      ]);

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.confidence).toBeCloseTo(0.94, 4);
      expect(done.confidence).toBeLessThanOrEqual(1);
    });

    it('uses a flat 0.55 when the only grounding is search_pages', async () => {
      const ai = makeAiProvider([
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'search_pages', input: { query: 'q' } },
        { type: 'tool-result', toolCallId: 'tc-1', toolName: 'search_pages',
          output: [{ id: 'p1', title: 'Hit', slugId: 's1', excerpt: 'snippet' }] },
        { type: 'text-delta', id: 't1', text: 'Found.' },
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 1 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, USER, reply);

      const done = parseSseEvents(events).find((e) => e.type === 'done');
      expect(done.confidence).toBe(0.55);
      expect(done.sources[0]).toMatchObject({ sourceId: 'p1', excerpt: 'snippet', labels: [] });
    });
  });

  describe('locale', () => {
    it('falls back in French for a fr-* user on an empty turn', async () => {
      const ai = makeAiProvider([
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 0 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, { ...USER, locale: 'fr-FR' }, reply);

      const text = parseSseEvents(events).filter((e) => e.type === 'content').map((e) => e.text).join('');
      expect(text).toMatch(/réessayer/i);
    });

    it('falls back in English for any other locale', async () => {
      const ai = makeAiProvider([
        { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: { totalTokens: 0 } },
      ]);
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, { ...USER, locale: 'en-US' }, reply);

      const text = parseSseEvents(events).filter((e) => e.type === 'content').map((e) => e.text).join('');
      expect(text).toMatch(/try again/i);
    });

    it('injects the user locale into the system prompt', async () => {
      const ai = makeAiProvider();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), makeMessageRepo());

      await svc.send(DTO, { ...USER, locale: 'fr-FR' }, reply);

      const { system } = (ai.chat as jest.Mock).mock.calls[0][0];
      expect(system).toContain('fr-FR');
      expect(system).toContain('KNOWLEDGE-BASE GATE');
      expect(system).toContain('list_unverified_pages');
    });
  });

  describe('space scope', () => {
    it('emits a forbidden error and persists nothing when the user cannot read the space', async () => {
      const ai = makeAiProvider();
      const chatRepo = makeChatRepo();
      const msgRepo = makeMessageRepo();
      const { reply, events } = makeFakeReply();
      const svc = makeSvc(ai, chatRepo, msgRepo, makeTitleService(), makeRegistry(), [], {
        canReadSpace: false,
      });

      await svc.send({ content: 'Hi', spaceId: 'space-1' }, USER, reply);

      const parsed = parseSseEvents(events);
      const err = parsed.find((e) => e.type === 'error');
      expect(err?.code).toBe('forbidden');
      expect(chatRepo.insert).not.toHaveBeenCalled();
      expect(msgRepo.insert).not.toHaveBeenCalled();
      expect(ai.chat).not.toHaveBeenCalled();
    });

    it('injects a SCOPE block with the space name when the user can read it', async () => {
      const ai = makeAiProvider();
      const msgRepo = makeMessageRepo();
      const { reply } = makeFakeReply();
      const svc = makeSvc(ai, makeChatRepo(), msgRepo, makeTitleService(), makeRegistry(), [], {
        canReadSpace: true,
        spaceRow: { id: 'space-1', name: 'Ressources humaines' },
      });

      await svc.send({ content: 'Hi', spaceId: 'space-1' }, USER, reply);

      const { system } = (ai.chat as jest.Mock).mock.calls[0][0];
      expect(system).toContain('Scope: space Ressources humaines (space-1)');
      const userMsg = (msgRepo.insert as jest.Mock).mock.calls.find((c) => c[0].role === 'user');
      expect(userMsg[0].metadata).toMatchObject({ spaceId: 'space-1' });
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

  describe('buildSystemPrompt()', () => {
    it('has no SCOPE block without a scope and one with it', () => {
      expect(buildSystemPrompt('en')).not.toContain('SCOPE');
      const scoped = buildSystemPrompt('fr-FR', { spaceId: 'sp', spaceName: 'RH' });
      expect(scoped).toContain('Scope: space RH (sp)');
      expect(scoped).toContain('non vérifié');
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
