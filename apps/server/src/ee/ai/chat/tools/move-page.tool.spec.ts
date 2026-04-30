jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MovePageTool } from './move-page.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), nextPagePosition: jest.fn(), movePage: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('MovePageTool', () => {
  let tool: MovePageTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.nextPagePosition.mockResolvedValue('a1');
    mockPageService.movePage.mockResolvedValue(undefined);
    tool = new MovePageTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('moves page to a new parent and returns success', async () => {
    const result = await tool.execute({ pageId: 'p1', parentPageId: 'parent-2' }, ctx);
    expect(result.success).toBe(true);
    expect(mockPageService.movePage).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'p1', position: 'a1', parentPageId: 'parent-2' }),
      mockPage,
    );
  });

  it('moves page to space root when parentPageId is null', async () => {
    await tool.execute({ pageId: 'p1', parentPageId: null }, ctx);
    expect(mockPageService.movePage).toHaveBeenCalledWith(
      expect.objectContaining({ parentPageId: null }),
      mockPage,
    );
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot edit', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
