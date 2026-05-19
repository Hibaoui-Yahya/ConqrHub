jest.mock('../../../../core/space/services/space.service', () => ({
  SpaceService: class MockSpaceService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateSpaceTool } from './update-space.tool';

const mockSpace = { id: 's1', name: 'Old', slug: 'old' };
const mockUpdated = { id: 's1', name: 'New Space', slug: 'old', description: 'Updated', updatedAt: new Date('2025-01-01') };
const mockAbility = { cannot: jest.fn() };
const mockSpaceService = { getSpaceInfo: jest.fn(), updateSpace: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('UpdateSpaceTool', () => {
  let tool: UpdateSpaceTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockSpaceService.getSpaceInfo.mockResolvedValue(mockSpace);
    mockSpaceService.updateSpace.mockResolvedValue(mockUpdated);
    tool = new UpdateSpaceTool(mockSpaceService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('updates space name and description', async () => {
    const result = await tool.execute({ spaceId: 's1', name: 'New Space', description: 'Updated' }, ctx);
    expect(result.name).toBe('New Space');
    expect(result.description).toBe('Updated');
    expect(mockSpaceService.updateSpace).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 's1', name: 'New Space', description: 'Updated' }),
      'ws-1',
    );
  });

  it('throws NotFoundException for unknown space', async () => {
    mockSpaceService.getSpaceInfo.mockResolvedValue(undefined);
    await expect(tool.execute({ spaceId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot manage settings', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ spaceId: 's1' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
