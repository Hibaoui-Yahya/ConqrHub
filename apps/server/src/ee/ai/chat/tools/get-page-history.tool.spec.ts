jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../../../core/page/services/page-history.service', () => ({
  PageHistoryService: class MockPageHistoryService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetPageHistoryTool } from './get-page-history.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockHistory = [
  { id: 'h1', title: 'v1', creatorId: 'user-2', createdAt: new Date('2026-01-01') },
  { id: 'h2', title: 'v2', creatorId: 'user-3', createdAt: new Date('2026-01-02') },
];
const mockAbility = { cannot: jest.fn() };
const mockHistoryService = { findHistoryByPageId: jest.fn() };
const mockPageService = { findById: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetPageHistoryTool', () => {
  let tool: GetPageHistoryTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockHistoryService.findHistoryByPageId.mockResolvedValue({ items: mockHistory });
    tool = new GetPageHistoryTool(
      mockHistoryService as any,
      mockPageService as any,
      mockSpaceAbility as any,
      mockRegistry as any,
    );
  });

  it('returns history entries for an accessible page', async () => {
    const result = await tool.execute({ pageId: 'p1' }, ctx);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('h1');
    expect(result[1].creatorId).toBe('user-3');
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
