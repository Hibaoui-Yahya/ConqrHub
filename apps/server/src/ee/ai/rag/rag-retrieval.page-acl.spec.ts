import { RagRetrievalService } from './rag-retrieval.service';

// 7c2bc9f6 checked page permissions inside RagRetrievalService; the merged
// release does it in RagAccessFilter (same PagePermissionRepo check, plus
// live verification/deletion/document checks, real PostgreSQL in
// rag-retrieval.access.pg.spec.ts). Same intents, through the filter.
const hit = (sourceId: string, chunkText: string, sourceKind: any = 'page') => ({
  sourceKind,
  sourceId,
  chunkIndex: 0,
  chunkText,
  metadata: { title: sourceId },
  score: 0.8,
});

function makeSvc(allowed: ((ids: string[]) => Promise<string[]>) | null) {
  const ai = { embed: jest.fn().mockResolvedValue([0.1]) };
  const repo = {
    similaritySearch: jest
      .fn()
      .mockResolvedValue([hit('open', 'Open page text'), hit('secret', 'Secret page text')]),
    lexicalSearch: jest.fn().mockResolvedValue([hit('secret', 'Secret page text')]),
  };
  const env = { getAiRagMinScore: jest.fn().mockReturnValue(0) };
  const filter = jest.fn(async (results: any[], ctx: { userId?: string }) => {
    if (!ctx.userId || !allowed) return [];
    try {
      const ok = new Set(await allowed(results.map((r) => r.sourceId)));
      return results.filter((r) => ok.has(r.sourceId));
    } catch {
      return []; // fail closed, as RagAccessFilter does
    }
  });
  const svc = new RagRetrievalService(ai as any, repo as any, env as any, { filter } as any);
  return { svc, filter };
}

describe('RagRetrievalService page-level permissions', () => {
  it('drops passages from pages the reader cannot open, on both result lists', async () => {
    const { svc, filter } = makeSvc(async () => ['open']);
    const ctx = await svc.retrieve({ question: 'q', workspaceId: 'ws', spaceIds: ['sp'], userId: 'u1' });
    expect(filter).toHaveBeenCalledTimes(2);
    expect(filter).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ userId: 'u1', workspaceId: 'ws' }));
    expect(ctx.chunks.map((c) => c.sourceId)).toEqual(['open']);
    expect(ctx.contextText).not.toContain('Secret');
  });

  it('fails closed when the permission check throws', async () => {
    const { svc } = makeSvc(async () => {
      throw new Error('db down');
    });
    const ctx = await svc.retrieve({ question: 'q', workspaceId: 'ws', spaceIds: ['sp'], userId: 'u1' });
    expect(ctx.chunks).toHaveLength(0);
  });

  it('fails closed without a reader (every caller passes one)', async () => {
    const { svc } = makeSvc(async (ids) => ids);
    const ctx = await svc.retrieve({ question: 'q', workspaceId: 'ws', spaceIds: ['sp'] });
    expect(ctx.chunks).toHaveLength(0);
  });

  it('fails closed when no access filter is wired', async () => {
    const ai = { embed: jest.fn().mockResolvedValue([0.1]) };
    const repo = { similaritySearch: jest.fn().mockResolvedValue([hit('open', 'x')]), lexicalSearch: jest.fn().mockResolvedValue([]) };
    const svc = new RagRetrievalService(ai as any, repo as any, { getAiRagMinScore: () => 0 } as any);
    expect((await svc.retrieve({ question: 'q', workspaceId: 'ws', userId: 'u1' })).chunks).toHaveLength(0);
  });
});
