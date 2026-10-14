import { RagRetrievalService } from './rag-retrieval.service';

const hit = (sourceId: string, chunkText: string, sourceKind: any = 'page') => ({
  sourceKind,
  sourceId,
  chunkIndex: 0,
  chunkText,
  metadata: { title: sourceId },
  score: 0.8,
});

function makeSvc(filter: jest.Mock | null) {
  const ai = { embed: jest.fn().mockResolvedValue([0.1]) };
  const repo = {
    similaritySearch: jest
      .fn()
      .mockResolvedValue([hit('open', 'Open page text'), hit('secret', 'Secret page text')]),
    lexicalSearch: jest.fn().mockResolvedValue([hit('secret', 'Secret page text')]),
  };
  const env = { getAiRagMinScore: jest.fn().mockReturnValue(0) };
  const perms = filter ? { filterAccessiblePageIds: filter } : undefined;
  return new RagRetrievalService(ai as any, repo as any, env as any, perms as any);
}

describe('RagRetrievalService page-level permissions', () => {
  it('drops passages from pages the reader cannot open', async () => {
    const filter = jest.fn().mockResolvedValue(['open']);
    const ctx = await makeSvc(filter).retrieve({
      question: 'q',
      workspaceId: 'ws',
      spaceIds: ['sp'],
      userId: 'u1',
    });
    expect(filter).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', pageIds: expect.arrayContaining(['open', 'secret']) }),
    );
    expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['open']);
    expect(ctx.contextText).not.toContain('Secret');
  });

  it('fails closed when the permission check throws', async () => {
    const filter = jest.fn().mockRejectedValue(new Error('db down'));
    const ctx = await makeSvc(filter).retrieve({
      question: 'q',
      workspaceId: 'ws',
      spaceIds: ['sp'],
      userId: 'u1',
    });
    expect(ctx.chunks).toHaveLength(0);
  });

  it('does not filter when no reader is given (internal callers)', async () => {
    const ctx = await makeSvc(null).retrieve({ question: 'q', workspaceId: 'ws', spaceIds: ['sp'] });
    expect(ctx.chunks.map((c) => c.sourceId).sort()).toEqual(['open', 'secret']);
  });
});
