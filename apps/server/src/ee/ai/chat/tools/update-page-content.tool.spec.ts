jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdatePageContentTool } from './update-page-content.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), updatePageContent: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('UpdatePageContentTool', () => {
  let tool: UpdatePageContentTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.updatePageContent.mockResolvedValue(undefined);
    tool = new UpdatePageContentTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('calls updatePageContent with markdown format and returns success', async () => {
    const result = await tool.execute({ pageId: 'p1', content: '# New content', operation: 'replace' }, ctx);
    expect(result.success).toBe(true);
    expect(mockPageService.updatePageContent).toHaveBeenCalledWith(
      'p1', '# New content', 'replace', 'markdown', ctx.user,
    );
  });

  it('defaults to replace operation', async () => {
    await tool.execute({ pageId: 'p1', content: 'text' }, ctx);
    expect(mockPageService.updatePageContent).toHaveBeenCalledWith(
      'p1', 'text', 'replace', 'markdown', ctx.user,
    );
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad', content: 'x' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot edit', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1', content: 'x' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
