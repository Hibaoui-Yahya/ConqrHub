jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { ListSpacePagesTool } from './list-space-pages.tool';

const mockItems = [
  { id: 'p1', title: 'Intro', slugId: 's1', hasChildren: true },
  { id: 'p2', title: 'Setup', slugId: 's2', hasChildren: false },
];
const mockAbility = { cannot: jest.fn() };
const mockPageService = { getSidebarPages: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('ListSpacePagesTool', () => {
  let tool: ListSpacePagesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.getSidebarPages.mockResolvedValue({ items: mockItems });
    tool = new ListSpacePagesTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('returns pages for an accessible space', async () => {
    const result = await tool.execute({ spaceId: 'sp-1' }, ctx);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('p1');
    expect(result[0].hasChildren).toBe(true);
  });

  it('throws ForbiddenException when user lacks Read access', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ spaceId: 'sp-1' }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('passes userId to getSidebarPages for permission filtering', async () => {
    await tool.execute({ spaceId: 'sp-1', parentPageId: 'root' }, ctx);
    expect(mockPageService.getSidebarPages).toHaveBeenCalledWith('sp-1', expect.anything(), 'root', ctx.user.id);
  });
});
