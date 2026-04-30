import { InsightIndexerService } from './insight-indexer.service';
import { ChunkingService } from './chunking.service';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { EmbeddingRepository } from './embedding.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InsightRow = {
  id: string;
  title: string | null;
  body: string | null;
  status: 'draft' | 'published' | 'retired';
  deletedAt: Date | null;
};

function makeDbWithInsight(insight: InsightRow | undefined) {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: jest.fn().mockResolvedValue(insight),
        }),
      }),
    }),
  } as any;
}

function makeAiProvider(overrides: {
  available?: boolean;
  dimension?: number;
  embedMany?: jest.Mock;
} = {}): jest.Mocked<Pick<AiProviderService, 'isAvailable' | 'getEmbeddingDimension' | 'embedMany'>> {
  return {
    isAvailable: jest.fn().mockReturnValue(overrides.available ?? true),
    getEmbeddingDimension: jest.fn().mockReturnValue(overrides.dimension ?? 1024),
    embedMany: overrides.embedMany ?? jest.fn().mockResolvedValue([[0.1, 0.2]]),
  } as any;
}

function makeEnv(overrides: {
  model?: string;
  chunkChars?: number;
  overlap?: number;
  batchSize?: number;
} = {}): jest.Mocked<Pick<
  EnvironmentService,
  | 'getAiEmbeddingModel'
  | 'getAiEmbeddingChunkChars'
  | 'getAiEmbeddingChunkOverlap'
  | 'getAiEmbeddingBatchSize'
>> {
  return {
    getAiEmbeddingModel: jest.fn().mockReturnValue(overrides.model ?? 'mistral-embed'),
    getAiEmbeddingChunkChars: jest.fn().mockReturnValue(overrides.chunkChars ?? 1600),
    getAiEmbeddingChunkOverlap: jest.fn().mockReturnValue(overrides.overlap ?? 200),
    getAiEmbeddingBatchSize: jest.fn().mockReturnValue(overrides.batchSize ?? 32),
  } as any;
}

