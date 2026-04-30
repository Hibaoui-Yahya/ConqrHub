jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ListRecentPagesTool } from './list-recent-pages.tool';

const mockItems = [
  { id: 'p1', title: 'Alpha', slugId: 's1', spaceId: 'sp1', updatedAt: new Date() },
  { id: 'p2', title: 'Beta',  slugId: 's2', spaceId: 'sp2', updatedAt: new Date() },
];
const mockPageService = { getRecentPages: jest.fn().mockResolvedValue({ items: mockItems }) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('ListRecentPagesTool', () => {
  let tool: ListRecentPagesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new ListRecentPagesTool(mockPageService as any, mockRegistry as any);
  });

  it('registers on module init', () => {
    tool.onModuleInit();
    expect(mockRegistry.register).toHaveBeenCalledWith(tool);
  });

  it('returns recent pages scoped to the requesting user', async () => {
    const result = await tool.execute({ limit: 5 }, ctx);
    expect(mockPageService.getRecentPages).toHaveBeenCalledWith(
      ctx.user.id,
      expect.objectContaining({ limit: 5 }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('p1');
  });

  it('uses default limit of 10 when none provided', async () => {
    await tool.execute({}, ctx);
    expect(mockPageService.getRecentPages).toHaveBeenCalledWith(
      ctx.user.id,
      expect.objectContaining({ limit: 10 }),
    );
  });
});
