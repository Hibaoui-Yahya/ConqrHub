jest.mock('../page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToNode: jest.fn((doc: any) => {
    if (!doc || doc.type !== 'doc') throw new Error('invalid');
    return doc;
  }),
  jsonToText: jest.fn(() => 'texte du modèle'),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TemplateService } from './template.service';

type Role = 'admin' | 'writer' | 'reader' | null;

const DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const member = { id: 'u-member', role: 'member' } as any;
const wsAdmin = { id: 'u-admin', role: 'admin' } as any;
const workspace = (allowMemberTemplates = false) =>
  ({ id: 'ws-1', settings: { templates: { allowMemberTemplates } } }) as any;

/** Space roles of the member, by space id. */
function abilityFactory(roles: Record<string, Role>) {
  const can = (role: Role, action: string, subject: string) => {
    if (!role) return false;
    if (role === 'admin') return true;
    if (role === 'writer') {
      if (subject === 'page') return true;
      return action === 'read';
    }
    return action === 'read';
  };
  return {
    createForUser: jest.fn(async (_user: any, spaceId: string) => {
      const role = roles[spaceId] ?? null;
      if (!role) throw new NotFoundException('Space permissions not found');
      return {
        can: (action: string, subject: string) => can(role, action, subject),
        cannot: (action: string, subject: string) => !can(role, action, subject),
      };
    }),
  };
}

function makeService(opts: {
  roles?: Record<string, Role>;
  template?: Record<string, unknown> | null;
}) {
  const template =
    opts.template === null
      ? undefined
      : {
          id: 't-1',
          title: 'Compte rendu',
          icon: '📝',
          spaceId: 's-1',
          workspaceId: 'ws-1',
          content: DOC,
          ...(opts.template ?? {}),
        };
  const templateRepo = {
    findById: jest.fn(async () => template),
    list: jest.fn(async () => ({ items: [], meta: {} })),
    insert: jest.fn(async (v: any) => ({ id: 't-new', ...v })),
    update: jest.fn(async () => undefined),
    softDelete: jest.fn(async () => undefined),
  };
  const pageService = {
    create: jest.fn(async (_u: string, _w: string, dto: any) => ({
      id: 'p-new',
      slugId: 'abc',
      title: dto.title,
      spaceId: dto.spaceId,
    })),
  };
  const pageRepo = { findById: jest.fn() };
  const pageAccessService = { validateCanEdit: jest.fn(async () => undefined) };
  const service = new TemplateService(
    templateRepo as any,
    abilityFactory(opts.roles ?? {}) as any,
    pageService as any,
    pageRepo as any,
    pageAccessService as any,
  );
  return { service, templateRepo, pageService };
}

describe('TemplateService permissions', () => {
  it('keeps company-wide templates to workspace admins', async () => {
    const { service, templateRepo } = makeService({ roles: { 's-1': 'admin' } });
    await expect(
      service.create({ title: 'Global' }, member, workspace()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.create({ title: 'Global', content: DOC }, wsAdmin, workspace());
    expect(templateRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: null,
        creatorId: wsAdmin.id,
        textContent: 'texte du modèle',
      }),
    );
  });

  it('lets a space admin create a template in their space', async () => {
    const { service, templateRepo } = makeService({ roles: { 's-1': 'admin' } });
    await service.create({ title: 'Space', spaceId: 's-1' }, member, workspace());
    expect(templateRepo.insert).toHaveBeenCalled();
  });

  it('lets a writer manage space templates only when the company allows it', async () => {
    const roles = { 's-1': 'writer' as Role };
    const refused = makeService({ roles });
    await expect(
      refused.service.create({ title: 'x', spaceId: 's-1' }, member, workspace(false)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = makeService({ roles });
    await allowed.service.create(
      { title: 'x', spaceId: 's-1' },
      member,
      workspace(true),
    );
    expect(allowed.templateRepo.insert).toHaveBeenCalled();
  });

  it('never lets a reader manage templates', async () => {
    const { service } = makeService({ roles: { 's-1': 'reader' } });
    await expect(
      service.create({ title: 'x', spaceId: 's-1' }, member, workspace(true)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides a space template from someone outside the space', async () => {
    const { service } = makeService({ roles: {} });
    await expect(service.get('t-1', member, workspace())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to move a template into a scope the user cannot manage', async () => {
    const { service, templateRepo } = makeService({ roles: { 's-1': 'admin' } });
    await expect(
      service.update({ templateId: 't-1', spaceId: null }, member, workspace()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(templateRepo.update).not.toHaveBeenCalled();
  });

  it('rejects content that is not a document', async () => {
    const { service } = makeService({ roles: { 's-1': 'admin' } });
    await expect(
      service.update(
        { templateId: 't-1', content: { type: 'nope' } },
        member,
        workspace(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TemplateService.use', () => {
  it('creates a page with the template content where the user may create pages', async () => {
    const { service, pageService } = makeService({ roles: { 's-1': 'writer' } });
    const page = await service.use(
      { templateId: 't-1', spaceId: 's-1' },
      member,
      workspace(),
    );
    expect(page.slugId).toBe('abc');
    expect(pageService.create).toHaveBeenCalledWith(member.id, 'ws-1', {
      spaceId: 's-1',
      parentPageId: undefined,
      title: 'Compte rendu',
      icon: '📝',
      content: DOC,
      format: 'json',
    });
  });

  it('refuses a reader of the space', async () => {
    const { service, pageService } = makeService({ roles: { 's-1': 'reader' } });
    await expect(
      service.use({ templateId: 't-1', spaceId: 's-1' }, member, workspace()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pageService.create).not.toHaveBeenCalled();
  });

  it('keeps a space template inside its own space', async () => {
    const { service } = makeService({
      roles: { 's-1': 'writer', 's-2': 'writer' },
    });
    await expect(
      service.use({ templateId: 't-1', spaceId: 's-2' }, member, workspace()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses a company-wide template in any space the user writes in', async () => {
    const { service, pageService } = makeService({
      roles: { 's-2': 'writer' },
      template: { spaceId: null },
    });
    await service.use({ templateId: 't-1', spaceId: 's-2' }, member, workspace());
    expect(pageService.create).toHaveBeenCalled();
  });
});
