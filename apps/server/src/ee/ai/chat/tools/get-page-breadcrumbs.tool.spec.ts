jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetPageBreadcrumbsTool } from './get-page-breadcrumbs.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const ancestors = [
  { id: 'root', title: 'Engineering', slugId: 'eng' },
  { id: 'mid',  title: 'Backend',     slugId: 'be' },
];
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), getPageBreadCrumbs: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetPageBreadcrumbsTool', () => {
  let tool: GetPageBreadcrumbsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.getPageBreadCrumbs.mockResolvedValue(ancestors);
    tool = new GetPageBreadcrumbsTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('returns ancestor list for an accessible page', async () => {
    const result = await tool.execute({ pageId: 'p1' }, ctx);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Engineering');
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
