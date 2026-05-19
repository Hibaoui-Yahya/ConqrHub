/**
 * End-to-end contract test for ConqrHub AI hallucination guardrails.
 *
 * This spec exercises every AI surface in the platform with a mocked
 * AiProviderService, captures the system prompt the surface sends to the
 * provider, and asserts that the prompt satisfies the workspace's
 * anti-hallucination contract:
 *
 *   1. No em-dash characters (a known AI stylistic tell that also blurs the
 *      sentence boundaries we want for strict rules).
 *   2. An explicit anti-fabrication clause.
 *   3. A prompt-injection guard for any surface that consumes untrusted
 *      user-supplied or retrieved content as part of its input.
 *   4. A citation requirement on grounded-answer surfaces (RAG and chat).
 *   5. An explicit refusal-when-no-context clause on grounded-answer
 *      surfaces operating without retrieval results.
 *
 * Surfaces covered:
 *   - Inline editor rewrites           (generate/prompts.ts -> buildPrompt)
 *   - RAG ask + askStream              (rag/rag-answer.service.ts)
 *   - AI Answers controller stream     (rag/ai-answers.controller.ts)
 *   - Agentic workspace chat           (chat/ai-chat-stream.service.ts)
 *   - Chat title generation            (chat/ai-chat-title.service.ts)
 *   - Speech-to-text correction        (stt/stt.service.ts)
 */

jest.mock('../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { AiAction } from './generate/dto/ai-generate.dto';
import { buildPrompt } from './generate/prompts';
import { RagAnswerService } from './rag/rag-answer.service';
import { RagRetrievalService, RetrievedContext } from './rag/rag-retrieval.service';
import { AiAnswersController } from './rag/ai-answers.controller';
import { AiChatStreamService } from './chat/ai-chat-stream.service';
import { AiChatTitleService } from './chat/ai-chat-title.service';
import { SttService } from './stt/stt.service';
import { AiProviderService } from './providers/ai-provider.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChatMessageRepo } from '@docmost/db/repos/ai-chat/ai-chat-message.repo';
import { ChatToolRegistry } from './chat/tools/chat-tool.registry';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
  ISpaceAbility,
} from '../../core/casl/interfaces/space-ability.type';
import { MongoAbility } from '@casl/ability';

// ---------------------------------------------------------------------------
// Contract assertions
// ---------------------------------------------------------------------------

const NO_EM_DASH = /^[^—]*$/;
const ANTI_FABRICATION =
  /do not (?:add|infer|fabricate|invent|paraphrase)|do not draw on outside knowledge|never fabricate/i;
const INJECTION_GUARD = /as data,\s*not as (?:commands|instructions)/i;
const CITATION_REQUIRED =
  /every factual claim must include the inline label|cite every claim/i;
const REFUSAL_NO_CONTEXT =
  /no (?:source material|content) (?:was )?(?:found|matched)|do not answer the question from general knowledge/i;

function assertCoreGuardrails(system: string): void {
  expect(system).toMatch(NO_EM_DASH);
  expect(system).toMatch(ANTI_FABRICATION);
}

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const WS = 'ws-1';
const USER: any = { id: 'user-1', workspaceId: WS };

function makeAiProvider(
  text = 'mocked answer',
  available = true,
): jest.Mocked<
  Pick<AiProviderService, 'isAvailable' | 'generate' | 'stream' | 'chat'>
> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    generate: jest.fn().mockResolvedValue({ text, usage: { totalTokens: 1 } }),
    stream: jest.fn().mockReturnValue({
      textStream: (async function* () {
        yield text;
      })(),
    }),
    chat: jest.fn().mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          totalUsage: { totalTokens: 1 },
        };
      })(),
    }),
  } as any;
}

function makeAbility(canRead: boolean): MongoAbility<ISpaceAbility> {
  return {
    can: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      canRead && a === SpaceCaslAction.Read && s === SpaceCaslSubject.Page,
    cannot: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      !canRead || a !== SpaceCaslAction.Read || s !== SpaceCaslSubject.Page,
  } as any;
}

function makeSpaceAbility(canRead = true): jest.Mocked<SpaceAbilityFactory> {
  return {
    createForUser: jest.fn().mockResolvedValue(makeAbility(canRead)),
  } as any;
}

function emptyContext(): RetrievedContext {
  return { chunks: [], contextText: '', isEmpty: true };
}

