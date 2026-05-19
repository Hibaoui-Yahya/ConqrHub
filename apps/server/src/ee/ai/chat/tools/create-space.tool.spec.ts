jest.mock('../../../../core/space/services/space.service', () => ({
  SpaceService: class MockSpaceService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { CreateSpaceTool } from './create-space.tool';

const mockCreatedSpace = {
  id: 's1',
  name: 'New Space',
  slug: 'new-space',
  description: 'A test space',
  createdAt: new Date('2025-01-01'),
};
const mockAbility = { cannot: jest.fn() };
const mockSpaceService = { createSpace: jest.fn() };
const mockWorkspaceAbility = { createForUser: jest.fn().mockReturnValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('CreateSpaceTool', () => {
  let tool: CreateSpaceTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockSpaceService.createSpace.mockResolvedValue(mockCreatedSpace);
    tool = new CreateSpaceTool(mockSpaceService as any, mockWorkspaceAbility as any, mockRegistry as any);
  });

  it('creates a space and returns its details', async () => {
    const result = await tool.execute({ name: 'New Space', slug: 'new-space', description: 'A test space' }, ctx);
    expect(result.id).toBe('s1');
    expect(result.name).toBe('New Space');
    expect(result.slug).toBe('new-space');
    expect(mockSpaceService.createSpace).toHaveBeenCalledWith(
      ctx.user,
      'ws-1',
      expect.objectContaining({ name: 'New Space', slug: 'new-space' }),
    );
  });

  it('creates a space without description', async () => {
    await tool.execute({ name: 'Minimal', slug: 'min' }, ctx);
    expect(mockSpaceService.createSpace).toHaveBeenCalledWith(
      ctx.user,
      'ws-1',
      expect.objectContaining({ description: undefined }),
    );
  });

  it('throws ForbiddenException when user cannot manage spaces', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ name: 'X', slug: 'x' }, ctx)).rejects.toThrow(ForbiddenException);
    expect(mockSpaceService.createSpace).not.toHaveBeenCalled();
  });
});
