import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MongoAbility } from '@casl/ability';
import { AiAnswersController } from './ai-answers.controller';
import { RetrievedContext } from './rag-retrieval.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
  ISpaceAbility,
} from '../../../core/casl/interfaces/space-ability.type';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS: any = { id: 'ws-1' };
const USER: any = { id: 'user-1', workspaceId: 'ws-1' };

function makeAbility(canRead: boolean): MongoAbility<ISpaceAbility> {
  return {
    can: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      canRead && a === SpaceCaslAction.Read && s === SpaceCaslSubject.Page,
    cannot: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      !canRead || a !== SpaceCaslAction.Read || s !== SpaceCaslSubject.Page,
  } as any;
}

function makeContext(empty = false): RetrievedContext {
  if (empty) return { chunks: [], contextText: '', isEmpty: true };
  return {
    chunks: [
      {
        kind: 'page',
        sourceId: 'p1',
        chunkText: 'Page text here',
        title: 'Page A',
        score: 0.8,
        label: 'P1',
        chunkIndex: 2,
        excerpt: 'Page text here',
        matchedBy: ['vector', 'lexical'],
      },
      {
        kind: 'expert_insight',
        sourceId: 'i1',
        chunkText: 'Insight',
        title: 'Insight A',
        score: 0.7,
        label: 'E1',
        chunkIndex: 0,
        excerpt: 'Insight',
        matchedBy: ['vector'],
      },
    ],
    contextText: '[Pages]\n[P1] Page A\nPage text here',
    isEmpty: false,
  };
}

function makeReply() {
  const writes: string[] = [];
  const reply = {
    raw: {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((s: string) => {
        writes.push(s);
      }),
      end: jest.fn(),
    },
  };
  const events = () =>
    writes
      .filter((w) => w.startsWith('data: ') && !w.startsWith('data: [DONE]'))
      .map((w) => JSON.parse(w.slice(6)));
  return { reply, writes, events };
}