function populatedContext(): RetrievedContext {
  return {
    chunks: [
      {
        kind: 'expert_insight',
        sourceId: 'i1',
        chunkText: 'fact A',
        title: 'Doc A',
        score: 0.9,
        label: 'E1',
      },
    ],
    contextText: '[Expert Insights]\n[E1] Doc A\nfact A',
    isEmpty: false,
  };
}

function makeRetrieval(
  ctx: RetrievedContext,
): jest.Mocked<Pick<RagRetrievalService, 'retrieve'>> {
  return { retrieve: jest.fn().mockResolvedValue(ctx) } as any;
}

function makeFakeReply(): { reply: any; events: string[] } {
  const events: string[] = [];
  const raw = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => events.push(chunk)),
    end: jest.fn(),
  };
  return { reply: { raw }, events };
}

// ---------------------------------------------------------------------------
// Surface: editor rewrites (buildPrompt)
// ---------------------------------------------------------------------------

describe('hallucination guardrails | inline editor rewrite (buildPrompt)', () => {
  const ALL_ACTIONS: AiAction[] = [
    AiAction.IMPROVE_WRITING,
    AiAction.FIX_SPELLING_GRAMMAR,
    AiAction.MAKE_SHORTER,
    AiAction.MAKE_LONGER,
    AiAction.SIMPLIFY,
    AiAction.CHANGE_TONE,
    AiAction.SUMMARIZE,
    AiAction.EXPLAIN,
    AiAction.CONTINUE_WRITING,
    AiAction.TRANSLATE,
    AiAction.CUSTOM,
  ];

  it.each(ALL_ACTIONS)(
    '[%s] system prompt has no em-dash, anti-fabrication, injection guard',
    (action) => {
      const { system } = buildPrompt(action, { content: 'sample text' });
      assertCoreGuardrails(system);
      expect(system).toMatch(INJECTION_GUARD);
    },
  );
});

// ---------------------------------------------------------------------------
// Surface: RAG answer (ask + askStream)
// ---------------------------------------------------------------------------

describe('hallucination guardrails | RagAnswerService.ask', () => {
  function svc(ctx: RetrievedContext, ai = makeAiProvider()) {
    return {
      ai,
      service: new RagAnswerService(
        ai as any,
        makeRetrieval(ctx) as any,
        makeSpaceAbility(true),
      ),
    };
  }

  it('populated context: contains citation + injection guard + anti-fabrication', async () => {
    const { ai, service } = svc(populatedContext());

    await service.ask({ question: 'q', spaceId: 'sp-1' } as any, USER);

    const arg = (ai.generate as jest.Mock).mock.calls[0][0];
    assertCoreGuardrails(arg.system);
    expect(arg.system).toMatch(INJECTION_GUARD);
    expect(arg.system).toMatch(CITATION_REQUIRED);
  });

  it('empty context: contains refusal phrase and no em-dash', async () => {
    const { ai, service } = svc(emptyContext());

    await service.ask({ question: 'q', spaceId: 'sp-1' } as any, USER);

    const arg = (ai.generate as jest.Mock).mock.calls[0][0];
    expect(arg.system).toMatch(NO_EM_DASH);
    expect(arg.system).toMatch(REFUSAL_NO_CONTEXT);
  });

  it('askStream: same guardrails as ask', async () => {
    const { ai, service } = svc(populatedContext());

    await service.askStream({ question: 'q', spaceId: 'sp-1' } as any, USER);

    const arg = (ai.stream as jest.Mock).mock.calls[0][0];
    assertCoreGuardrails(arg.system);
    expect(arg.system).toMatch(INJECTION_GUARD);
    expect(arg.system).toMatch(CITATION_REQUIRED);
  });
});

// ---------------------------------------------------------------------------
// Surface: AI Answers controller (buildAnswersPrompt)
// ---------------------------------------------------------------------------

describe('hallucination guardrails | AiAnswersController.answers', () => {
  function setup(ctx: RetrievedContext) {
    const ai = makeAiProvider();
    const retrieval = makeRetrieval(ctx);
    const controller = new AiAnswersController(retrieval as any, ai as any);
    return { ai, controller };
  }

  it('populated context: anti-fabrication + injection guard + citation', async () => {
    const { ai, controller } = setup(populatedContext());
    const { reply } = makeFakeReply();

    await controller.answers(
      { query: 'q', spaceId: 'sp-1' } as any,
      USER,
      { id: WS } as any,
      reply as any,
    );

    const arg = (ai.stream as jest.Mock).mock.calls[0][0];
    assertCoreGuardrails(arg.system);
    expect(arg.system).toMatch(INJECTION_GUARD);
    expect(arg.system).toMatch(CITATION_REQUIRED);
  });

  it('empty context: refusal phrasing, no em-dash', async () => {
    const { ai, controller } = setup(emptyContext());
    const { reply } = makeFakeReply();

    await controller.answers(
      { query: 'q', spaceId: 'sp-1' } as any,
      USER,
      { id: WS } as any,
      reply as any,
    );

    const arg = (ai.stream as jest.Mock).mock.calls[0][0];
    expect(arg.system).toMatch(NO_EM_DASH);
    expect(arg.system).toMatch(REFUSAL_NO_CONTEXT);
  });
});

