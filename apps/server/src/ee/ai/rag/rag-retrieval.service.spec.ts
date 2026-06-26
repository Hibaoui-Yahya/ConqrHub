import { RagRetrievalService } from './rag-retrieval.service';
import { EmbeddingRepository, SimilarityResult } from '../embeddings/embedding.repository';
import { AiProviderService } from '../providers/ai-provider.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAiProvider(embedding: number[] = [0.1, 0.2]): jest.Mocked<Pick<AiProviderService, 'embed'>> {
  return { embed: jest.fn().mockResolvedValue(embedding) } as any;
}

function makeRepo(results: SimilarityResult[] = []): jest.Mocked<Pick<EmbeddingRepository, 'similaritySearch'>> {
  return { similaritySearch: jest.fn().mockResolvedValue(results) } as any;
}

// minScore 0 = no relevance filtering, preserving pre-threshold behavior.
function makeEnv(minScore = 0): any {
  return { getAiRagMinScore: jest.fn().mockReturnValue(minScore) };
}

function makeSvc(
  results: SimilarityResult[] = [],
  embedding: number[] = [0.1],
  minScore = 0,
): RagRetrievalService {
  return new RagRetrievalService(
    makeAiProvider(embedding) as any,
    makeRepo(results) as any,
    makeEnv(minScore) as any,
  );
}

