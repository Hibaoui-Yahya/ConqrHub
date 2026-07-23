jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { GetVerificationStatusTool } from './get-verification-status.tool';

describe('GetVerificationStatusTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function make(info: any) {
    const pageService = { findById: jest.fn(async () => page) } as any;
    const verification = {
      getVerificationInfo: jest.fn(async () => info),
    } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new GetVerificationStatusTool(pageService, verification, registry),
      pageService,
      verification,
    };
  }

  it('reports inRag=true for a verified page and resolves the page ref', async () => {
    const { tool, pageService, verification } = make({
      status: 'verified',
      permissions: { canManage: true },
    });
    const res: any = await tool.execute({ pageId: 'slug123' }, ctx);
    expect(pageService.findById).toHaveBeenCalledWith('slug123', true);
    expect(verification.getVerificationInfo).toHaveBeenCalledWith(
      { pageId: 'real-uuid' },
      ctx.user,
    );
    expect(res).toEqual({
      pageId: 'real-uuid',
      status: 'verified',
      inRag: true,
      permissions: { canManage: true },
    });
  });

  it('reports inRag=false for an unverified page', async () => {
    const { tool } = make({ status: 'none', permissions: {} });
    const res: any = await tool.execute({ pageId: 'p' }, ctx);
    expect(res.inRag).toBe(false);
    expect(res.status).toBe('none');
  });

  it('throws when the page is not in the workspace', async () => {
    const { tool, pageService } = make({ status: 'none' });
    pageService.findById.mockResolvedValueOnce({ ...page, workspaceId: 'other' });
    await expect(tool.execute({ pageId: 'p' }, ctx)).rejects.toThrow();
  });
});
