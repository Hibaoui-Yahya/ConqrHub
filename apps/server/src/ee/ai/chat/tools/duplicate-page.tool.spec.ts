jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DuplicatePageTool } from './duplicate-page.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockDuplicateResult = { id: 'p2', title: 'Copy of Page', slugId: 'p2s', childPageIds: ['c1', 'c2'] };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), duplicatePage: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('DuplicatePageTool', () => {
  let tool: DuplicatePageTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.duplicatePage.mockResolvedValue(mockDuplicateResult);
    tool = new DuplicatePageTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('duplicates a page within the same space', async () => {
    const result = await tool.execute({ pageId: 'p1' }, ctx);
    expect(result.title).toBe('Copy of Page');
    expect(result.spaceId).toBe('sp-1');
    expect(result.childPageIds).toEqual(['c1', 'c2']);
    expect(mockPageService.duplicatePage).toHaveBeenCalledWith(mockPage, undefined, ctx.user);
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot create pages', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
