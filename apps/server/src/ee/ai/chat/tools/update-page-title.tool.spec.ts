jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdatePageTitleTool } from './update-page-title.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1', title: 'Old Title' };
const mockUpdated = { id: 'p1', title: 'New Title' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), update: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('UpdatePageTitleTool', () => {
  let tool: UpdatePageTitleTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.update.mockResolvedValue(mockUpdated);
    tool = new UpdatePageTitleTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('updates title and returns new value', async () => {
    const result = await tool.execute({ pageId: 'p1', title: 'New Title' }, ctx);
    expect(result.title).toBe('New Title');
    expect(mockPageService.update).toHaveBeenCalled();
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad', title: 'X' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot edit', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1', title: 'X' }, ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPageService.update).not.toHaveBeenCalled();
  });
});
