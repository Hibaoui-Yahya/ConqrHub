import { RagRetrievalService } from './rag-retrieval.service';
import { SimilarityResult } from '../embeddings/embedding.repository';

const hit = (sourceId: string, chunkText: string): SimilarityResult => ({
  sourceKind: 'page',
  sourceId,
  chunkIndex: 0,
  chunkText,
  metadata: { title: sourceId },
  score: 0.8,
});

function makeSvc(access?: { filter: jest.Mock }) {
  const ai = { embed: jest.fn().mockResolvedValue([0.1]) };
  const repo = {
    similaritySearch: jest
      .fn()
      .mockResolvedValue([
        hit('open', 'Open page text'),
        hit('secret', 'Secret vector text'),
      ]),
    lexicalSearch: jest
      .fn()
      .mockResolvedValue([hit('secret', 'Secret lexical text')]),
  };
  const env = { getAiRagMinScore: jest.fn().mockReturnValue(0) };
  return new RagRetrievalService(
    ai as any,
    repo as any,
    env as any,
    access as any,
  );
}

describe('RagRetrievalService — live access check before any prompt', () => {
  it('filters BOTH the vector and the lexical results for the reader before fusion', async () => {
    const filter = jest.fn(async (rows: SimilarityResult[], _scope: unknown) =>
      rows.filter((r) => r.sourceId === 'open'),
    );
    const ctx = await makeSvc({ filter }).retrieve({
      question: 'q',
      workspaceId: 'ws',
      spaceIds: ['sp'],
      userId: 'u1',
    });

    expect(filter).toHaveBeenCalledTimes(2);
    for (const [, scope] of filter.mock.calls) {
      expect(scope).toEqual({
        workspaceId: 'ws',
        userId: 'u1',
        spaceId: undefined,
        spaceIds: ['sp'],
      });
    }
    expect(
      filter.mock.calls.map(([rows]) =>
        rows.map((r: SimilarityResult) => r.chunkText),
      ),
    ).toEqual([
      ['Open page text', 'Secret vector text'],
      ['Secret lexical text'],
    ]);
    expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['open']);
    expect(ctx.contextText).not.toContain('Secret');
  });

  it('fails closed when the access filter is not wired', async () => {
    const ctx = await makeSvc(undefined).retrieve({
      question: 'q',
      workspaceId: 'ws',
      userId: 'u1',
    });
    expect(ctx).toMatchObject({ chunks: [], contextText: '', isEmpty: true });
  });
});
