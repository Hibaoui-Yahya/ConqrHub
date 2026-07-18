import { BadRequestException } from '@nestjs/common';

// PageService transitively imports ESM-only editor/collab modules that Jest's
// CJS transform can't parse; the unit under test only needs its shape.
jest.mock('../../page/services/page.service', () => ({
  PageService: class PageService {},
}));

import { PagePromotionService } from './page-promotion.service';
import { RelationType } from '../domain/relationship-types';

function make(opts?: {
  primary?: { spaceId: string; name: string; slug: string; url: string };
  denyCreate?: boolean;
  relationshipFails?: boolean;
}) {
  const pageService = {
    create: jest.fn(async () => ({ id: 'page-1', slugId: 'slug-1' })),
  };
  const mappings = {
    resolveProjectDocs: jest.fn(async () => ({
      primary: opts?.primary,
      secondary: [],
    })),
  };
  const relationships = {
    create: jest.fn(async () => {
      if (opts?.relationshipFails) throw new Error('edge store down');
      return { id: 'rel-1' };
    }),
  };
  const spaceAbility = {
    createForUser: jest.fn(async () => ({
      cannot: () => !!opts?.denyCreate,
      can: () => !opts?.denyCreate,
    })),
  };
  const environment = { getAppUrl: () => 'https://hub.example.com' };
  const service = new PagePromotionService(
    pageService as any,
    mappings as any,
    relationships as any,
    spaceAbility as any,
    environment as any,
  );
  return { service, pageService, relationships };
}

const user = { id: 'u1' } as any;
const primary = { spaceId: 's1', name: 'Eng', slug: 'eng', url: '/s/eng' };

describe('PagePromotionService (§4 Promote to ConqrHub)', () => {
  it('creates the canonical page in the primary space and links derived_from with provenance', async () => {
    const { service, pageService, relationships } = make({ primary });
    const res = await service.promote({
      workspaceId: 'ws1',
      user,
      planeProjectId: 'proj1',
      planePageId: 'note-9',
      title: 'Meeting notes',
      contentHtml: '<p>hello</p>',
    });
    expect(res.status).toBe('promoted');
    expect(res.deepLink).toBe('https://hub.example.com/s/eng/p/slug-1');
    expect(pageService.create).toHaveBeenCalledWith(
      'u1',
      'ws1',
      expect.objectContaining({
        spaceId: 's1',
        title: 'Meeting notes',
        content: '<p>hello</p>',
        format: 'html',
      }),
    );
    expect(relationships.create).toHaveBeenCalledWith(
      expect.objectContaining({
        relationType: RelationType.DerivedFrom,
        provenance: 'plane.page.promote',
        sourceUrn: 'conqr://hub/page/page-1',
        targetUrn: 'conqr://plane/page/note-9',
      }),
    );
  });

  it('rejects when no primary documentation space is mapped', async () => {
    const { service } = make({ primary: undefined });
    await expect(
      service.promote({
        workspaceId: 'ws1',
        user,
        planeProjectId: 'proj1',
        planePageId: 'note-9',
        title: 'T',
        contentHtml: '<p/>',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when the user cannot create pages in the mapped space', async () => {
    const { service, pageService } = make({ primary, denyCreate: true });
    await expect(
      service.promote({
        workspaceId: 'ws1',
        user,
        planeProjectId: 'proj1',
        planePageId: 'note-9',
        title: 'T',
        contentHtml: '<p/>',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(pageService.create).not.toHaveBeenCalled();
  });

  it('reports promoted_link_failed when the page exists but linking fails — never a false success', async () => {
    const { service } = make({ primary, relationshipFails: true });
    const res = await service.promote({
      workspaceId: 'ws1',
      user,
      planeProjectId: 'proj1',
      planePageId: 'note-9',
      title: 'T',
      contentHtml: '<p/>',
    });
    expect(res.status).toBe('promoted_link_failed');
    expect(res.pageId).toBe('page-1');
    expect(res.warning).toBeTruthy();
  });
});
