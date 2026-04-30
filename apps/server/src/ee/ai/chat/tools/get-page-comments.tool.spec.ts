jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../../../core/comment/comment.service', () => ({
  CommentService: class MockCommentService {},
}));
jest.mock('../../../../collaboration/collaboration.util', () => ({
  jsonToText: jest.fn().mockReturnValue('Nice page!'),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetPageCommentsTool } from './get-page-comments.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockComments = [
  { id: 'c1', content: { type: 'doc' }, type: 'page', creatorId: 'user-2', createdAt: new Date() },
];
const mockAbility = { cannot: jest.fn() };
const mockCommentService = { findByPageId: jest.fn() };
const mockPageService = { findById: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetPageCommentsTool', () => {
  let tool: GetPageCommentsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockCommentService.findByPageId.mockResolvedValue({ items: mockComments });
    tool = new GetPageCommentsTool(
      mockCommentService as any,
      mockPageService as any,
      mockSpaceAbility as any,
      mockRegistry as any,
    );
  });

  it('returns comments for an accessible page', async () => {
    const result = await tool.execute({ pageId: 'p1' }, ctx);
    expect(result).toHaveLength(1);
    expect(typeof result[0].text).toBe('string');
    expect(result[0].creatorId).toBe('user-2');
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user lacks Read access', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
