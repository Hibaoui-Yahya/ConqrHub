/** Delegation stub: reads must carry a signed on-behalf-of token. */
function makeDelegation() {
  return {
    mintForPlane: jest.fn().mockImplementation(({ scope }: { scope: string[] }) => ({
      token: 'obo-token',
      jti: 'corr-1',
      personUid: 'conqr:person:user-1',
      orgUid: 'conqr:org:ws-1',
      scope,
      expiresAt: 9_999_999,
    })),
    mintCallContext: jest.fn().mockReturnValue({
      delegation: 'obo-token',
      correlationId: 'corr-1',
    }),
  } as any;
}

import { FederatedSearchService } from './federated-search.service';

function make(opts: {
  hubItems?: any[];
  planeEnabled?: boolean;
  searchWorkItems?: jest.Mock;
}) {
  const hubSearch = {
    searchPage: jest
      .fn()
      .mockResolvedValue({ items: opts.hubItems ?? [] }),
  };
  const plane = {
    isEnabled: () => opts.planeEnabled ?? true,
    searchWorkItems:
      opts.searchWorkItems ?? jest.fn().mockResolvedValue({ results: [] }),
    // Present so a regression back to the list endpoint fails loudly rather
    // than silently returning arbitrary items again.
    listWorkItems: jest.fn().mockResolvedValue({ results: [] }),
  };
  const environment = {
    getPlaneAppUrl: () => 'https://plane.example.com',
    getPlaneWorkspaceSlug: () => 'acme',
  };
  return {
    service: new FederatedSearchService(
      hubSearch as any,
      plane as any,
      environment as any,
      makeDelegation(),
    ),
    hubSearch,
    plane,
  };
}

const ctx = { workspaceId: 'ws1', userId: 'u1' };

describe('FederatedSearchService', () => {
  it('returns empty for a blank query without calling either source', async () => {
    const { service, hubSearch, plane } = make({});
    const res = await service.search('   ', ctx);
    expect(res.items).toEqual([]);
    expect(hubSearch.searchPage).not.toHaveBeenCalled();
    expect(plane.searchWorkItems).not.toHaveBeenCalled();
  });

  it('merges Hub pages and Plane work items with source labels', async () => {
    const { service } = make({
      hubItems: [{ id: 'p1', title: 'PRD', slugId: 'prd', highlight: '…' }],
      searchWorkItems: jest.fn().mockResolvedValue({
        results: [
          {
            id: 'wi1',
            name: 'Ship it',
            sequence_id: 5,
            project_id: 'proj1',
            state__name: 'In Progress',
          },
        ],
      }),
    });
    const res = await service.search('ship', ctx);
    expect(res.sources.sort()).toEqual(['hub', 'plane']);
    const hub = res.items.find((i) => i.source === 'hub');
    const plane = res.items.find((i) => i.source === 'plane');
    expect(hub?.urn).toBe('conqr://hub/page/p1');
    expect(plane?.urn).toBe('conqr://plane/work-item/wi1');
    expect(plane?.key).toBe(5);
    expect(plane?.state).toBe('In Progress');
    expect(plane?.deepLink).toBe(
      'https://plane.example.com/acme/projects/proj1/issues/wi1',
    );
  });

  it('searches work items by query rather than listing a project', async () => {
    // The defect this replaces: the ConqrPlan half called the issue LIST
    // endpoint, which ignores `search`, so unrelated items were returned as
    // hits for every query.
    const searchWorkItems = jest.fn().mockResolvedValue({ results: [] });
    const { service, plane } = make({ searchWorkItems });
    await service.search('meloche', ctx);
    expect(searchWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'meloche' }),
      expect.anything(),
    );
    expect(plane.listWorkItems).not.toHaveBeenCalled();
  });

  it('scopes to one project only when asked, otherwise searches the workspace', async () => {
    const searchWorkItems = jest.fn().mockResolvedValue({ results: [] });
    const { service } = make({ searchWorkItems });

    await service.search('x', ctx);
    expect(searchWorkItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: undefined }),
      expect.anything(),
    );

    await service.search('x', { ...ctx, planeProjectId: 'proj9' });
    expect(searchWorkItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: 'proj9' }),
      expect.anything(),
    );
  });

  it('omits Plane when the integration is disabled', async () => {
    const { service, plane } = make({
      planeEnabled: false,
      hubItems: [{ id: 'p1', title: 'X' }],
    });
    const res = await service.search('x', ctx);
    expect(res.sources).toEqual(['hub']);
    expect(plane.searchWorkItems).not.toHaveBeenCalled();
  });

  it('degrades gracefully when Hub search throws (still returns Plane)', async () => {
    const { service, hubSearch } = make({
      searchWorkItems: jest
        .fn()
        .mockResolvedValue({ results: [{ id: 'wi1', name: 'W' }] }),
    });
    hubSearch.searchPage.mockRejectedValue(new Error('typesense down'));
    const res = await service.search('w', ctx);
    expect(res.sources).toEqual(['plane']);
    expect(res.items).toHaveLength(1);
  });

  it('degrades gracefully when the work-item search throws', async () => {
    const { service } = make({
      hubItems: [{ id: 'p1', title: 'X' }],
      searchWorkItems: jest.fn().mockRejectedValue(new Error('plane down')),
    });
    const res = await service.search('x', ctx);
    expect(res.sources).toEqual(['hub']);
    expect(res.items).toHaveLength(1);
  });
});
