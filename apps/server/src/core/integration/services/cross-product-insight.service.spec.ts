import { CrossProductInsightService } from './cross-product-insight.service';

function make(coverage: any) {
  const requirements = { coverageGaps: jest.fn().mockResolvedValue(coverage) };
  return new CrossProductInsightService(requirements as any);
}

describe('CrossProductInsightService.statusUpdate', () => {
  it('summarizes coverage with grounded facts and a disclaimer', async () => {
    const service = make({
      total: 4,
      gaps: [
        { blockId: 'b1', title: 'SSO', state: 'approved', reason: 'no_delivery_work', coverage: null },
        { blockId: 'b2', title: 'Search', state: 'implementing', reason: 'incomplete', coverage: 0.5 },
      ],
    });
    const res = await service.statusUpdate('ws1', 'u1');
    expect(res.draftMarkdown).toContain('2/4');
    expect(res.draftMarkdown).toContain('no delivery work');
    expect(res.draftMarkdown).toContain('SSO');
    expect(res.draftMarkdown).toContain('50% complete');
    expect(res.sources).toHaveLength(2);
    expect(res.disclaimer).toMatch(/draft/i);
  });

  it('reports all-clear when there are no gaps', async () => {
    const service = make({ total: 3, gaps: [] });
    const res = await service.statusUpdate('ws1', 'u1');
    expect(res.draftMarkdown).toContain('3/3');
    expect(res.draftMarkdown).toContain('All approved requirements');
  });

  it('handles the empty case', async () => {
    const service = make({ total: 0, gaps: [] });
    const res = await service.statusUpdate('ws1', 'u1');
    expect(res.draftMarkdown).toContain('No approved requirements');
  });
});
