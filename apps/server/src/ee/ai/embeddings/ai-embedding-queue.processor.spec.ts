import { AiEmbeddingQueueProcessor } from './ai-embedding-queue.processor';
import { EmbeddingIndexerService } from './embedding-indexer.service';
import { InsightIndexerService } from './insight-indexer.service';
import { EmbeddingRepository } from './embedding.repository';
import { QueueJob } from '../../../integrations/queue/constants';
import { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data } as Job;
}

/** DB stub used when the processor needs to list pages for a workspace. */
function makeDb(pages: { id: string }[] = [{ id: 'p1' }, { id: 'p2' }]) {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            execute: jest.fn().mockResolvedValue(pages),
          }),
        }),
      }),
    }),
  } as any;
}

function makeIndexer(): jest.Mocked<EmbeddingIndexerService> {
  return {
    indexPage: jest.fn().mockResolvedValue({ pageId: 'p1', status: 'indexed', chunksIndexed: 3 }),
    deletePageEmbeddings: jest.fn().mockResolvedValue(undefined),
    deletePageEmbeddingsBatch: jest.fn().mockResolvedValue(undefined),
    reassignPageSpace: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeRepo(): jest.Mocked<EmbeddingRepository> {
  return {
    deleteByWorkspace: jest.fn().mockResolvedValue(undefined),
    deleteBySpace: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeInsightIndexer(): jest.Mocked<InsightIndexerService> {
  return {
    indexInsight: jest.fn().mockResolvedValue({ insightId: 'i1', status: 'indexed', chunksIndexed: 1 }),
    deleteInsightEmbeddings: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeProcessor(
  overrides: {
    pages?: { id: string }[];
    indexer?: jest.Mocked<EmbeddingIndexerService>;
    insightIndexer?: jest.Mocked<InsightIndexerService>;
    repo?: jest.Mocked<EmbeddingRepository>;
  } = {},
) {
  return new AiEmbeddingQueueProcessor(
    makeDb(overrides.pages),
    overrides.indexer ?? makeIndexer(),
    overrides.insightIndexer ?? makeInsightIndexer(),
    overrides.repo ?? makeRepo(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiEmbeddingQueueProcessor.process()', () => {
  // ── Index-triggering jobs ─────────────────────────────────────────────────

  describe.each([
    [QueueJob.PAGE_CREATED],
    [QueueJob.PAGE_CONTENT_UPDATED],
    [QueueJob.PAGE_RESTORED],
    [QueueJob.GENERATE_PAGE_EMBEDDINGS],
    [QueueJob.PAGE_UPDATED],
  ])('%s → calls indexPage for each pageId', (jobName) => {
    it(`${jobName} indexes both pages in order`, async () => {
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer });

      await proc.process(makeJob(jobName, { pageIds: ['p1', 'p2'], workspaceId: 'ws' }));

      expect(indexer.indexPage).toHaveBeenCalledTimes(2);
      expect(indexer.indexPage).toHaveBeenNthCalledWith(1, 'p1', 'ws');
      expect(indexer.indexPage).toHaveBeenNthCalledWith(2, 'p2', 'ws');
    });

    it(`${jobName} does NOT call delete helpers`, async () => {
      const indexer = makeIndexer();
      const repo = makeRepo();
      const proc = makeProcessor({ indexer, repo });

      await proc.process(makeJob(jobName, { pageIds: ['p1'], workspaceId: 'ws' }));

      expect(indexer.deletePageEmbeddingsBatch).not.toHaveBeenCalled();
      expect(repo.deleteByWorkspace).not.toHaveBeenCalled();
      expect(repo.deleteBySpace).not.toHaveBeenCalled();
    });
  });

  // ── Space move ────────────────────────────────────────────────────────────

  describe('PAGE_MOVED_TO_SPACE', () => {
    it('reassigns each page space without re-embedding', async () => {
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer });

      await proc.process(
        makeJob(QueueJob.PAGE_MOVED_TO_SPACE, {
          pageIds: ['p1', 'p2'],
          workspaceId: 'ws',
        }),
      );

      expect(indexer.reassignPageSpace).toHaveBeenCalledTimes(2);
      expect(indexer.reassignPageSpace).toHaveBeenNthCalledWith(1, 'p1', 'ws');
      expect(indexer.reassignPageSpace).toHaveBeenNthCalledWith(2, 'p2', 'ws');
      expect(indexer.indexPage).not.toHaveBeenCalled();
    });
  });

  // ── Delete-triggering jobs ────────────────────────────────────────────────

  describe.each([
    [QueueJob.PAGE_DELETED],
    [QueueJob.PAGE_SOFT_DELETED],
    [QueueJob.DELETE_PAGE_EMBEDDINGS],
  ])('%s → calls deletePageEmbeddingsBatch', (jobName) => {
    it(`${jobName} deletes the given page IDs`, async () => {
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer });

      await proc.process(makeJob(jobName, { pageIds: ['p1', 'p2'], workspaceId: 'ws' }));

      expect(indexer.deletePageEmbeddingsBatch).toHaveBeenCalledWith(['p1', 'p2']);
      expect(indexer.indexPage).not.toHaveBeenCalled();
    });
  });

  // ── Workspace-level jobs ──────────────────────────────────────────────────

  describe('WORKSPACE_CREATE_EMBEDDINGS', () => {
    it('queries all non-deleted workspace pages and indexes each one', async () => {
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer, pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });

      await proc.process(makeJob(QueueJob.WORKSPACE_CREATE_EMBEDDINGS, { workspaceId: 'ws' }));

      expect(indexer.indexPage).toHaveBeenCalledTimes(3);
      expect(indexer.indexPage).toHaveBeenCalledWith('p1', 'ws');
      expect(indexer.indexPage).toHaveBeenCalledWith('p2', 'ws');
      expect(indexer.indexPage).toHaveBeenCalledWith('p3', 'ws');
    });

    it('continues indexing other pages when one throws (per-page error isolation)', async () => {
      const indexer = makeIndexer();
      // p1 succeeds, p2 throws, p3 succeeds
      indexer.indexPage
        .mockResolvedValueOnce({ pageId: 'p1', status: 'indexed', chunksIndexed: 1 })
        .mockRejectedValueOnce(new Error('API rate limit'))
        .mockResolvedValueOnce({ pageId: 'p3', status: 'indexed', chunksIndexed: 1 });

      const proc = makeProcessor({
        indexer,
        pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      });

      await expect(
        proc.process(makeJob(QueueJob.WORKSPACE_CREATE_EMBEDDINGS, { workspaceId: 'ws' })),
      ).resolves.not.toThrow();

      expect(indexer.indexPage).toHaveBeenCalledTimes(3);
    });

    it('handles an empty workspace gracefully', async () => {
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer, pages: [] });

      await expect(
        proc.process(makeJob(QueueJob.WORKSPACE_CREATE_EMBEDDINGS, { workspaceId: 'ws' })),
      ).resolves.not.toThrow();

      expect(indexer.indexPage).not.toHaveBeenCalled();
    });
  });

  describe('WORKSPACE_DELETE_EMBEDDINGS', () => {
    it('calls repo.deleteByWorkspace with the given workspaceId', async () => {
      const repo = makeRepo();
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer, repo });

      await proc.process(makeJob(QueueJob.WORKSPACE_DELETE_EMBEDDINGS, { workspaceId: 'ws-99' }));

      expect(repo.deleteByWorkspace).toHaveBeenCalledWith('ws-99');
      expect(indexer.indexPage).not.toHaveBeenCalled();
    });
  });

  describe('SPACE_DELETED', () => {
    it('calls repo.deleteBySpace with the given spaceId', async () => {
      const repo = makeRepo();
      const indexer = makeIndexer();
      const proc = makeProcessor({ indexer, repo });

      await proc.process(makeJob(QueueJob.SPACE_DELETED, { spaceId: 'sp-42' }));

      expect(repo.deleteBySpace).toHaveBeenCalledWith('sp-42');
      expect(indexer.indexPage).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error propagation', () => {
    it('re-throws when indexPage fails inside indexPages (allows queue retry)', async () => {
      const indexer = makeIndexer();
      indexer.indexPage.mockRejectedValue(new Error('Mistral 503'));

      const proc = makeProcessor({ indexer });

      await expect(
        proc.process(makeJob(QueueJob.PAGE_CREATED, { pageIds: ['p1'], workspaceId: 'ws' })),
      ).rejects.toThrow('Mistral 503');
    });

    it('stops processing subsequent pages after one throws in indexPages', async () => {
      const indexer = makeIndexer();
      indexer.indexPage
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue({ pageId: 'p2', status: 'indexed' });

      const proc = makeProcessor({ indexer });

      await expect(
        proc.process(makeJob(QueueJob.PAGE_CREATED, { pageIds: ['p1', 'p2'], workspaceId: 'ws' })),
      ).rejects.toThrow('fail');

      // p2 never reached because p1 threw and we rethrew immediately
      expect(indexer.indexPage).toHaveBeenCalledTimes(1);
    });
  });

  // ── Expert insight jobs ───────────────────────────────────────────────────

  describe('GENERATE_INSIGHT_EMBEDDINGS', () => {
    it('calls insightIndexer.indexInsight with correct args', async () => {
      const insightIndexer = makeInsightIndexer();
      const proc = makeProcessor({ insightIndexer });

      await proc.process(makeJob(QueueJob.GENERATE_INSIGHT_EMBEDDINGS, {
        insightId: 'i1', workspaceId: 'ws', spaceId: 'sp',
      }));

      expect(insightIndexer.indexInsight).toHaveBeenCalledWith('i1', 'ws', 'sp');
    });

    it('re-throws when indexInsight fails (allows queue retry)', async () => {
      const insightIndexer = makeInsightIndexer();
      insightIndexer.indexInsight.mockRejectedValue(new Error('AI down'));
      const proc = makeProcessor({ insightIndexer });

      await expect(
        proc.process(makeJob(QueueJob.GENERATE_INSIGHT_EMBEDDINGS, {
          insightId: 'i1', workspaceId: 'ws', spaceId: 'sp',
        })),
      ).rejects.toThrow('AI down');
    });
  });

  describe('DELETE_INSIGHT_EMBEDDINGS', () => {
    it('calls insightIndexer.deleteInsightEmbeddings with the insightId', async () => {
      const insightIndexer = makeInsightIndexer();
      const proc = makeProcessor({ insightIndexer });

      await proc.process(makeJob(QueueJob.DELETE_INSIGHT_EMBEDDINGS, { insightId: 'i99' }));

      expect(insightIndexer.deleteInsightEmbeddings).toHaveBeenCalledWith('i99');
    });
  });

  // ── Unknown jobs ─────────────────────────────────────────────────────────

  describe('unknown job names', () => {
    it('silently ignores unrecognised job names without throwing', async () => {
      const indexer = makeIndexer();
      const repo = makeRepo();
      const proc = makeProcessor({ indexer, repo });

      await expect(
        proc.process(makeJob('some-other-queue-job', {})),
      ).resolves.not.toThrow();

      expect(indexer.indexPage).not.toHaveBeenCalled();
      expect(indexer.deletePageEmbeddingsBatch).not.toHaveBeenCalled();
    });
  });
});
