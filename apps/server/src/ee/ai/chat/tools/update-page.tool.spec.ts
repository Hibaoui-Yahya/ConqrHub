jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdatePageTool } from './update-page.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockUpdated = { id: 'p1', title: 'New Title' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = {
  findById: jest.fn(),
  update: jest.fn(),
  updatePageContent: jest.fn(),
};
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('UpdatePageTool', () => {
  let tool: UpdatePageTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.update.mockResolvedValue(mockUpdated);
    mockPageService.updatePageContent.mockResolvedValue(undefined);
    tool = new UpdatePageTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('updates title only', async () => {
    const result = await tool.execute({ pageId: 'p1', title: 'New Title' }, ctx);
    expect(result.success).toBe(true);
    expect(result.title).toBe('New Title');
    expect(mockPageService.update).toHaveBeenCalled();
    expect(mockPageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('updates content only', async () => {
    const result = await tool.execute({ pageId: 'p1', content: '# New Content' }, ctx);
    expect(result.success).toBe(true);
    expect(mockPageService.updatePageContent).toHaveBeenCalledWith('p1', '# New Content', 'replace', 'markdown', ctx.user);
    expect(mockPageService.update).not.toHaveBeenCalled();
  });

  it('updates both title and content', async () => {
    const result = await tool.execute({ pageId: 'p1', title: 'T', content: 'C' }, ctx);
    expect(result.success).toBe(true);
    expect(mockPageService.update).toHaveBeenCalled();
    expect(mockPageService.updatePageContent).toHaveBeenCalled();
  });

  it('respects contentOperation parameter', async () => {
    await tool.execute({ pageId: 'p1', content: 'C', contentOperation: 'append' }, ctx);
    expect(mockPageService.updatePageContent).toHaveBeenCalledWith('p1', 'C', 'append', 'markdown', ctx.user);
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot edit', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1', title: 'X' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
