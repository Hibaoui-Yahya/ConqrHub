jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { CreatePageTool } from './create-page.tool';

const mockCreated = { id: 'new-p', title: 'New Page', slugId: 'np1', spaceId: 'sp-1' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { create: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('CreatePageTool', () => {
  let tool: CreatePageTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.create.mockResolvedValue(mockCreated);
    tool = new CreatePageTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('creates a page and returns id+slugId', async () => {
    const result = await tool.execute({ spaceId: 'sp-1', title: 'New Page', content: '# Hello' }, ctx);
    expect(result.id).toBe('new-p');
    expect(result.slugId).toBe('np1');
    expect(mockPageService.create).toHaveBeenCalledWith(
      ctx.user.id,
      ctx.workspaceId,
      expect.objectContaining({ spaceId: 'sp-1', title: 'New Page', format: 'markdown' }),
    );
  });

  it('throws ForbiddenException when user cannot create pages', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ spaceId: 'sp-1', title: 'X' }, ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPageService.create).not.toHaveBeenCalled();
  });

  it('omits format when no content is provided', async () => {
    await tool.execute({ spaceId: 'sp-1', title: 'Empty' }, ctx);
    expect(mockPageService.create).toHaveBeenCalledWith(
      ctx.user.id,
      ctx.workspaceId,
      expect.objectContaining({ format: undefined }),
    );
  });
});
