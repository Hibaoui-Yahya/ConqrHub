jest.mock('../../../../core/workspace/services/workspace.service', () => ({
  WorkspaceService: class MockWorkspaceService {},
}));

import { ListWorkspaceMembersTool } from './list-workspace-members.tool';

const mockMembers = {
  items: [
    { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'admin', avatarUrl: null },
    { id: 'u2', name: 'Bob', email: 'bob@test.com', role: 'member', avatarUrl: '/avatar.png' },
  ],
};
const mockWorkspaceService = { getWorkspaceUsers: jest.fn() };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('ListWorkspaceMembersTool', () => {
  let tool: ListWorkspaceMembersTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceService.getWorkspaceUsers.mockResolvedValue(mockMembers);
    tool = new ListWorkspaceMembersTool(mockWorkspaceService as any, mockRegistry as any);
  });

  it('lists workspace members', async () => {
    const result = await tool.execute({}, ctx);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[0].role).toBe('admin');
    expect(result[1].email).toBe('bob@test.com');
  });

  it('passes limit to service', async () => {
    await tool.execute({ limit: 5 }, ctx);
    expect(mockWorkspaceService.getWorkspaceUsers).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('defaults limit to 20', async () => {
    await tool.execute({}, ctx);
    expect(mockWorkspaceService.getWorkspaceUsers).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ limit: 20 }),
    );
  });
});
