import { TraceabilityService } from './traceability.service';
import { ResolutionState } from '../domain/presentation.types';

const pageUrn = 'conqr://hub/page/p1';

function make(edges: any[], models: any[]) {
  const relationships = { findForUrn: jest.fn().mockResolvedValue(edges) };
  const resolver = { resolveMany: jest.fn().mockResolvedValue(models) };
  return {
    service: new TraceabilityService(relationships as any, resolver as any),
    resolver,
  };
}

describe('TraceabilityService.pageCoverage', () => {
  it('computes coverage from resolved work-item completion', async () => {
    const edges = [
      {
        sourceUrn: pageUrn,
        targetUrn: 'conqr://plane/work-item/wi1',
        relationType: 'implemented_by',
        inverseRelationType: 'implements',
      },
      {
        sourceUrn: pageUrn,
        targetUrn: 'conqr://plane/work-item/wi2',
        relationType: 'specified_by',
        inverseRelationType: 'specifies',
      },
    ];
    const models = [
      { urn: 'conqr://plane/work-item/wi1', state: ResolutionState.Live, fields: { completed: true } },
      { urn: 'conqr://plane/work-item/wi2', state: ResolutionState.Live, fields: { completed: false } },
    ];
    const { service } = make(edges, models);
    const res = await service.pageCoverage('ws1', pageUrn, 'u1', 'proj1');

    expect(res.totalLinkedWork).toBe(2);
    expect(res.completed).toBe(1);
    expect(res.coverage).toBeCloseTo(0.5);
    expect(res.hasDeliveryWork).toBe(true);
  });

  it('picks up work linked from the OTHER direction via inverse relation', async () => {
    const edges = [
      {
        sourceUrn: 'conqr://plane/work-item/wi9',
        targetUrn: pageUrn,
        relationType: 'implements',
        inverseRelationType: 'implemented_by',
      },
    ];
    const models = [
      { urn: 'conqr://plane/work-item/wi9', state: ResolutionState.Live, fields: { completed: true } },
    ];
    const { service, resolver } = make(edges, models);
    const res = await service.pageCoverage('ws1', pageUrn, 'u1');
    expect(resolver.resolveMany).toHaveBeenCalledWith(
      ['conqr://plane/work-item/wi9'],
      expect.anything(),
    );
    expect(res.coverage).toBe(1);
  });

  it('reports null coverage and no delivery work when nothing is linked', async () => {
    const { service } = make([], []);
    const res = await service.pageCoverage('ws1', pageUrn, 'u1');
    expect(res.coverage).toBeNull();
    expect(res.hasDeliveryWork).toBe(false);
  });

  it('ignores non-delivery relations (e.g. mentioned_in)', async () => {
    const edges = [
      {
        sourceUrn: pageUrn,
        targetUrn: 'conqr://plane/work-item/wi1',
        relationType: 'mentioned_in',
        inverseRelationType: 'mentions',
      },
    ];
    const { service, resolver } = make(edges, []);
    const res = await service.pageCoverage('ws1', pageUrn, 'u1');
    expect(res.totalLinkedWork).toBe(0);
    expect(resolver.resolveMany).toHaveBeenCalledWith([], expect.anything());
  });
});
