import { ListUnverifiedPagesTool } from './list-unverified-pages.tool';

describe('ListUnverifiedPagesTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };

  function make(pages: any[], userSpaceIds = ['s1', 's2']) {
    const verification = {
      listUnverifiedPages: jest.fn(async () => pages),
    } as any;
    const spaceMemberRepo = {
      getUserSpaceIds: jest.fn(async () => userSpaceIds),
    } as any;
    const spaceAbility = {
      createForUser: jest.fn(async () => ({ cannot: () => false })),
    } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new ListUnverifiedPagesTool(
        verification,
        spaceMemberRepo,
        spaceAbility,
        registry,
      ),
      verification,
      spaceMemberRepo,
    };
  }

  it("lists unverified pages scoped to the user's spaces", async () => {
    const { tool, verification } = make([
      { id: 'p1', title: 'A', spaceId: 's1', status: 'none' },
    ]);
    const res: any = await tool.execute({}, ctx);
    expect(verification.listUnverifiedPages).toHaveBeenCalledWith(
      'ws1',
      ['s1', 's2'],
      50,
    );
    expect(res).toEqual({
      pages: [{ id: 'p1', title: 'A', spaceId: 's1', status: 'none' }],
      count: 1,
    });
  });

  it('scopes to a single space when spaceId is given', async () => {
    const { tool, verification } = make([]);
    await tool.execute({ spaceId: 's1' }, ctx);
    expect(verification.listUnverifiedPages).toHaveBeenCalledWith(
      'ws1',
      ['s1'],
      50,
    );
  });

  it('returns empty when the user has no accessible spaces', async () => {
    const { tool, verification } = make([], []);
    const res: any = await tool.execute({}, ctx);
    expect(res).toEqual({ pages: [], count: 0 });
    expect(verification.listUnverifiedPages).not.toHaveBeenCalled();
  });
});
