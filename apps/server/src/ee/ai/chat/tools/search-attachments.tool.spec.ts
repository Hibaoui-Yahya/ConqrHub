import { SearchAttachmentsTool } from './search-attachments.tool';

// Real-PostgreSQL access checks (restricted page in a readable space,
// another workspace, deleted page/file) live in
// rag/rag-retrieval.access.pg.spec.ts; this spec covers the wiring.
const row = (id: string, pageId: string) => ({
  id,
  fileName: `${id}.pdf`,
  fileExt: '.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  pageId,
  spaceId: 's1',
  createdAt: new Date('2025-01-01'),
});

const mockQueryBuilder = {
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  execute: jest.fn(),
};
const mockDb = { selectFrom: jest.fn(() => mockQueryBuilder) };
const mockRegistry = { register: jest.fn() };
const spaceMembers = { getUserSpaceIds: jest.fn() };
const pagePermissions = { filterAccessiblePageIds: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('SearchAttachmentsTool', () => {
  let tool: SearchAttachmentsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const fn of ['innerJoin', 'select', 'where', 'orderBy', 'limit'] as const) {
      mockQueryBuilder[fn].mockReturnThis();
    }
    mockQueryBuilder.execute.mockResolvedValue([row('a1', 'p1'), row('a2', 'p-restricted')]);
    spaceMembers.getUserSpaceIds.mockResolvedValue(['s1']);
    pagePermissions.filterAccessiblePageIds.mockResolvedValue(['p1']);
    tool = new SearchAttachmentsTool(
      mockRegistry as any,
      mockDb as any,
      spaceMembers as any,
      pagePermissions as any,
    );
  });

  it('lists only files of pages the reader can open now, keeping the result shape', async () => {
    const result = await tool.execute({ query: 'doc' }, ctx);
    expect(result).toEqual([
      {
        id: 'a1',
        fileName: 'a1.pdf',
        fileExt: '.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        pageId: 'p1',
        spaceId: 's1',
        createdAt: new Date('2025-01-01').toISOString(),
      },
    ]);
    expect(pagePermissions.filterAccessiblePageIds).toHaveBeenCalledWith({
      pageIds: ['p1', 'p-restricted'],
      userId: 'user-1',
    });
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('a.workspaceId', '=', 'ws-1');
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('p.spaceId', 'in', ['s1']);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('a.fileName', 'ilike', '%doc%');
  });

  it('treats % and _ in the query as literal characters', async () => {
    await tool.execute({ query: '50%_x' }, ctx);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('a.fileName', 'ilike', '%50\\%\\_x%');
  });

  it('applies page and space filters and the limit after access filtering', async () => {
    pagePermissions.filterAccessiblePageIds.mockResolvedValue(['p1', 'p-restricted']);
    const result = await tool.execute({ pageId: 'p1', spaceId: 's1', limit: 1 }, ctx);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('a.pageId', '=', 'p1');
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('p.spaceId', '=', 's1');
    expect(result).toHaveLength(1);
  });

  it('fails closed: no reader, no space, or a failing permission check lists nothing', async () => {
    expect(await tool.execute({}, { ...ctx, user: undefined as any })).toEqual([]);
    spaceMembers.getUserSpaceIds.mockResolvedValueOnce([]);
    expect(await tool.execute({}, ctx)).toEqual([]);
    pagePermissions.filterAccessiblePageIds.mockRejectedValueOnce(new Error('db down'));
    expect(await tool.execute({}, ctx)).toEqual([]);
  });
});
