jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { VerifyPageTool } from './verify-page.tool';

describe('VerifyPageTool', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function make(status: string) {
    const pageService = { findById: jest.fn(async () => page) } as any;
    const verification = {
      getVerificationInfo: jest.fn(async () => ({ status })),
      createVerification: jest.fn(async () => {}),
      verifyPage: jest.fn(async () => {}),
    } as any;
    const registry = { register: jest.fn() } as any;
    return {
      tool: new VerifyPageTool(pageService, verification, registry),
      verification,
    };
  }

  it('auto-creates a permanent expiring verification then verifies when none exists', async () => {
    const { tool, verification } = make('none');
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(verification.createVerification).toHaveBeenCalledWith(
      {
        pageId: 'real-uuid',
        type: 'expiring',
        mode: 'indefinite',
        verifierIds: ['u1'],
      },
      ctx.user,
      { id: 'ws1' },
    );
    expect(verification.verifyPage).toHaveBeenCalledWith('real-uuid', ctx.user, {
      id: 'ws1',
    });
    expect(res.status).toBe('verified');
    expect(res.created).toBe(true);
  });

  it('does NOT create when a verification already exists, just verifies', async () => {
    const { tool, verification } = make('draft');
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(verification.createVerification).not.toHaveBeenCalled();
    expect(verification.verifyPage).toHaveBeenCalledWith('real-uuid', ctx.user, {
      id: 'ws1',
    });
    expect(res.created).toBe(false);
  });

  it('uses a period expiry when expiresInDays is given', async () => {
    const { tool, verification } = make('none');
    await tool.execute({ pageId: 'slug', expiresInDays: 30 }, ctx);
    expect(verification.createVerification).toHaveBeenCalledWith(
      {
        pageId: 'real-uuid',
        type: 'expiring',
        mode: 'period',
        periodAmount: 30,
        periodUnit: 'day',
        verifierIds: ['u1'],
      },
      ctx.user,
      { id: 'ws1' },
    );
  });
});
