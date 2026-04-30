import { ForbiddenException } from '@nestjs/common';
import { MongoAbility } from '@casl/ability';
import { RagRetrieveTool } from './rag-retrieve.tool';
import { RagRetrievalService, RetrievedContext } from '../../rag/rag-retrieval.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
  ISpaceAbility,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatToolRegistry } from './chat-tool.registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER: any = { id: 'user-1', workspaceId: 'ws-1' };
const CTX = { user: USER, workspaceId: 'ws-1' };

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

function makeContext(empty = false): RetrievedContext {
  if (empty) return { chunks: [], contextText: '', isEmpty: true };
  return {
    chunks: [
      {
        kind: 'page', sourceId: 'p1', chunkText: 'Page text here',
        title: 'Page A', score: 0.8, label: 'P1',
      },
    ],
    contextText: '[Pages]\n[P1] Page A\nPage text here',
    isEmpty: false,
  };
}

function makeRetrieval(ctx = makeContext()): jest.Mocked<Pick<RagRetrievalService, 'retrieve'>> {
  return { retrieve: jest.fn().mockResolvedValue(ctx) } as any;
}

function makeRegistry(): jest.Mocked<Pick<ChatToolRegistry, 'register'>> {
  return { register: jest.fn() } as any;
}

function makeTool(
  canRead: boolean,
  ctx: RetrievedContext = makeContext(),
): RagRetrieveTool {
  const tool = new RagRetrieveTool(
    makeRetrieval(ctx) as any,
    makeSpaceAbility(canRead) as any,
    makeRegistry() as any,
  );
  return tool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagRetrieveTool', () => {
  describe('spaceId provided — access control', () => {
    it('throws ForbiddenException when user cannot Read Page in the given space', async () => {
      const tool = makeTool(false);

      await expect(
        tool.execute({ question: 'Q?', spaceId: 'sp-1' }, CTX),
      ).rejects.toThrow(ForbiddenException);
    });

    it('calls retrieve when user has access', async () => {
      const retrieval = makeRetrieval();
      const tool = new RagRetrieveTool(
        retrieval as any,
        makeSpaceAbility(true) as any,
        makeRegistry() as any,
      );

      await tool.execute({ question: 'Q?', spaceId: 'sp-1' }, CTX);

      expect(retrieval.retrieve).toHaveBeenCalledTimes(1);
    });

    it('passes workspaceId from context and spaceId from args to retrieve', async () => {
      const retrieval = makeRetrieval();
      const tool = new RagRetrieveTool(
        retrieval as any,
        makeSpaceAbility(true) as any,
        makeRegistry() as any,
      );

      await tool.execute({ question: 'What is X?', spaceId: 'sp-42' }, CTX);

      expect(retrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          spaceId: 'sp-42',
          question: 'What is X?',
        }),
      );
    });
  });

  describe('no spaceId — no CASL check', () => {
    it('skips the CASL check and calls retrieve when no spaceId is provided', async () => {
      const retrieval = makeRetrieval();
      const spaceAbility = makeSpaceAbility(false);
      const tool = new RagRetrieveTool(
        retrieval as any,
        spaceAbility as any,
        makeRegistry() as any,
      );

      await tool.execute({ question: 'Q?' }, CTX);

      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
      expect(retrieval.retrieve).toHaveBeenCalledTimes(1);
    });
  });

  describe('result shape', () => {
    it('returns isEmpty=false and a chunks array when context is found', async () => {
      const tool = makeTool(true, makeContext(false));

      const result = await tool.execute({ question: 'Q?', spaceId: 'sp-1' }, CTX);

      expect(result.isEmpty).toBe(false);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toMatchObject({
        label: 'P1',
        kind: 'page',
        sourceId: 'p1',
        title: 'Page A',
        score: 0.8,
      });
    });

    it('returns isEmpty=true when no context found', async () => {
      const tool = makeTool(true, makeContext(true));

      const result = await tool.execute({ question: 'Q?', spaceId: 'sp-1' }, CTX);

      expect(result.isEmpty).toBe(true);
      expect(result.chunks).toHaveLength(0);
    });

    it('truncates excerpt to 300 characters', async () => {
      const longText = 'X'.repeat(400);
      const ctx: RetrievedContext = {
        chunks: [{
          kind: 'page', sourceId: 'p1', chunkText: longText,
          title: 'T', score: 0.9, label: 'P1',
        }],
        contextText: longText,
        isEmpty: false,
      };
      const tool = makeTool(true, ctx);

      const result = await tool.execute({ question: 'Q?', spaceId: 'sp-1' }, CTX);

      expect(result.chunks[0].excerpt.length).toBe(300);
    });
  });

  describe('onModuleInit', () => {
    it('registers itself with the ChatToolRegistry', () => {
      const registry = makeRegistry();
      const tool = new RagRetrieveTool(
        makeRetrieval() as any,
        makeSpaceAbility(true) as any,
        registry as any,
      );

      tool.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(tool);
    });
  });
});
