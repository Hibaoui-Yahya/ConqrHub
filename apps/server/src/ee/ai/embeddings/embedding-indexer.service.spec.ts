import { EmbeddingIndexerService } from './embedding-indexer.service';
import { ChunkingService } from './chunking.service';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { EmbeddingRepository } from './embedding.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PageRow = {
  id: string;
  title: string | null;
  textContent: string | null;
  spaceId: string;
  deletedAt: Date | null;
};

function makeDbWithPage(page: PageRow | undefined) {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            executeTakeFirst: jest.fn().mockResolvedValue(page),
          }),
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
  page: PageRow | undefined,
  aiProvider?: ReturnType<typeof makeAiProvider>,
  env?: ReturnType<typeof makeEnv>,
  repo?: jest.Mocked<EmbeddingRepository>,
  chunking?: ChunkingService,
) {
  return new EmbeddingIndexerService(
    makeDbWithPage(page),
    (aiProvider ?? makeAiProvider()) as any,
    (env ?? makeEnv()) as any,
    chunking ?? new ChunkingService(),
    repo ?? makeRepo(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbeddingIndexerService.indexPage()', () => {
  const WS = 'ws-1';
  const PAGE_ID = 'page-uuid';
  const SPACE_ID = 'space-uuid';

  describe('early exit: AI unavailable', () => {
    it('returns ai_unavailable immediately without touching the DB or repo', async () => {
      const ai = makeAiProvider({ available: false });
      const repo = makeRepo();
      const svc = makeSvc(undefined, ai, undefined, repo);

      const result = await svc.indexPage(PAGE_ID, WS);

      expect(result.status).toBe('ai_unavailable');
      expect(ai.embedMany).not.toHaveBeenCalled();
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });
  });

  describe('early exit: page not in DB', () => {
    it('returns deleted without calling embedMany or repo writes', async () => {
      const repo = makeRepo();
      const svc = makeSvc(undefined, undefined, undefined, repo);

      const result = await svc.indexPage(PAGE_ID, WS);

      expect(result.status).toBe('deleted');
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });
  });

  describe('early exit: page soft-deleted', () => {
    it('deletes existing embeddings and returns deleted', async () => {
      const repo = makeRepo();
      const page: PageRow = {
        id: PAGE_ID,
        title: 'T',
        textContent: 'Some content',
        spaceId: SPACE_ID,
        deletedAt: new Date(),
      };
      const svc = makeSvc(page, undefined, undefined, repo);

      const result = await svc.indexPage(PAGE_ID, WS);

      expect(result.status).toBe('deleted');
      expect(repo.deleteBySource).toHaveBeenCalledWith('page', PAGE_ID);
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });
  });

  describe('early exit: empty textContent', () => {
    it.each([null, '', '   ', '\n\t'])(
      'deletes any existing embeddings and returns no_content when textContent=%j',
      async (textContent) => {
        const repo = makeRepo();
        const page: PageRow = {
          id: PAGE_ID,
          title: 'T',
          textContent,
          spaceId: SPACE_ID,
          deletedAt: null,
        };
        const svc = makeSvc(page, undefined, undefined, repo);

        const result = await svc.indexPage(PAGE_ID, WS);

        expect(result.status).toBe('no_content');
        expect(repo.deleteBySource).toHaveBeenCalledWith('page', PAGE_ID);
        expect(repo.upsertChunks).not.toHaveBeenCalled();
      },
    );
  });

  describe('skip: unchanged content hash', () => {
    it('does NOT call embedMany or upsertChunks when hash matches', async () => {
      const ai = makeAiProvider();
      const repo = makeRepo();
      repo.isContentUnchanged.mockResolvedValue(true);

      const page: PageRow = {
        id: PAGE_ID,
        title: 'T',
        textContent: 'Hello world',
        spaceId: SPACE_ID,
        deletedAt: null,
      };
      const svc = makeSvc(page, ai, undefined, repo);

      const result = await svc.indexPage(PAGE_ID, WS);

      expect(result.status).toBe('skipped');
      expect(ai.embedMany).not.toHaveBeenCalled();
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    });

    it('passes the correct contentHash to isContentUnchanged', async () => {
      const repo = makeRepo();
      repo.isContentUnchanged.mockResolvedValue(true);

      const content = 'Hello world deterministic';
      const page: PageRow = {
        id: PAGE_ID, title: null, textContent: content, spaceId: SPACE_ID, deletedAt: null,
      };
      const chunking = new ChunkingService();
      const expectedHash = chunking.contentHash(content);
      const svc = makeSvc(page, undefined, undefined, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      expect(repo.isContentUnchanged).toHaveBeenCalledWith(
        'page', PAGE_ID, 'mistral-embed', expectedHash,
      );
    });
  });

  describe('happy path: index page successfully', () => {
    const content = 'The quick brown fox jumps over the lazy dog.';
    const page: PageRow = {
      id: PAGE_ID, title: 'My Page', textContent: content, spaceId: SPACE_ID, deletedAt: null,
    };

    it('returns indexed status with correct chunksIndexed count', async () => {
      const chunking = new ChunkingService();
      const expectedChunks = chunking.chunk(content);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(expectedChunks.map(() => [0.1, 0.2])),
      });
      const repo = makeRepo();
      const svc = makeSvc(page, ai, undefined, repo, chunking);

      const result = await svc.indexPage(PAGE_ID, WS);

      expect(result.status).toBe('indexed');
      expect(result.chunksIndexed).toBe(expectedChunks.length);
    });

    it('calls upsertChunks with correct metadata on every chunk', async () => {
      const chunking = new ChunkingService();
      const chunks = chunking.chunk(content);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(chunks.map(() => [0.5])),
      });
      const repo = makeRepo();
      const env = makeEnv({ model: 'mistral-embed' });
      const svc = makeSvc(page, ai, env, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      expect(repo.upsertChunks).toHaveBeenCalledTimes(1);
      const call = repo.upsertChunks.mock.calls[0][0];
      expect(call.sourceKind).toBe('page');
      expect(call.sourceId).toBe(PAGE_ID);
      expect(call.workspaceId).toBe(WS);
      expect(call.spaceId).toBe(SPACE_ID);
      expect(call.model).toBe('mistral-embed');
      expect(call.dim).toBe(1024);
      expect(call.chunks).toHaveLength(chunks.length);
      expect(call.chunks[0].metadata).toMatchObject({
        pageId: PAGE_ID,
        title: 'My Page',
        spaceId: SPACE_ID,
        workspaceId: WS,
      });
    });

    it('passes the real contentHash to upsertChunks', async () => {
      const chunking = new ChunkingService();
      const chunks = chunking.chunk(content);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(chunks.map(() => [0.1])),
      });
      const repo = makeRepo();
      const svc = makeSvc(page, ai, undefined, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      const call = repo.upsertChunks.mock.calls[0][0];
      expect(call.contentHash).toBe(chunking.contentHash(content));
    });
  });

  describe('batching: embedMany is called in batch-size increments', () => {
    it('makes ceil(chunks / batchSize) calls to embedMany', async () => {
      // batchSize=2, chunkChars=5, overlap=0 → many small chunks
      const env = makeEnv({ batchSize: 2, chunkChars: 5, overlap: 0 });

      // 50 chars → 10 chunks of 5 chars each
      const textContent = 'ABCDE'.repeat(10);
      const chunking = new ChunkingService();
      const chunkCount = chunking.chunk(textContent, { chunkChars: 5, overlap: 0 }).length;
      expect(chunkCount).toBe(10);

      // embedMany returns one vector per text in the batch
      const embedMany = jest.fn().mockImplementation(
        (texts: string[]) => Promise.resolve(texts.map(() => [0.1])),
      );
      const ai = makeAiProvider({ embedMany });
      const repo = makeRepo();

      const page: PageRow = {
        id: PAGE_ID, title: null, textContent, spaceId: SPACE_ID, deletedAt: null,
      };
      const svc = makeSvc(page, ai, env, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      const expectedBatches = Math.ceil(chunkCount / 2);
      expect(embedMany).toHaveBeenCalledTimes(expectedBatches);
    });

    it('assembles all embeddings in order across batches', async () => {
      const env = makeEnv({ batchSize: 1, chunkChars: 5, overlap: 0 });
      const textContent = 'AAAAA' + 'BBBBB';
      const chunking = new ChunkingService();

      let callIndex = 0;
      const embedMany = jest.fn().mockImplementation(() =>
        Promise.resolve([[callIndex++ * 0.1]]),
      );
      const ai = makeAiProvider({ embedMany });
      const repo = makeRepo();

      const page: PageRow = {
        id: PAGE_ID, title: null, textContent, spaceId: SPACE_ID, deletedAt: null,
      };
      const svc = makeSvc(page, ai, env, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      const upsertCall = repo.upsertChunks.mock.calls[0][0];
      expect(upsertCall.chunks[0].embedding).toEqual([0]);
      expect(upsertCall.chunks[1].embedding).toEqual([0.1]);
    });
  });

  describe('model fallback', () => {
    it('falls back to "mistral-embed" when env returns falsy model', async () => {
      const env = makeEnv({ model: '' });
      const repo = makeRepo();
      const content = 'Some content for testing.';
      const chunking = new ChunkingService();
      const chunks = chunking.chunk(content);
      const ai = makeAiProvider({
        embedMany: jest.fn().mockResolvedValue(chunks.map(() => [0.1])),
      });
      const page: PageRow = {
        id: PAGE_ID, title: null, textContent: content, spaceId: SPACE_ID, deletedAt: null,
      };
      const svc = makeSvc(page, ai, env, repo, chunking);

      await svc.indexPage(PAGE_ID, WS);

      const call = repo.upsertChunks.mock.calls[0][0];
      expect(call.model).toBe('mistral-embed');
    });
  });

  describe('deletePageEmbeddings / deletePageEmbeddingsBatch', () => {
    it('deletePageEmbeddings calls repo.deleteBySource("page", id)', async () => {
      const repo = makeRepo();
      const svc = makeSvc(undefined, undefined, undefined, repo);
      await svc.deletePageEmbeddings('page-42');
      expect(repo.deleteBySource).toHaveBeenCalledWith('page', 'page-42');
    });

    it('deletePageEmbeddingsBatch calls repo.deleteBySourceIds("page", ids)', async () => {
      const repo = makeRepo();
      const svc = makeSvc(undefined, undefined, undefined, repo);
      await svc.deletePageEmbeddingsBatch(['a', 'b', 'c']);
      expect(repo.deleteBySourceIds).toHaveBeenCalledWith('page', ['a', 'b', 'c']);
    });
  });
});
