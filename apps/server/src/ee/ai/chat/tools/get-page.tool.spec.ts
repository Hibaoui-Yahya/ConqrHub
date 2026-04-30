jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../../../collaboration/collaboration.util', () => ({
  jsonToText: jest.fn().mockReturnValue('Hello world'),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetPageTool } from './get-page.tool';

const mockPage = {
  id: 'page-1',
  title: 'Getting Started',
  slugId: 'abc123',
  spaceId: 'space-1',
  content: { type: 'doc', content: [] },
  updatedAt: new Date('2026-01-01'),
};
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn() };
const mockSpaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

describe('GetPageTool', () => {
  let tool: GetPageTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    tool = new GetPageTool(mockPageService as any, mockSpaceAbility as any, mockRegistry as any);
  });

  it('registers on module init', () => {
    tool.onModuleInit();
    expect(mockRegistry.register).toHaveBeenCalledWith(tool);
  });

  it('returns page content for an accessible page', async () => {
    const result = await tool.execute({ pageId: 'page-1' }, ctx);
    expect(result.id).toBe('page-1');
    expect(result.title).toBe('Getting Started');
    expect(typeof result.content).toBe('string');
    expect(mockPageService.findById).toHaveBeenCalledWith('page-1', true);
  });

  it('throws NotFoundException when page does not exist', async () => {
    mockPageService.findById.mockResolvedValue(undefined);
    await expect(tool.execute({ pageId: 'bad-id' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user lacks Read access', async () => {
    mockAbility.cannot.mockReturnValue(true);
    await expect(tool.execute({ pageId: 'page-1' }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('passes the requesting user to SpaceAbilityFactory', async () => {
    await tool.execute({ pageId: 'page-1' }, ctx);
    expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(ctx.user, 'space-1');
  });
});
