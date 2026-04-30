import { ListSpacesTool } from './list-spaces.tool';

const mockSpaces = [
  { id: 'sp1', name: 'Engineering', slug: 'eng', description: null },
  { id: 'sp2', name: 'Product',     slug: 'prod', description: 'Product space' },
];
const mockSpaceMember = { getUserSpaces: jest.fn().mockResolvedValue({ items: mockSpaces }) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('ListSpacesTool', () => {
  let tool: ListSpacesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new ListSpacesTool(mockSpaceMember as any, mockRegistry as any);
  });

  it('registers on module init', () => {
    tool.onModuleInit();
    expect(mockRegistry.register).toHaveBeenCalledWith(tool);
  });

  it('returns spaces for the requesting user', async () => {
    const result = await tool.execute({ limit: 10 }, ctx);
    expect(mockSpaceMember.getUserSpaces).toHaveBeenCalledWith(ctx.user.id, expect.anything());
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('eng');
  });
});
