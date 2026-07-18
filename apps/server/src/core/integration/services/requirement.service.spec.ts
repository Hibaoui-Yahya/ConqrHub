import { BadRequestException } from '@nestjs/common';
import { RequirementService } from './requirement.service';
import { RequirementState } from '../domain/requirement-lifecycle';

function make(overrides: {
  findById?: jest.Mock;
  listByState?: jest.Mock;
  pageCoverage?: jest.Mock;
} = {}) {
  const requirements = {
    upsert: jest.fn().mockResolvedValue({ id: 'r1', state: 'draft' }),
    findById: overrides.findById ?? jest.fn(),
    updateState: jest.fn(),
    listForPage: jest.fn(),
    listByState: overrides.listByState ?? jest.fn().mockResolvedValue([]),
  };
  const traceability = {
    pageCoverage: overrides.pageCoverage ?? jest.fn(),
  };
  return {
    service: new RequirementService(requirements as any, traceability as any),
    requirements,
    traceability,
  };
}

describe('RequirementService', () => {
  it('registers a requirement in Draft', async () => {
    const { service, requirements } = make();
    await service.register({
      workspaceId: 'ws1',
      actorId: 'u1',
      pageId: 'p1',
      blockId: 'req_1',
      title: 'Login',
    });
    expect(requirements.upsert.mock.calls[0][0].state).toBe(
      RequirementState.Draft,
    );
  });

  it('allows a legal transition and rejects an illegal one', async () => {
    const findById = jest
      .fn()
      .mockResolvedValue({ id: 'r1', state: 'draft', pageId: 'p1', blockId: 'b' });
    const { service } = make({ findById });

    await expect(
      service.transition('ws1', 'r1', 'in_review'),
    ).resolves.toMatchObject({ state: 'in_review' });

    await expect(service.transition('ws1', 'r1', 'verified')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown target state', async () => {
    const { service } = make({
      findById: jest.fn().mockResolvedValue({ id: 'r1', state: 'draft' }),
    });
    await expect(service.transition('ws1', 'r1', 'bogus')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('coverageGaps', () => {
    it('flags approved requirements with no delivery work and incomplete ones', async () => {
      const listByState = jest.fn(async (_ws: string, state: string) =>
        state === 'approved'
          ? [
              { id: 'r1', pageId: 'p1', blockId: 'b1', title: 'A', state: 'approved' },
              { id: 'r2', pageId: 'p1', blockId: 'b2', title: 'B', state: 'approved' },
            ]
          : [],
      );
      const pageCoverage = jest
        .fn()
        // r1 → no delivery work
        .mockResolvedValueOnce({ hasDeliveryWork: false, coverage: null })
        // r2 → partial
        .mockResolvedValueOnce({ hasDeliveryWork: true, coverage: 0.5 });
      const { service } = make({ listByState, pageCoverage });

      const res = await service.coverageGaps('ws1', 'u1');
      expect(res.total).toBe(2);
      expect(res.gaps).toHaveLength(2);
      expect(res.gaps[0].reason).toBe('no_delivery_work');
      expect(res.gaps[1].reason).toBe('incomplete');
    });

    it('reports no gaps when approved requirements are fully covered', async () => {
      const listByState = jest.fn(async (_ws: string, state: string) =>
        state === 'verified'
          ? [{ id: 'r9', pageId: 'p1', blockId: 'b9', title: 'Z', state: 'verified' }]
          : [],
      );
      const pageCoverage = jest
        .fn()
        .mockResolvedValue({ hasDeliveryWork: true, coverage: 1 });
      const { service } = make({ listByState, pageCoverage });
      const res = await service.coverageGaps('ws1', 'u1');
      expect(res.gaps).toHaveLength(0);
    });
  });
});