function makeResult(overrides: Partial<SimilarityResult> & Pick<SimilarityResult, 'sourceKind' | 'chunkText'>): SimilarityResult {
  return {
    sourceId: 'id-1',
    chunkIndex: 0,
    metadata: null,
    score: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assembleContext() — the core context-building logic
// ---------------------------------------------------------------------------

describe('RagRetrievalService.assembleContext()', () => {
  describe('empty input', () => {
    it('returns isEmpty=true and empty contextText when there are no results', () => {
      const svc = makeSvc();
      const ctx = svc.assembleContext([]);

      expect(ctx.isEmpty).toBe(true);
      expect(ctx.chunks).toHaveLength(0);
      expect(ctx.contextText).toBe('');
    });
  });

  describe('source kind partitioning', () => {
    it('puts expert_insight chunks before page chunks regardless of input order', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'Page content A', sourceId: 'p1' }),
        makeResult({ sourceKind: 'expert_insight', chunkText: 'Expert insight B', sourceId: 'i1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].kind).toBe('expert_insight');
      expect(ctx.chunks[1].kind).toBe('page');
    });

    it('labels expert insights E1, E2... and pages P1, P2...', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'expert_insight', chunkText: 'EI-1', sourceId: 'i1' }),
        makeResult({ sourceKind: 'expert_insight', chunkText: 'EI-2', sourceId: 'i2' }),
        makeResult({ sourceKind: 'page', chunkText: 'P-1', sourceId: 'p1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      const labels = ctx.chunks.map((c) => c.label);
      expect(labels).toEqual(['E1', 'E2', 'P1']);
    });

    it('works correctly when all results are expert insights', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'expert_insight', chunkText: 'Only experts', sourceId: 'i1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.isEmpty).toBe(false);
      expect(ctx.chunks).toHaveLength(1);
      expect(ctx.chunks[0].kind).toBe('expert_insight');
    });

    it('works correctly when all results are page chunks', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'Only pages', sourceId: 'p1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.isEmpty).toBe(false);
      expect(ctx.chunks[0].kind).toBe('page');
    });
  });

  describe('title extraction from metadata', () => {
    it('extracts title when metadata.title is present', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'Some insight',
          metadata: { title: 'My Insight Title' },
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].title).toBe('My Insight Title');
    });

    it('sets title to null when metadata is null', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'No title', metadata: null }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].title).toBeNull();
    });

    it('sets title to null when metadata has no title field', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'No title', metadata: { pageId: 'abc' } }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].title).toBeNull();
    });
  });

  describe('contextText rendering', () => {
    it('renders [Expert Insights] section heading when expert insights are present', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'expert_insight', chunkText: 'Insight text', metadata: { title: 'T' } }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).toContain('[Expert Insights]');
      expect(ctx.contextText).toContain('[E1] T');
      expect(ctx.contextText).toContain('Insight text');
    });

    it('renders [Pages] section heading when page chunks are present', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'Page text', metadata: { title: 'PageTitle' } }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).toContain('[Pages]');
      expect(ctx.contextText).toContain('[P1] PageTitle');
      expect(ctx.contextText).toContain('Page text');
    });

    it('renders both sections in order (Expert Insights before Pages)', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'Page text', sourceId: 'p1' }),
        makeResult({ sourceKind: 'expert_insight', chunkText: 'Insight text', sourceId: 'i1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      const expertIdx = ctx.contextText.indexOf('[Expert Insights]');
      const pagesIdx = ctx.contextText.indexOf('[Pages]');
      expect(expertIdx).toBeGreaterThanOrEqual(0);
      expect(pagesIdx).toBeGreaterThan(expertIdx);
    });

    it('omits [Pages] heading when there are no page chunks', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'expert_insight', chunkText: 'EI only', sourceId: 'i1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).not.toContain('[Pages]');
    });

    it('omits [Expert Insights] heading when there are no expert insights', () => {
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: 'Page only', sourceId: 'p1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).not.toContain('[Expert Insights]');
    });
  });

  describe('MAX_CONTEXT_CHARS budget', () => {
    it('truncates chunk text that exceeds the remaining budget', () => {
      // Fill almost the entire budget with the first expert insight chunk
      const bigChunk = 'X'.repeat(5_900);
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'expert_insight', chunkText: bigChunk, sourceId: 'i1' }),
        makeResult({ sourceKind: 'page', chunkText: 'Should be truncated or excluded', sourceId: 'p1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      // Total chars across all chunk texts must not exceed MAX_CONTEXT_CHARS (6000)
      const totalChars = ctx.chunks.reduce((sum, c) => sum + c.chunkText.length, 0);
      expect(totalChars).toBeLessThanOrEqual(6_000);
    });

    it('stops adding chunks once the budget is exhausted', () => {
      const full = 'A'.repeat(6_000);
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: full, sourceId: 'p1' }),
        makeResult({ sourceKind: 'page', chunkText: 'should not appear', sourceId: 'p2' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      // The second chunk should have 0 chars remaining and get dropped
      const hasSecond = ctx.chunks.some((c) => c.sourceId === 'p2');
      expect(hasSecond).toBe(false);
    });
  });

  describe('retrieve() — relevance floor', () => {
    it('drops chunks scoring below the configured minimum', async () => {
      const ai = makeAiProvider([0.1]);
      const repo = makeRepo([
        makeResult({ sourceKind: 'page', chunkText: 'strong', sourceId: 'p1', score: 0.9 }),
        makeResult({ sourceKind: 'page', chunkText: 'weak', sourceId: 'p2', score: 0.3 }),
      ]);
      const svc = new RagRetrievalService(ai as any, repo as any, makeEnv(0.5) as any);

      const ctx = await svc.retrieve({ question: 'Q', workspaceId: 'ws', spaceId: 'sp' });

      expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['p1']);
    });

    it('keeps all chunks when min score is 0 (filtering disabled)', async () => {
      const ai = makeAiProvider([0.1]);
      const repo = makeRepo([
        makeResult({ sourceKind: 'page', chunkText: 'a', sourceId: 'p1', score: 0.9 }),
        makeResult({ sourceKind: 'page', chunkText: 'b', sourceId: 'p2', score: 0.1 }),
      ]);
      const svc = new RagRetrievalService(ai as any, repo as any, makeEnv(0) as any);

      const ctx = await svc.retrieve({ question: 'Q', workspaceId: 'ws', spaceId: 'sp' });

      expect(ctx.chunks).toHaveLength(2);
    });
  });

  describe('retrieve() — integration with embedding and repo', () => {
    it('calls aiProvider.embed with the question', async () => {
      const ai = makeAiProvider([0.5, 0.6]);
      const repo = makeRepo([]);
      const svc = new RagRetrievalService(ai as any, repo as any, makeEnv() as any);

      await svc.retrieve({
        question: 'What is X?',
        workspaceId: 'ws',
        spaceId: 'sp',
      });

      expect(ai.embed).toHaveBeenCalledWith('What is X?');
    });

    it('passes spaceId and pageId filter through to similaritySearch', async () => {
      const ai = makeAiProvider([0.1]);
      const repo = makeRepo([]);
      const svc = new RagRetrievalService(ai as any, repo as any, makeEnv() as any);

      await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp-42',
        pageId: 'page-99',
        topK: 5,
      });

      expect(repo.similaritySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws',
          spaceId: 'sp-42',
          sourceId: 'page-99',
          topK: 5,
        }),
      );
    });

    it('passes the embedded query vector to similaritySearch', async () => {
      const queryVec = [0.3, 0.7, 0.1];
      const ai = makeAiProvider(queryVec);
      const repo = makeRepo([]);
      const svc = new RagRetrievalService(ai as any, repo as any, makeEnv() as any);

      await svc.retrieve({ question: 'Q', workspaceId: 'ws', spaceId: 'sp' });

      expect(repo.similaritySearch).toHaveBeenCalledWith(
        expect.objectContaining({ queryEmbedding: queryVec }),
      );
    });
  });
});
