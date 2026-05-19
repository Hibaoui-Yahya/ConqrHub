jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListChildPagesTool } from './list-child-pages.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockAbility = { cannot: jest.fn() };
const mockItems = {
  items: [
    { id: 'c1', title: 'Child 1', slugId: 'c1s', hasChildren: false },
    { id: 'c2', title: 'Child 2', slugId: 'c2s', hasChildren: true },
  ],
};
const mockPageService = { findById: jest.fn(), getSidebarPages: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('ListChildPagesTool', () => {
  let tool: ListChildPagesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.getSidebarPages.mockResolvedValue(mockItems);
    tool = new ListChildPagesTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('lists child pages of a given parent', async () => {
    const result = await tool.execute({ pageId: 'p1' }, ctx);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c1');
    expect(result[1].hasChildren).toBe(true);
  });

  it('passes parentPageId to getSidebarPages', async () => {
    await tool.execute({ pageId: 'p1', limit: 10 }, ctx);
    expect(mockPageService.getSidebarPages).toHaveBeenCalledWith(
      'sp-1',
      expect.objectContaining({ limit: 10 }),
      'p1',
      'user-1',
    );
  });

  it('throws NotFoundException for unknown page', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user cannot read', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'p1' }, ctx)).rejects.toThrow(ForbiddenException);
  });
});
