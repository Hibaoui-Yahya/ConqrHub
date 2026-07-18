import { ProjectSpaceMappingService } from './project-space-mapping.service';

function make(
  mappings: any[],
  spaces: Record<string, any>,
  env?: { appUrl?: string; slug?: string },
  opts?: {
    pagesBySpace?: Record<string, any[]>;
    deniedSpaceIds?: string[];
  },
) {
  const mappingRepo = {
    listForProject: jest.fn().mockResolvedValue(mappings),
    listForSpace: jest.fn().mockResolvedValue(mappings),
  };
  const spaceRepo = {
    findById: jest.fn(async (id: string) => spaces[id] ?? null),
  };
  const pageRepo = {
    getRecentPagesInSpace: jest.fn(async (spaceId: string) => ({
      rows: opts?.pagesBySpace?.[spaceId] ?? [],
    })),
  };
  const spaceAbility = {
    createForUser: jest.fn(async (_user: any, spaceId: string) => ({
      cannot: () => (opts?.deniedSpaceIds ?? []).includes(spaceId),
      can: () => !(opts?.deniedSpaceIds ?? []).includes(spaceId),
    })),
  };
  const environment = {
    getPlaneAppUrl: () => env?.appUrl ?? 'https://plane.example.com',
    getPlaneWorkspaceSlug: () => env?.slug ?? 'acme',
    getAppUrl: () => 'https://hub.example.com',
  };
  return new ProjectSpaceMappingService(
    {} as any,
    mappingRepo as any,
    spaceRepo as any,
    pageRepo as any,
    spaceAbility as any,
    {} as any,
    environment as any,
  );
}

describe('ProjectSpaceMappingService.resolveProjectDocs (§5.2A)', () => {
  it('returns the primary space plus secondary spaces with deep links', async () => {
    const service = make(
      [
        { spaceId: 's1', mappingKind: 'primary' },
        { spaceId: 's2', mappingKind: 'secondary' },
      ],
      {
        s1: { slug: 'eng', name: 'Engineering' },
        s2: { slug: 'ops', name: 'Ops' },
      },
    );
    const res = await service.resolveProjectDocs('ws1', 'proj1');
    expect(res.primary).toEqual({
      spaceId: 's1',
      name: 'Engineering',
      slug: 'eng',
      url: '/s/eng',
    });
    expect(res.secondary).toHaveLength(1);
    expect(res.secondary[0].url).toBe('/s/ops');
  });

  it('handles a project with no mapping', async () => {
    const service = make([], {});
    const res = await service.resolveProjectDocs('ws1', 'proj1');
    expect(res.primary).toBeUndefined();
    expect(res.secondary).toEqual([]);
  });

  it('skips mappings whose space is missing/cross-tenant', async () => {
    const service = make([{ spaceId: 'gone', mappingKind: 'primary' }], {});
    const res = await service.resolveProjectDocs('ws1', 'proj1');
    expect(res.primary).toBeUndefined();
  });
});

describe('ProjectSpaceMappingService.resolveSpacePlaneTarget (§7.4 app switch)', () => {
  it('builds a Plane deep link for a mapped space (prefers primary)', async () => {
    const service = make(
      [
        { spaceId: 's1', planeProjectId: 'projA', mappingKind: 'secondary' },
        { spaceId: 's1', planeProjectId: 'projB', mappingKind: 'primary' },
      ],
      {},
    );
    const res = await service.resolveSpacePlaneTarget('ws1', 's1');
    expect(res.planeProjectId).toBe('projB');
    expect(res.url).toBe('https://plane.example.com/acme/projects/projB/issues');
  });

  it('returns empty when the space has no mapping', async () => {
    const service = make([], {});
    const res = await service.resolveSpacePlaneTarget('ws1', 's1');
    expect(res).toEqual({});
  });

  it('returns the project id but no url when Plane app URL/slug is unset', async () => {
    const service = make(
      [{ spaceId: 's1', planeProjectId: 'projA', mappingKind: 'primary' }],
      {},
      { appUrl: '', slug: '' },
    );
    const res = await service.resolveSpacePlaneTarget('ws1', 's1');
    expect(res).toEqual({ planeProjectId: 'projA' });
  });
});

describe('ProjectSpaceMappingService.browseProjectDocs (§5.2A Docs area)', () => {
  const user = { id: 'u1' } as any;

  it('returns permission-filtered spaces + recent pages with absolute deep links, newest first', async () => {
    const service = make(
      [
        { spaceId: 's1', mappingKind: 'primary' },
        { spaceId: 's2', mappingKind: 'secondary' },
      ],
      {
        s1: { slug: 'eng', name: 'Engineering' },
        s2: { slug: 'ops', name: 'Ops' },
      },
      undefined,
      {
        pagesBySpace: {
          s1: [
            { id: 'p1', slugId: 'abc1', title: 'PRD', updatedAt: new Date('2026-07-01T00:00:00Z') },
          ],
          s2: [
            { id: 'p2', slugId: 'abc2', title: 'Runbook', updatedAt: new Date('2026-07-10T00:00:00Z') },
          ],
        },
      },
    );
    const res = await service.browseProjectDocs('ws1', user, 'proj1');
    expect(res.spaces).toHaveLength(2);
    expect(res.spaces[0]).toEqual({
      spaceId: 's1',
      name: 'Engineering',
      deepLink: 'https://hub.example.com/s/eng',
      primary: true,
    });
    expect(res.pages).toHaveLength(2);
    // newest first
    expect(res.pages[0].pageId).toBe('p2');
    expect(res.pages[0].deepLink).toBe('https://hub.example.com/s/ops/p/abc2');
    expect(res.pages[1].deepLink).toBe('https://hub.example.com/s/eng/p/abc1');
  });

  it('omits spaces (and their pages) the user cannot read — a link never grants access', async () => {
    const service = make(
      [
        { spaceId: 's1', mappingKind: 'primary' },
        { spaceId: 's2', mappingKind: 'secondary' },
      ],
      {
        s1: { slug: 'eng', name: 'Engineering' },
        s2: { slug: 'secret', name: 'Secret' },
      },
      undefined,
      {
        deniedSpaceIds: ['s2'],
        pagesBySpace: {
          s1: [{ id: 'p1', slugId: 'abc1', title: 'PRD', updatedAt: new Date() }],
          s2: [{ id: 'p9', slugId: 'zzz9', title: 'Hidden', updatedAt: new Date() }],
        },
      },
    );
    const res = await service.browseProjectDocs('ws1', user, 'proj1');
    expect(res.spaces.map((s) => s.spaceId)).toEqual(['s1']);
    expect(res.pages.map((p) => p.pageId)).toEqual(['p1']);
  });

  it('returns empty sets for an unmapped project', async () => {
    const service = make([], {});
    const res = await service.browseProjectDocs('ws1', user, 'proj1');
    expect(res).toEqual({ spaces: [], pages: [] });
  });
});
