jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MovePageToSpaceTool } from './move-page-to-space.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockMoveResult = { childPageIds: ['c1', 'c2'] };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), movePageToSpace: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('MovePageToSpaceTool', () => {
  let tool: MovePageToSpaceTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.movePageToSpace.mockResolvedValue(mockMoveResult);
    tool = new MovePageToSpaceTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('moves page to target space', async () => {
    const result = await tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx);
    expect(result.success).toBe(true);
    expect(result.targetSpaceId).toBe('sp-2');
    expect(result.childPageIds).toEqual(['c1', 'c2']);
    expect(mockPageService.movePageToSpace).toHaveBeenCalledWith(mockPage, 'sp-2', 'user-1');
  });

  it('checks source edit and target create permissions', async () => {
    await tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx);
    expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(ctx.user, 'sp-1');
    expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(ctx.user, 'sp-2');
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad', targetSpaceId: 'sp-2' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot edit source', async () => {
    mockAbility.cannot.mockReturnValueOnce(true);
    await expect(tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
