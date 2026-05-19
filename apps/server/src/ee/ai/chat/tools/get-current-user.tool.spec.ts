import { GetCurrentUserTool } from './get-current-user.tool';

const mockUser = { id: 'user-1', name: 'Test User', email: 'test@test.com', role: 'admin' };
const mockUserRepo = { findById: jest.fn() };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetCurrentUserTool', () => {
  let tool: GetCurrentUserTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.findById.mockResolvedValue(mockUser);
    tool = new GetCurrentUserTool(mockUserRepo as any, mockRegistry as any);
  });

  it('returns current user details', async () => {
    const result = await tool.execute({}, ctx);
    expect(result.id).toBe('user-1');
    expect(result.name).toBe('Test User');
    expect(result.email).toBe('test@test.com');
    expect(result.role).toBe('admin');
    expect(result.workspaceId).toBe('ws-1');
  });

  it('queries the user by id and workspace', async () => {
    await tool.execute({}, ctx);
    expect(mockUserRepo.findById).toHaveBeenCalledWith('user-1', 'ws-1');
  });
});
