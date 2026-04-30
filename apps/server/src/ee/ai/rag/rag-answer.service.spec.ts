import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { MongoAbility } from '@casl/ability';
import { RagAnswerService } from './rag-answer.service';
import { RagRetrievalService, RetrievedContext } from './rag-retrieval.service';
import { AiProviderService } from '../providers/ai-provider.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
  ISpaceAbility,
} from '../../../core/casl/interfaces/space-ability.type';
import { AskDto } from './dto/ask.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-1';
const SPACE_ID = 'sp-1';
const USER: any = { id: 'user-1', workspaceId: WORKSPACE_ID };

const DTO: AskDto = { question: 'What is X?', spaceId: SPACE_ID };

function makeContext(empty = false): RetrievedContext {
  if (empty) return { chunks: [], contextText: '', isEmpty: true };
  return {
    chunks: [
      {
        kind: 'expert_insight', sourceId: 'i1', chunkText: 'EI text',
        title: 'Warning A', score: 0.95, label: 'E1',
      },
      {
        kind: 'page', sourceId: 'p1', chunkText: 'Page text',
        title: 'Page B', score: 0.8, label: 'P1',
      },
    ],
    contextText: '[Expert Insights]\n[E1] Warning A\nEI text\n\n[Pages]\n[P1] Page B\nPage text',
    isEmpty: false,
  };
}

function makeAbility(canRead: boolean): MongoAbility<ISpaceAbility> {
  return {
    can: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      canRead && a === SpaceCaslAction.Read && s === SpaceCaslSubject.Page,
    cannot: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      !canRead || a !== SpaceCaslAction.Read || s !== SpaceCaslSubject.Page,
  } as any;
}

function makeSpaceAbility(canRead: boolean): jest.Mocked<SpaceAbilityFactory> {
  return {
    createForUser: jest.fn().mockResolvedValue(makeAbility(canRead)),
  } as any;
}

function makeAiProvider(text = 'Generated answer', available = true): jest.Mocked<Pick<AiProviderService, 'isAvailable' | 'generate' | 'stream'>> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    generate: jest.fn().mockResolvedValue({ text, usage: { totalTokens: 42 } }),
    stream: jest.fn().mockReturnValue({ textStream: (async function* () { yield 'chunk'; })() }),
  } as any;
}

function makeRetrieval(context: RetrievedContext = makeContext()): jest.Mocked<Pick<RagRetrievalService, 'retrieve'>> {
  return { retrieve: jest.fn().mockResolvedValue(context) } as any;
}

function makeSvc(
  aiProvider: ReturnType<typeof makeAiProvider>,
  retrieval: ReturnType<typeof makeRetrieval>,
  canRead: boolean,
): RagAnswerService {
  return new RagAnswerService(
    aiProvider as any,
    retrieval as any,
    makeSpaceAbility(canRead),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagAnswerService.ask()', () => {
  describe('access control', () => {
    it('throws ForbiddenException when user has no Read Page access to the space', async () => {
      const svc = makeSvc(makeAiProvider(), makeRetrieval(), false);

      await expect(svc.ask(DTO, USER)).rejects.toThrow(ForbiddenException);
    });

    it('does not call retrieval when access is denied', async () => {
      const retrieval = makeRetrieval();
      const svc = makeSvc(makeAiProvider(), retrieval, false);

      await expect(svc.ask(DTO, USER)).rejects.toThrow(ForbiddenException);
      expect(retrieval.retrieve).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when AI is not configured', async () => {
      const ai = makeAiProvider('', false);
      const svc = makeSvc(ai, makeRetrieval(), true);

      await expect(svc.ask(DTO, USER)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('happy path with context', () => {
    it('returns the generated answer text', async () => {
      const svc = makeSvc(makeAiProvider('The answer is 42.'), makeRetrieval(), true);

      const result = await svc.ask(DTO, USER);

      expect(result.answer).toBe('The answer is 42.');
    });

    it('returns contextEmpty=false when context is found', async () => {
      const svc = makeSvc(makeAiProvider(), makeRetrieval(makeContext(false)), true);

      const result = await svc.ask(DTO, USER);

      expect(result.contextEmpty).toBe(false);
    });

    it('returns sources array matching retrieved chunks', async () => {
      const svc = makeSvc(makeAiProvider(), makeRetrieval(makeContext(false)), true);

      const result = await svc.ask(DTO, USER);

      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toMatchObject({
        label: 'E1', kind: 'expert_insight', sourceId: 'i1', title: 'Warning A',
      });
      expect(result.sources[1]).toMatchObject({
        label: 'P1', kind: 'page', sourceId: 'p1', title: 'Page B',
      });
    });

    it('passes workspaceId and spaceId from user/dto to retrieval', async () => {
      const retrieval = makeRetrieval();
      const svc = makeSvc(makeAiProvider(), retrieval, true);

      await svc.ask(DTO, USER);

      expect(retrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WORKSPACE_ID, spaceId: SPACE_ID }),
      );
    });

    it('passes pageId filter when provided in dto', async () => {
      const retrieval = makeRetrieval();
      const svc = makeSvc(makeAiProvider(), retrieval, true);

      await svc.ask({ ...DTO, pageId: 'page-42' }, USER);

      expect(retrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ pageId: 'page-42' }),
      );
    });
  });

  describe('empty context fallback', () => {
    it('returns contextEmpty=true when no relevant chunks are found', async () => {
      const svc = makeSvc(makeAiProvider(), makeRetrieval(makeContext(true)), true);

      const result = await svc.ask(DTO, USER);

      expect(result.contextEmpty).toBe(true);
    });

    it('still calls the LLM when context is empty (uses fallback prompt)', async () => {
      const ai = makeAiProvider('I could not find relevant information.');
      const svc = makeSvc(ai, makeRetrieval(makeContext(true)), true);

      const result = await svc.ask(DTO, USER);

      expect(ai.generate).toHaveBeenCalledTimes(1);
      expect(result.answer).toBe('I could not find relevant information.');
    });

    it('returns empty sources array when context is empty', async () => {
      const svc = makeSvc(makeAiProvider(), makeRetrieval(makeContext(true)), true);

      const result = await svc.ask(DTO, USER);

      expect(result.sources).toHaveLength(0);
    });
  });
});

describe('RagAnswerService.askStream()', () => {
  it('throws ForbiddenException when user has no Read Page access', async () => {
    const svc = makeSvc(makeAiProvider(), makeRetrieval(), false);

    await expect(svc.askStream(DTO, USER)).rejects.toThrow(ForbiddenException);
  });

  it('calls aiProvider.stream and returns the result', async () => {
    const ai = makeAiProvider();
    const svc = makeSvc(ai, makeRetrieval(), true);

    const stream = await svc.askStream(DTO, USER);

    expect(ai.stream).toHaveBeenCalledTimes(1);
    expect(stream).toBeDefined();
  });
});
