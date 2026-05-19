jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CopyPageToSpaceTool } from './copy-page-to-space.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockCopyResult = { id: 'p2', title: 'Page', slugId: 'p2s', childPageIds: ['c1'] };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), duplicatePage: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('CopyPageToSpaceTool', () => {
  let tool: CopyPageToSpaceTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.duplicatePage.mockResolvedValue(mockCopyResult);
    tool = new CopyPageToSpaceTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('copies page to a target space', async () => {
    const result = await tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx);
    expect(result.spaceId).toBe('sp-2');
    expect(mockPageService.duplicatePage).toHaveBeenCalledWith(mockPage, 'sp-2', ctx.user);
  });

  it('checks both source read and target write permissions', async () => {
    await tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx);
    expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(ctx.user, 'sp-1');
    expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(ctx.user, 'sp-2');
  });

  it('throws ForbiddenException when user cannot read source', async () => {
    mockAbility.cannot.mockReturnValueOnce(true);
    await expect(tool.execute({ pageId: 'p1', targetSpaceId: 'sp-2' }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad', targetSpaceId: 'sp-2' }, ctx)).rejects.toThrow(NotFoundException);
  });
});