function setup(
  opts: {
    context?: RetrievedContext;
    canRead?: boolean;
    memberSpaceIds?: string[];
    available?: boolean;
  } = {},
) {
  const retrieval = {
    retrieve: jest.fn().mockResolvedValue(opts.context ?? makeContext()),
  };
  const aiProvider = {
    isAvailable: jest.fn().mockReturnValue(opts.available ?? true),
    stream: jest.fn().mockReturnValue({
      textStream: (async function* () {
        yield 'Hello';
        yield ' world';
      })(),
    }),
  };
  const spaceAbility = {
    createForUser: jest
      .fn()
      .mockResolvedValue(makeAbility(opts.canRead ?? true)),
  };
  const spaceMemberRepo = {
    getUserSpaceIds: jest
      .fn()
      .mockResolvedValue(opts.memberSpaceIds ?? ['sp-1', 'sp-2']),
  };
  const sourceService = {
    enrichPageSources: jest.fn().mockImplementation(async (sources: any[]) => {
      for (const s of sources) {
        if (s.kind !== 'page') continue;
        s.slugId = 'slug-' + s.sourceId;
        s.spaceSlug = 'space-slug';
        s.spaceName = 'Space';
        s.verifiedAt = '2026-10-01T00:00:00.000Z';
        s.verifiedBy = 'Vera';
        s.verified = true;
      }
      return sources;
    }),
  };
  const controller = new AiAnswersController(
    retrieval as any,
    aiProvider as any,
    spaceAbility as any,
    spaceMemberRepo as any,
    sourceService as any,
  );
  return {
    controller,
    retrieval,
    aiProvider,
    spaceAbility,
    spaceMemberRepo,
    sourceService,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiAnswersController.answers()', () => {
  describe('permission scoping (cross-space leak guard)', () => {
    it('without spaceId, scopes retrieval to the spaces the user is a member of', async () => {
      const { controller, retrieval, spaceMemberRepo, spaceAbility } = setup({
        memberSpaceIds: ['sp-1', 'sp-2'],
      });
      const { reply } = makeReply();

      await controller.answers({ query: 'Q' } as any, USER, WS, reply as any);

      expect(spaceMemberRepo.getUserSpaceIds).toHaveBeenCalledWith('user-1');
      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
      expect(retrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          spaceId: undefined,
          spaceIds: ['sp-1', 'sp-2'],
          question: 'Q',
        }),
      );
    });

    it('without spaceId and with no readable space, never calls retrieval (no embedding call)', async () => {
      const { controller, retrieval, aiProvider } = setup({
        memberSpaceIds: [],
      });
      const { reply, events } = makeReply();

      await controller.answers({ query: 'Q' } as any, USER, WS, reply as any);

      expect(retrieval.retrieve).not.toHaveBeenCalled();
      // The model is still asked, but with the empty-context refusal prompt
      // and without a sources event.
      expect(aiProvider.stream).toHaveBeenCalledTimes(1);
      const arg = aiProvider.stream.mock.calls[0][0];
      expect(arg.system).toMatch(
        /No content in the workspace knowledge base matched/,
      );
      expect(events().some((e) => e.sources)).toBe(false);
    });

    it('with spaceId the user cannot read, responds 403 and never retrieves', async () => {
      const { controller, retrieval } = setup({ canRead: false });
      const { reply } = makeReply();

      await expect(
        controller.answers(
          { query: 'Q', spaceId: 'sp-9' } as any,
          USER,
          WS,
          reply as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(retrieval.retrieve).not.toHaveBeenCalled();
    });

    it('with spaceId the user can read, retrieves in that space only', async () => {
      const { controller, retrieval, spaceAbility, spaceMemberRepo } = setup({
        canRead: true,
      });
      const { reply } = makeReply();

      await controller.answers(
        { query: 'Q', spaceId: 'sp-1' } as any,
        USER,
        WS,
        reply as any,
      );

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(USER, 'sp-1');
      expect(spaceMemberRepo.getUserSpaceIds).not.toHaveBeenCalled();
      expect(retrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'sp-1', spaceIds: undefined }),
      );
    });

    it('responds 503 when AI is not configured', async () => {
      const { controller } = setup({ available: false });
      const { reply } = makeReply();

      await expect(
        controller.answers({ query: 'Q' } as any, USER, WS, reply as any),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('SSE shape', () => {
    it('emits an enriched sources event first, then content, then [DONE]', async () => {
      const { controller, sourceService } = setup();
      const { reply, writes, events } = makeReply();

      await controller.answers({ query: 'Q' } as any, USER, WS, reply as any);

      const evs = events();
      expect(evs[0]).toHaveProperty('sources');
      expect(evs.slice(1).map((e) => e.content)).toEqual(['Hello', ' world']);
      expect(writes[writes.length - 1]).toBe('data: [DONE]\n\n');
      expect(sourceService.enrichPageSources).toHaveBeenCalledTimes(1);

      const page = evs[0].sources.find((s: any) => s.kind === 'page');
      expect(page).toMatchObject({
        pageId: 'p1',
        sourceId: 'p1',
        title: 'Page A',
        label: 'P1',
        score: 0.8,
        similarity: 0.8,
        excerpt: 'Page text here',
        chunkIndex: 2,
        slugId: 'slug-p1',
        spaceSlug: 'space-slug',
        spaceName: 'Space',
        verifiedAt: '2026-10-01T00:00:00.000Z',
        verifiedBy: 'Vera',
        verified: true,
        matchedBy: ['vector', 'lexical'],
      });

      const insight = evs[0].sources.find(
        (s: any) => s.kind === 'expert_insight',
      );
      expect(insight).toMatchObject({
        pageId: 'i1',
        label: 'E1',
        verified: false,
      });
      expect(insight.slugId).toBeUndefined();
    });

    it('still streams the answer when source enrichment fails', async () => {
      const { controller, sourceService } = setup();
      sourceService.enrichPageSources.mockRejectedValue(new Error('db down'));
      const { reply, events } = makeReply();

      await controller.answers({ query: 'Q' } as any, USER, WS, reply as any);

      const evs = events();
      expect(evs[0].sources).toHaveLength(2);
      expect(evs[0].sources[0].verified).toBe(false);
      expect(evs.map((e) => e.content).filter(Boolean)).toEqual([
        'Hello',
        ' world',
      ]);
    });

    it('tells the model to answer in the language of the question', async () => {
      const { controller, aiProvider } = setup();
      const { reply } = makeReply();

      await controller.answers({ query: 'Q' } as any, USER, WS, reply as any);

      const arg = aiProvider.stream.mock.calls[0][0];
      expect(arg.system).toMatch(/language of the question/i);
      expect(arg.prompt).toContain('[P1] Page A');
    });
  });
});
