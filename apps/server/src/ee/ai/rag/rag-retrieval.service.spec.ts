import { Logger } from '@nestjs/common';
import {
  RagRetrievalService,
  joinDedupingOverlap,
  makeExcerpt,
} from './rag-retrieval.service';
import {
  EmbeddingRepository,
  SimilarityResult,
} from '../embeddings/embedding.repository';
import { AiProviderService } from '../providers/ai-provider.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAiProvider(
  embedding: number[] = [0.1, 0.2],
): jest.Mocked<Pick<AiProviderService, 'embed'>> {
  return { embed: jest.fn().mockResolvedValue(embedding) } as any;
}

function makeRepo(
  results: SimilarityResult[] = [],
  lexical: SimilarityResult[] = [],
): jest.Mocked<
  Pick<EmbeddingRepository, 'similaritySearch' | 'lexicalSearch'>
> {
  return {
    similaritySearch: jest.fn().mockResolvedValue(results),
    lexicalSearch: jest.fn().mockResolvedValue(lexical),
  } as any;
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

function makeResult(
  overrides: Partial<SimilarityResult> &
    Pick<SimilarityResult, 'sourceKind' | 'chunkText'>,
): SimilarityResult {
  return {
    sourceId: 'id-1',
    chunkIndex: 0,
    metadata: null,
    score: 0.9,
    ...overrides,
  };
}

function page(
  sourceId: string,
  chunkIndex: number,
  chunkText: string,
  score = 0.9,
  title?: string,
): SimilarityResult {
  return makeResult({
    sourceKind: 'page',
    sourceId,
    chunkIndex,
    chunkText,
    score,
    metadata: title ? { title } : null,
  });
}

// ---------------------------------------------------------------------------
// assembleContext() — the legacy single-list context-building logic
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
        makeResult({
          sourceKind: 'page',
          chunkText: 'Page content A',
          sourceId: 'p1',
        }),
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'Expert insight B',
          sourceId: 'i1',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].kind).toBe('expert_insight');
      expect(ctx.chunks[1].kind).toBe('page');
    });

    it('labels expert insights E1, E2... and pages P1, P2...', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'EI-1',
          sourceId: 'i1',
        }),
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'EI-2',
          sourceId: 'i2',
        }),
        makeResult({ sourceKind: 'page', chunkText: 'P-1', sourceId: 'p1' }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      const labels = ctx.chunks.map((c) => c.label);
      expect(labels).toEqual(['E1', 'E2', 'P1']);
    });

    it('works correctly when all results are expert insights', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'Only experts',
          sourceId: 'i1',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.isEmpty).toBe(false);
      expect(ctx.chunks).toHaveLength(1);
      expect(ctx.chunks[0].kind).toBe('expert_insight');
    });

    it('works correctly when all results are page chunks', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'page',
          chunkText: 'Only pages',
          sourceId: 'p1',
        }),
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
        makeResult({
          sourceKind: 'page',
          chunkText: 'No title',
          metadata: null,
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].title).toBeNull();
    });

    it('sets title to null when metadata has no title field', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'page',
          chunkText: 'No title',
          metadata: { pageId: 'abc' },
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.chunks[0].title).toBeNull();
    });
  });

  describe('excerpt and chunkIndex', () => {
    it('exposes chunkIndex and a single-line excerpt capped at 240 chars', () => {
      const text =
        'First line of the chunk.\n\nSecond   line ' + 'x'.repeat(300);
      const ctx = makeSvc().assembleContext([page('p1', 4, text)]);

      expect(ctx.chunks[0].chunkIndex).toBe(4);
      expect(ctx.chunks[0].excerpt!.length).toBeLessThanOrEqual(240);
      expect(ctx.chunks[0].excerpt).not.toMatch(/\n/);
      expect(
        ctx.chunks[0].excerpt!.startsWith(
          'First line of the chunk. Second line',
        ),
      ).toBe(true);
      expect(ctx.chunks[0].matchedBy).toEqual(['vector']);
    });
  });

  describe('contextText rendering', () => {
    it('renders [Expert Insights] section heading when expert insights are present', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'Insight text',
          metadata: { title: 'T' },
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).toContain('[Expert Insights]');
      expect(ctx.contextText).toContain('[E1] T');
      expect(ctx.contextText).toContain('Insight text');
    });

    it('renders [Pages] section heading when page chunks are present', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'page',
          chunkText: 'Page text',
          metadata: { title: 'PageTitle' },
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).toContain('[Pages]');
      expect(ctx.contextText).toContain('[P1] PageTitle');
      expect(ctx.contextText).toContain('Page text');
    });

    it('renders both sections in order (Expert Insights before Pages)', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'page',
          chunkText: 'Page text',
          sourceId: 'p1',
        }),
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'Insight text',
          sourceId: 'i1',
        }),
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
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: 'EI only',
          sourceId: 'i1',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).not.toContain('[Pages]');
    });

    it('omits [Expert Insights] heading when there are no expert insights', () => {
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'page',
          chunkText: 'Page only',
          sourceId: 'p1',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      expect(ctx.contextText).not.toContain('[Expert Insights]');
    });
  });

  describe('MAX_CONTEXT_CHARS budget (9000)', () => {
    it('truncates chunk text that exceeds the remaining budget', () => {
      // Fill almost the entire budget with the first expert insight chunk
      const bigChunk = 'X'.repeat(8_900);
      const results: SimilarityResult[] = [
        makeResult({
          sourceKind: 'expert_insight',
          chunkText: bigChunk,
          sourceId: 'i1',
        }),
        makeResult({
          sourceKind: 'page',
          chunkText: 'Should be truncated or excluded',
          sourceId: 'p1',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      const totalChars = ctx.chunks.reduce(
        (sum, c) => sum + c.chunkText.length,
        0,
      );
      expect(totalChars).toBeLessThanOrEqual(9_000);
    });

    it('stops adding chunks once the budget is exhausted', () => {
      const full = 'A'.repeat(9_000);
      const results: SimilarityResult[] = [
        makeResult({ sourceKind: 'page', chunkText: full, sourceId: 'p1' }),
        makeResult({
          sourceKind: 'page',
          chunkText: 'should not appear',
          sourceId: 'p2',
        }),
      ];
      const svc = makeSvc();
      const ctx = svc.assembleContext(results);

      const hasSecond = ctx.chunks.some((c) => c.sourceId === 'p2');
      expect(hasSecond).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Hybrid retrieval: fusion, capping, merging
// ---------------------------------------------------------------------------

describe('RagRetrievalService hybrid retrieval', () => {
  describe('fuse() — Reciprocal Rank Fusion', () => {
    it('ranks a chunk found by both paths above chunks found by one', () => {
      const vector = [page('a', 0, 'A0', 0.9), page('b', 0, 'B0', 0.85)];
      const lexical = [page('c', 0, 'C0', 3), page('b', 0, 'B0', 2)];
      const fused = makeSvc().fuse(vector, lexical);

      expect(fused[0]).toMatchObject({
        sourceId: 'b',
        matchedBy: ['vector', 'lexical'],
        vectorScore: 0.85,
      });
      // b is second in both lists: 1/(60+2) twice; a and c each have a single 1/61.
      expect(fused[0].rrf).toBeCloseTo(2 / 62, 10);
      expect(fused.map((c) => c.sourceId)).toEqual(['b', 'a', 'c']);
    });

    it('keeps a lexical-only chunk with vectorScore null', () => {
      const fused = makeSvc().fuse([], [page('c', 2, 'C2', 5)]);
      expect(fused).toHaveLength(1);
      expect(fused[0].vectorScore).toBeNull();
      expect(fused[0].matchedBy).toEqual(['lexical']);
    });
  });

  describe('assembleFused() — relevance floor', () => {
    it('drops vector-only chunks below minScore but keeps lexical hits regardless', () => {
      const vector = [
        page('strong', 0, 'strong', 0.9),
        page('weak', 0, 'weak', 0.3),
      ];
      const lexical = [page('exact', 0, 'exact name match', 1)];
      const ctx = makeSvc().assembleFused(vector, lexical, { minScore: 0.5 });

      expect(ctx.chunks.map((c) => c.sourceId).sort()).toEqual([
        'exact',
        'strong',
      ]);
    });

    it('keeps a weak vector chunk that the lexical path also found', () => {
      const vector = [page('both', 0, 'both', 0.3)];
      const lexical = [page('both', 0, 'both', 1)];
      const ctx = makeSvc().assembleFused(vector, lexical, { minScore: 0.5 });

      expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['both']);
      expect(ctx.chunks[0].score).toBe(0.3);
    });
  });

  describe('assembleFused() — per-source cap and topK', () => {
    it('keeps at most 3 chunks per source', () => {
      const vector = Array.from({ length: 8 }, (_, i) =>
        page('big', i * 2, `big-${i}`, 0.9 - i * 0.01),
      );
      vector.push(page('other', 0, 'other', 0.5));
      const ctx = makeSvc().assembleFused(vector, [], { topK: 10 });

      // Non-adjacent chunk indices stay separate passages.
      const big = ctx.chunks.filter((c) => c.sourceId === 'big');
      expect(big).toHaveLength(3);
      expect(ctx.chunks.some((c) => c.sourceId === 'other')).toBe(true);
    });

    it('limits the number of fused candidates to topK', () => {
      const vector = Array.from({ length: 12 }, (_, i) =>
        page(`p${i}`, 0, `t${i}`, 0.9 - i * 0.01),
      );
      const ctx = makeSvc().assembleFused(vector, [], { topK: 4 });
      expect(ctx.chunks).toHaveLength(4);
      expect(ctx.chunks.map((c) => c.sourceId)).toEqual([
        'p0',
        'p1',
        'p2',
        'p3',
      ]);
    });
  });

  describe('assembleFused() — merging adjacent chunks', () => {
    it('merges consecutive chunk indices of one page into one passage, deduping the overlap', () => {
      const c0 = 'Alpha sentence one. Beta sentence two. Gamma sentence three.';
      const c1 = 'Gamma sentence three. Delta sentence four.';
      const c2 = 'Delta sentence four. Epsilon sentence five.';
      const vector = [
        page('p', 1, c1, 0.8, 'Doc'),
        page('p', 0, c0, 0.7, 'Doc'),
        page('p', 2, c2, 0.6, 'Doc'),
      ];
      const ctx = makeSvc().assembleFused(vector, []);

      expect(ctx.chunks).toHaveLength(1);
      const passage = ctx.chunks[0];
      expect(passage.chunkIndex).toBe(0);
      expect(passage.title).toBe('Doc');
      expect(passage.chunkText).toBe(
        'Alpha sentence one. Beta sentence two. Gamma sentence three.\nDelta sentence four.\nEpsilon sentence five.',
      );
      expect(passage.score).toBe(0.8);
      expect(passage.label).toBe('P1');
    });

    it('does not merge chunks with a gap between their indices', () => {
      const vector = [page('p', 0, 'zero'), page('p', 2, 'two')];
      const ctx = makeSvc().assembleFused(vector, []);
      expect(ctx.chunks).toHaveLength(2);
      expect(ctx.chunks.map((c) => c.chunkIndex).sort()).toEqual([0, 2]);
    });

    it('estimates the score of a lexical-only passage from its vector sibling, else 0.5', () => {
      const vector = [page('p', 0, 'vector chunk', 0.77)];
      const lexical = [
        page('p', 5, 'lexical-only chunk', 9),
        page('q', 0, 'lonely lexical', 9),
      ];
      const ctx = makeSvc().assembleFused(vector, lexical);

      const bySource = Object.fromEntries(
        ctx.chunks.map((c) => [`${c.sourceId}:${c.chunkIndex}`, c]),
      );
      expect(bySource['p:5'].score).toBe(0.77);
      expect(bySource['p:5'].matchedBy).toEqual(['lexical']);
      expect(bySource['q:0'].score).toBe(0.5);
    });

    it('orders passages by their best RRF score', () => {
      const vector = [page('low', 0, 'low', 0.9), page('high', 3, 'high', 0.5)];
      const lexical = [page('high', 3, 'high', 1)];
      const ctx = makeSvc().assembleFused(vector, lexical);
      expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['high', 'low']);
    });
  });

  describe('retrieve() — orchestration', () => {
    it('runs vector and lexical searches with topK*2 over the same scope and fuses them', async () => {
      const ai = makeAiProvider([0.3, 0.7]);
      const repo = makeRepo(
        [page('v', 0, 'vector hit', 0.9)],
        [page('l', 0, 'lexical hit', 1)],
      );
      const svc = new RagRetrievalService(
        ai as any,
        repo as any,
        makeEnv(0) as any,
      );

      const ctx = await svc.retrieve({
        question: 'Qui est Dupont ?',
        workspaceId: 'ws',
        spaceIds: ['sp-1'],
        pageId: 'page-99',
        topK: 5,
      });

      expect(ai.embed).toHaveBeenCalledWith('Qui est Dupont ?');
      expect(repo.similaritySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws',
          spaceIds: ['sp-1'],
          sourceId: 'page-99',
          queryEmbedding: [0.3, 0.7],
          topK: 10,
        }),
      );
      expect(repo.lexicalSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws',
          spaceIds: ['sp-1'],
          sourceId: 'page-99',
          query: 'Qui est Dupont ?',
          topK: 10,
        }),
      );
      expect(ctx.chunks.map((c) => c.sourceId).sort()).toEqual(['l', 'v']);
    });

    it('passes spaceId through to both searches', async () => {
      const repo = makeRepo([], []);
      const svc = new RagRetrievalService(
        makeAiProvider() as any,
        repo as any,
        makeEnv() as any,
      );

      await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp-42',
      });

      expect(repo.similaritySearch).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'sp-42', topK: 20 }),
      );
      expect(repo.lexicalSearch).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'sp-42', topK: 20 }),
      );
    });

    it('returns empty context without any search when spaceIds is an empty allow-list', async () => {
      const ai = makeAiProvider();
      const repo = makeRepo([page('p', 0, 'leak')], [page('p', 0, 'leak')]);
      const svc = new RagRetrievalService(
        ai as any,
        repo as any,
        makeEnv() as any,
      );

      const ctx = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceIds: [],
      });

      expect(ctx.isEmpty).toBe(true);
      expect(ai.embed).not.toHaveBeenCalled();
      expect(repo.similaritySearch).not.toHaveBeenCalled();
      expect(repo.lexicalSearch).not.toHaveBeenCalled();
    });

    it('applies the relevance floor to vector-only chunks', async () => {
      const repo = makeRepo([
        page('p1', 0, 'strong', 0.9),
        page('p2', 0, 'weak', 0.3),
      ]);
      const svc = new RagRetrievalService(
        makeAiProvider() as any,
        repo as any,
        makeEnv(0.5) as any,
      );

      const ctx = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp',
      });

      expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['p1']);
    });

    it('keeps all chunks when min score is 0 (filtering disabled)', async () => {
      const repo = makeRepo([page('p1', 0, 'a', 0.9), page('p2', 0, 'b', 0.1)]);
      const svc = new RagRetrievalService(
        makeAiProvider() as any,
        repo as any,
        makeEnv(0) as any,
      );

      const ctx = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp',
      });

      expect(ctx.chunks).toHaveLength(2);
    });

    it('degrades to vector-only when the lexical column is missing (42703), logging once', async () => {
      const repo = makeRepo([page('v', 0, 'vector hit', 0.9)]);
      const missing = Object.assign(new Error('column "tsv" does not exist'), {
        code: '42703',
      });
      repo.lexicalSearch.mockRejectedValue(missing);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const svc = new RagRetrievalService(
        makeAiProvider() as any,
        repo as any,
        makeEnv() as any,
      );

      const first = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp',
      });
      const second = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp',
      });

      expect(first.chunks.map((c) => c.sourceId)).toEqual(['v']);
      expect(second.chunks.map((c) => c.sourceId)).toEqual(['v']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(
        '20261013T120000-ai-embeddings-lexical',
      );
      warn.mockRestore();
    });

    it('degrades to vector-only on any other lexical failure', async () => {
      const repo = makeRepo([page('v', 0, 'vector hit', 0.9)]);
      repo.lexicalSearch.mockRejectedValue(new Error('connection reset'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const svc = new RagRetrievalService(
        makeAiProvider() as any,
        repo as any,
        makeEnv() as any,
      );

      const ctx = await svc.retrieve({
        question: 'Q',
        workspaceId: 'ws',
        spaceId: 'sp',
      });

      expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['v']);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('propagates a vector-path failure (the embedding call is not optional)', async () => {
      const ai = {
        embed: jest.fn().mockRejectedValue(new Error('provider down')),
      };
      const repo = makeRepo([], [page('l', 0, 'lexical')]);
      const svc = new RagRetrievalService(
        ai as any,
        repo as any,
        makeEnv() as any,
      );

      await expect(
        svc.retrieve({ question: 'Q', workspaceId: 'ws', spaceId: 'sp' }),
      ).rejects.toThrow('provider down');
    });
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('joinDedupingOverlap()', () => {
  it('removes the sentence the next chunk repeats from the previous one', () => {
    expect(
      joinDedupingOverlap(
        'One two. Three four five.',
        'Three four five. Six seven.',
      ),
    ).toBe('One two. Three four five.\nSix seven.');
  });

  it('joins plainly when nothing is shared', () => {
    expect(joinDedupingOverlap('abc def ghi jkl', 'mno pqr stu')).toBe(
      'abc def ghi jkl\nmno pqr stu',
    );
  });

  it('ignores short coincidental overlaps inside a word', () => {
    expect(
      joinDedupingOverlap('the end of chunk', 'chunkier text follows here'),
    ).toBe('the end of chunk\nchunkier text follows here');
  });
});

describe('makeExcerpt()', () => {
  it('collapses whitespace and caps at 240 characters with an ellipsis', () => {
    const e = makeExcerpt('a\n\n b \t c ' + 'z'.repeat(500));
    expect(e.startsWith('a b c z')).toBe(true);
    expect(e.length).toBe(240);
    expect(e.endsWith('…')).toBe(true);
  });

  it('returns short text untouched apart from whitespace', () => {
    expect(makeExcerpt('  hello   world ')).toBe('hello world');
  });
});
