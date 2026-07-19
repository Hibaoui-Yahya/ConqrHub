import { WorkIntelService } from './work-intel.service';

function chunk(
  sourceId: string,
  score: number,
  meta: Partial<Record<string, unknown>> = {},
) {
  return {
    sourceKind: 'plane_work_item' as const,
    sourceId,
    chunkIndex: 0,
    chunkText: 'text',
    score,
    metadata: {
      workItemId: sourceId,
      projectId: 'proj-1',
      title: `Item ${sourceId}`,
      sequenceId: 1,
      state: 'Backlog',
      labels: ['bug'],
      url: `http://plane.test/conqr/projects/proj-1/issues/${sourceId}`,
      ...meta,
    },
  };
}

function makeSvc(results: any[], overrides: Partial<Record<string, any>> = {}) {
  const aiProvider = {
    isAvailable: jest.fn().mockReturnValue(true),
    embedMany: jest.fn().mockResolvedValue([[0.1, 0.2]]),
    ...overrides.aiProvider,
  };
  const repo = {
    similaritySearch: jest.fn().mockResolvedValue(results),
    ...overrides.repo,
  };
  const svc = new WorkIntelService(aiProvider as any, repo as any);
  return { svc, aiProvider, repo };
}

describe('WorkIntelService', () => {
  it('groups chunks by work item, keeping the best score, capped at limit', async () => {
    const { svc } = makeSvc([
      chunk('a', 0.9),
      chunk('a', 0.7),
      chunk('b', 0.8),
      chunk('c', 0.5),
    ]);
    const items = await svc.findSimilar({
      workspaceId: 'ws-1',
      title: 'Login broken',
      limit: 2,
    });
    expect(items.map((i) => i.workItemId)).toEqual(['a', 'b']);
    expect(items[0].score).toBe(0.9);
    expect(items[0].url).toContain('/issues/a');
  });

  it('returns [] when the AI provider is unavailable', async () => {
    const { svc, repo } = makeSvc([], {
      aiProvider: { isAvailable: jest.fn().mockReturnValue(false) },
    });
    const items = await svc.findSimilar({ workspaceId: 'ws-1', title: 'x' });
    expect(items).toEqual([]);
    expect(repo.similaritySearch).not.toHaveBeenCalled();
  });

  it('searches only plane_work_item chunks in the caller workspace', async () => {
    const { svc, repo } = makeSvc([]);
    await svc.findSimilar({ workspaceId: 'ws-1', title: 'x', limit: 5 });
    expect(repo.similaritySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        sourceKind: 'plane_work_item',
        topK: 20, // limit * OVERSAMPLE(4)
      }),
    );
  });

  it('predicts labels weighted by similarity, normalized to confidences', async () => {
    const { svc } = makeSvc([
      chunk('a', 0.9, { labels: ['bug'] }),
      chunk('b', 0.6, { labels: ['bug', 'ui'] }),
      chunk('c', 0.5, { labels: ['story'] }),
    ]);
    const { labels } = await svc.predictLabels({
      workspaceId: 'ws-1',
      title: 'Login broken',
    });
    expect(labels[0].label).toBe('bug'); // 0.9 + 0.6 dominates
    const total = labels.reduce((s, l) => s + l.confidence, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(labels.map((l) => l.label)).toContain('story');
  });

  it('clamps negative similarity scores so a label gets zero weight and is excluded', async () => {
    const { svc } = makeSvc([
      chunk('a', 0.9, { labels: ['bug'] }),
      chunk('b', 0.6, { labels: ['bug', 'ui'] }),
      chunk('c', -0.2, { labels: ['junk'] }),
    ]);
    const { labels } = await svc.predictLabels({
      workspaceId: 'ws-1',
      title: 'Login broken',
    });
    expect(labels.map((l) => l.label)).not.toContain('junk');
    for (const l of labels) {
      expect(l.confidence).toBeGreaterThanOrEqual(0);
      expect(l.confidence).toBeLessThanOrEqual(1);
    }
    const total = labels.reduce((s, l) => s + l.confidence, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
  });

  it('combines title and description into one query embedding', async () => {
    const { svc, aiProvider } = makeSvc([]);
    await svc.findSimilar({
      workspaceId: 'ws-1',
      title: 'Title',
      description: 'Desc',
    });
    expect(aiProvider.embedMany).toHaveBeenCalledWith(['Title\n\nDesc']);
  });
});