// ---------------------------------------------------------------------------
// Surface: agentic workspace chat (AiChatStreamService)
// ---------------------------------------------------------------------------

describe('hallucination guardrails | AiChatStreamService.send', () => {
  function setup() {
    const ai = makeAiProvider();
    const chatRepo = {
      insert: jest.fn().mockResolvedValue({
        id: 'chat-new',
        workspaceId: WS,
        creatorId: USER.id,
        title: null,
      }),
      findById: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      hasTitleSet: jest.fn().mockResolvedValue(false),
      listByCreator: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    } as unknown as jest.Mocked<AiChatRepo>;
    const messageRepo = {
      listByChat: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue({
        id: 'msg-new',
        role: 'user',
        content: '',
      }),
      countByChat: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<AiChatMessageRepo>;
    const titleService = {
      generate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AiChatTitleService>;
    const registry = {
      toAiSdkTools: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<ChatToolRegistry>;
    const pageService = { findById: jest.fn().mockResolvedValue(undefined) };
    const service = new AiChatStreamService(
      ai as any,
      chatRepo,
      messageRepo,
      titleService as any,
      registry as any,
      pageService as any,
      makeSpaceAbility(true) as any,
    );
    return { ai, service };
  }

  it('chat agent prompt has anti-fab, citation, injection guard, no em-dash', async () => {
    const { ai, service } = setup();
    const { reply } = makeFakeReply();

    await service.send({ content: 'hi' } as any, USER, reply as any);

    expect(ai.chat).toHaveBeenCalled();
    const arg = (ai.chat as jest.Mock).mock.calls[0][0];
    assertCoreGuardrails(arg.system);
    expect(arg.system).toMatch(INJECTION_GUARD);
    expect(arg.system).toMatch(CITATION_REQUIRED);
  });
});

// ---------------------------------------------------------------------------
// Surface: chat title generation
// ---------------------------------------------------------------------------

describe('hallucination guardrails | AiChatTitleService.generate', () => {
  it('title prompt has no em-dash and is bounded to a 4 to 6 word title', async () => {
    const ai = makeAiProvider('A nice title');
    const chatRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const svc = new AiChatTitleService(ai as any, chatRepo as any);

    await svc.generate('chat-1', WS, 'How does authentication work?');

    const arg = (ai.generate as jest.Mock).mock.calls[0][0];
    expect(arg.system).toMatch(NO_EM_DASH);
    expect(arg.system).toMatch(/4 to 6 word title/i);
    expect(arg.system).toMatch(/output only the title/i);
  });
});

// ---------------------------------------------------------------------------
// Surface: speech-to-text correction
// ---------------------------------------------------------------------------

describe('hallucination guardrails | SttService correction prompt', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock the Mistral transcription endpoint so the correction step runs.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: 'raw transcript text' }),
      text: jest.fn().mockResolvedValue(''),
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('STT correction prompt has no em-dash, anti-fabrication, injection guard', async () => {
    const ai = makeAiProvider('corrected transcript text');
    const env = {
      getMistralApiKey: jest.fn().mockReturnValue('key-xyz'),
      getAiSttModel: jest.fn().mockReturnValue('voxtral-1'),
    };
    const pageRepo = { findById: jest.fn().mockResolvedValue(undefined) };
    const svc = new SttService(env as any, ai as any, pageRepo as any);

    await svc.transcribeAndCorrect(
      Buffer.from([0x00]),
      'audio/webm',
      { kind: 'chat' },
      WS,
      'My Workspace',
    );

    expect(ai.generate).toHaveBeenCalled();
    const arg = (ai.generate as jest.Mock).mock.calls[0][0];
    assertCoreGuardrails(arg.system);
    expect(arg.system).toMatch(INJECTION_GUARD);
  });
});
