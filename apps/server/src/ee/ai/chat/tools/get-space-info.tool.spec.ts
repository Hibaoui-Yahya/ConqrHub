jest.mock('../../../../core/space/services/space.service', () => ({
  SpaceService: class MockSpaceService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetSpaceInfoTool } from './get-space-info.tool';

const mockSpace = { id: 'sp-1', name: 'Engineering', slug: 'eng', description: 'Eng space', createdAt: new Date() };
const mockAbility = { cannot: jest.fn() };
const mockSpaceService = { getSpaceInfo: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetSpaceInfoTool', () => {
  let tool: GetSpaceInfoTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockSpaceService.getSpaceInfo.mockResolvedValue(mockSpace);
    tool = new GetSpaceInfoTool(mockSpaceService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('returns space metadata for an accessible space', async () => {
    const result = await tool.execute({ spaceId: 'sp-1' }, ctx);
    expect(result.name).toBe('Engineering');
    expect(result.slug).toBe('eng');
  });

  it('throws ForbiddenException when user has no access', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ spaceId: 'sp-1' }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when space does not exist', async () => {
    mockSpaceService.getSpaceInfo.mockResolvedValue(undefined);
    await expect(tool.execute({ spaceId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });
});
