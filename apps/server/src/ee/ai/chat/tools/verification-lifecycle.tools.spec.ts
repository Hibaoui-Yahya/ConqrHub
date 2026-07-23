jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import {
  CreateVerificationTool,
  SubmitForApprovalTool,
  MarkObsoleteTool,
} from './verification-lifecycle.tools';

describe('verification lifecycle tools', () => {
  const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws1' };
  const page = { id: 'real-uuid', workspaceId: 'ws1', spaceId: 's1' };

  function deps() {
    return {
      pageService: { findById: jest.fn(async () => page) } as any,
      verification: {
        createVerification: jest.fn(async () => {}),
        submitForApproval: jest.fn(async () => {}),
        markObsolete: jest.fn(async () => {}),
      } as any,
      registry: { register: jest.fn() } as any,
    };
  }

  it('create_verification defaults verifierIds to the caller and type to expiring', async () => {
    const d = deps();
    const tool = new CreateVerificationTool(
      d.pageService,
      d.verification,
      d.registry,
    );
    await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.createVerification).toHaveBeenCalledWith(
      {
        pageId: 'real-uuid',
        type: 'expiring',
        mode: 'indefinite',
        verifierIds: ['u1'],
      },
      ctx.user,
      { id: 'ws1' },
    );
  });

  it('submit_for_approval calls the service with (pageId, user) only', async () => {
    const d = deps();
    const tool = new SubmitForApprovalTool(
      d.pageService,
      d.verification,
      d.registry,
    );
    await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.submitForApproval).toHaveBeenCalledWith(
      'real-uuid',
      ctx.user,
    );
  });

  it('mark_obsolete calls the service and reports it dropped from RAG', async () => {
    const d = deps();
    const tool = new MarkObsoleteTool(
      d.pageService,
      d.verification,
      d.registry,
    );
    const res: any = await tool.execute({ pageId: 'slug' }, ctx);
    expect(d.verification.markObsolete).toHaveBeenCalledWith(
      'real-uuid',
      ctx.user,
      { id: 'ws1' },
    );
    expect(res.status).toBe('obsolete');
  });
});