function makeRepo(): jest.Mocked<EmbeddingRepository> {
  return {
    isContentUnchanged: jest.fn().mockResolvedValue(false),
    upsertChunks: jest.fn().mockResolvedValue(undefined),
    deleteBySource: jest.fn().mockResolvedValue(undefined),
    deleteBySourceIds: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeSvc(
  insight: InsightRow | undefined,
  aiProvider?: ReturnType<typeof makeAiProvider>,
  env?: ReturnType<typeof makeEnv>,
  repo?: jest.Mocked<EmbeddingRepository>,
  chunking?: ChunkingService,
) {
  return new InsightIndexerService(
    makeDbWithInsight(insight),
    (aiProvider ?? makeAiProvider()) as any,
    (env ?? makeEnv()) as any,
    chunking ?? new ChunkingService(),
    repo ?? makeRepo(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InsightIndexerService.indexInsight()', () => {
  const WS = 'ws-1';
  const SPACE_ID = 'sp-1';
  const INSIGHT_ID = 'insight-uuid';

  describe('early exit: AI unavailable', () => {
    it('returns ai_unavailable without touching the DB or repo', async () => {
      const ai = makeAiProvider({ available: false });
      const repo = makeRepo();
      const svc = makeSvc(undefined, ai, undefined, repo);

      const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(result.status).toBe('ai_unavailable');
      expect(ai.embedMany).not.toHaveBeenCalled();
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });
  });

  describe('early exit: insight not found', () => {
    it('deletes embeddings and returns deleted', async () => {
      const repo = makeRepo();
      const svc = makeSvc(undefined, undefined, undefined, repo);

      const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(result.status).toBe('deleted');
      expect(repo.deleteBySource).toHaveBeenCalledWith('expert_insight', INSIGHT_ID);
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });
  });

  describe('early exit: insight soft-deleted', () => {
    it('deletes embeddings and returns deleted', async () => {
      const repo = makeRepo();
      const insight: InsightRow = {
        id: INSIGHT_ID, title: 'T', body: 'B', status: 'published', deletedAt: new Date(),
      };
      const svc = makeSvc(insight, undefined, undefined, repo);

      const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(result.status).toBe('deleted');
      expect(repo.deleteBySource).toHaveBeenCalledWith('expert_insight', INSIGHT_ID);
    });
  });

  describe('early exit: empty content', () => {
    it.each<[string | null, string | null]>([
      [null, null],
      ['', ''],
      ['  ', '  '],
    ])(
      'returns no_content when title=%j and body=%j',
      async (title, body) => {
        const repo = makeRepo();
        const insight: InsightRow = {
          id: INSIGHT_ID, title, body, status: 'published', deletedAt: null,
        };
        const svc = makeSvc(insight, undefined, undefined, repo);

        const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

        expect(result.status).toBe('no_content');
        expect(repo.deleteBySource).toHaveBeenCalledWith('expert_insight', INSIGHT_ID);
        expect(repo.upsertChunks).not.toHaveBeenCalled();
      },
    );
  });

  describe('skip: unchanged content hash', () => {
    it('does NOT call embedMany or upsertChunks when hash matches', async () => {
      const ai = makeAiProvider();
      const repo = makeRepo();
      repo.isContentUnchanged.mockResolvedValue(true);

      const insight: InsightRow = {
        id: INSIGHT_ID, title: 'Title', body: 'Body text', status: 'published', deletedAt: null,
      };
      const svc = makeSvc(insight, ai, undefined, repo);

      const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(result.status).toBe('skipped');
      expect(ai.embedMany).not.toHaveBeenCalled();
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });

    it('hashes title + body concatenated', async () => {
      const repo = makeRepo();
      repo.isContentUnchanged.mockResolvedValue(true);

      const insight: InsightRow = {
        id: INSIGHT_ID, title: 'Hello', body: 'World', status: 'published', deletedAt: null,
      };
      const chunking = new ChunkingService();
      const expectedHash = chunking.contentHash('Hello World');
      const svc = makeSvc(insight, undefined, undefined, repo, chunking);

      await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(repo.isContentUnchanged).toHaveBeenCalledWith(
        'expert_insight', INSIGHT_ID, 'mistral-embed', expectedHash,
      );
    });
  });

  describe('happy path: index insight successfully', () => {
    const insight: InsightRow = {
      id: INSIGHT_ID, title: 'Expert Warning', body: 'Do not use deprecated API XYZ.',
      status: 'published', deletedAt: null,
    };
    const text = 'Expert Warning Do not use deprecated API XYZ.';

    it('returns indexed status with correct chunksIndexed count', async () => {
      const chunking = new ChunkingService();
      const expectedChunks = chunking.chunk(text);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(expectedChunks.map(() => [0.1, 0.2])),
      });
      const repo = makeRepo();
      const svc = makeSvc(insight, ai, undefined, repo, chunking);

      const result = await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(result.status).toBe('indexed');
      expect(result.chunksIndexed).toBe(expectedChunks.length);
    });

    it('calls upsertChunks with sourceKind expert_insight and correct metadata', async () => {
      const chunking = new ChunkingService();
      const chunks = chunking.chunk(text);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(chunks.map(() => [0.5])),
      });
      const repo = makeRepo();
      const env = makeEnv({ model: 'mistral-embed' });
      const svc = makeSvc(insight, ai, env, repo, chunking);

      await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      expect(repo.upsertChunks).toHaveBeenCalledTimes(1);
      const call = repo.upsertChunks.mock.calls[0][0];
      expect(call.sourceKind).toBe('expert_insight');
      expect(call.sourceId).toBe(INSIGHT_ID);
      expect(call.workspaceId).toBe(WS);
      expect(call.spaceId).toBe(SPACE_ID);
      expect(call.model).toBe('mistral-embed');
      expect(call.dim).toBe(1024);
      expect(call.chunks).toHaveLength(chunks.length);
      expect(call.chunks[0].metadata).toMatchObject({
        insightId: INSIGHT_ID,
        title: 'Expert Warning',
        spaceId: SPACE_ID,
        workspaceId: WS,
      });
    });
  });

  describe('model fallback', () => {
    it('falls back to "mistral-embed" when env returns empty string', async () => {
      const env = makeEnv({ model: '' });
      const repo = makeRepo();
      const content = 'A useful expert insight.';
      const chunking = new ChunkingService();
      const chunks = chunking.chunk(content);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(chunks.map(() => [0.1])),
      });
      const insight: InsightRow = {
        id: INSIGHT_ID, title: null, body: content, status: 'published', deletedAt: null,
      };
      const svc = makeSvc(insight, ai, env, repo, chunking);

      await svc.indexInsight(INSIGHT_ID, WS, SPACE_ID);

      const call = repo.upsertChunks.mock.calls[0][0];
      expect(call.model).toBe('mistral-embed');
    });
  });

  describe('deleteInsightEmbeddings()', () => {
    it('calls repo.deleteBySource with expert_insight sourceKind', async () => {
      const repo = makeRepo();
      const svc = makeSvc(undefined, undefined, undefined, repo);

      await svc.deleteInsightEmbeddings('insight-42');

      expect(repo.deleteBySource).toHaveBeenCalledWith('expert_insight', 'insight-42');
    });
  });
});
