jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../../../core/comment/comment.service', () => ({
  CommentService: class MockCommentService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateCommentTool } from './create-comment.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockComment = { id: 'c1', createdAt: new Date() };
const mockAbility = { cannot: jest.fn() };
const mockCommentService = { create: jest.fn() };
const mockPageService = { findById: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('CreateCommentTool', () => {
  let tool: CreateCommentTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockCommentService.create.mockResolvedValue(mockComment);
    tool = new CreateCommentTool(
      mockCommentService as any,
      mockPageService as any,
      mockSpaceAbility as any,
      mockRegistry as any,
    );
  });

  it('posts a comment and returns id+createdAt', async () => {
    const result = await tool.execute({ pageId: 'p1', text: 'Great work!' }, ctx);
    expect(result.id).toBe('c1');
    expect(mockCommentService.create).toHaveBeenCalledWith(
      { page: mockPage, workspaceId: ctx.workspaceId, user: ctx.user },
      expect.objectContaining({ pageId: 'p1', type: 'page' }),
    );
  });

  it('wraps plain text in a ProseMirror doc node', async () => {
    await tool.execute({ pageId: 'p1', text: 'Hello' }, ctx);
    const dto = mockCommentService.create.mock.calls[0][1];
    const content = JSON.parse(dto.content);
    expect(content.type).toBe('doc');
    expect(content.content[0].type).toBe('paragraph');
    expect(content.content[0].content[0].text).toBe('Hello');
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad', text: 'x' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user lacks Read access', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1', text: 'x' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
