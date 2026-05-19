import { SearchAttachmentsTool } from './search-attachments.tool';

const mockDb = {
  selectFrom: jest.fn(),
};
const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  execute: jest.fn(),
};
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('SearchAttachmentsTool', () => {
  let tool: SearchAttachmentsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.execute.mockResolvedValue([
      {
        id: 'a1',
        fileName: 'doc.pdf',
        fileExt: '.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        pageId: 'p1',
        spaceId: 's1',
        createdAt: new Date('2025-01-01'),
      },
    ]);
    mockDb.selectFrom = jest.fn().mockReturnValue(mockQueryBuilder);
    tool = new SearchAttachmentsTool(mockRegistry as any, mockDb as any);
  });

  it('searches attachments by file name', async () => {
    const result = await tool.execute({ query: 'doc' }, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('doc.pdf');
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('fileName', 'ilike', '%doc%');
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('workspaceId', '=', 'ws-1');
  });

  it('filters by pageId', async () => {
    await tool.execute({ pageId: 'p1' }, ctx);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('pageId', '=', 'p1');
  });

  it('filters by spaceId', async () => {
    await tool.execute({ spaceId: 's1' }, ctx);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('spaceId', '=', 's1');
  });

  it('defaults limit to 20', async () => {
    await tool.execute({}, ctx);
    expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
  });

  it('respects the limit parameter', async () => {
    await tool.execute({ limit: 5 }, ctx);
    expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
  });
});
