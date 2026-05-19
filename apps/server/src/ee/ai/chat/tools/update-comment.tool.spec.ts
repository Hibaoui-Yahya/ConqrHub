jest.mock('../../../../core/comment/comment.service', () => ({
  CommentService: class MockCommentService {},
}));
jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { UpdateCommentTool } from './update-comment.tool';

const mockComment = { id: 'c1', content: '{}', creatorId: 'user-1' };
const mockUpdated = { id: 'c1', updatedAt: new Date('2025-01-01') };
const mockCommentService = { findById: jest.fn(), update: jest.fn() };
const mockPageService = { findById: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn() };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('UpdateCommentTool', () => {
  let tool: UpdateCommentTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommentService.findById.mockResolvedValue(mockComment);
    mockCommentService.update.mockResolvedValue(mockUpdated);
    tool = new UpdateCommentTool(mockCommentService as any, mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('updates a comment with plain text', async () => {
    const result = await tool.execute({ commentId: 'c1', text: 'Updated text' }, ctx);
    expect(result.id).toBe('c1');
    expect(mockCommentService.findById).toHaveBeenCalledWith('c1');
    expect(mockCommentService.update).toHaveBeenCalledWith(
      mockComment,
      expect.objectContaining({ commentId: 'c1' }),
      ctx.user,
    );
  });

  it('wraps plain text in ProseMirror doc structure', async () => {
    await tool.execute({ commentId: 'c1', text: 'Hello' }, ctx);
    const updateCall = mockCommentService.update.mock.calls[0][1];
    const parsed = JSON.parse(updateCall.content);
    expect(parsed.type).toBe('doc');
    expect(parsed.content[0].content[0].text).toBe('Hello');
  });
});
