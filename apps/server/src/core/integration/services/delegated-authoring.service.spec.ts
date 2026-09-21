// Two of this service's collaborators cannot be loaded under Jest, and neither
// failure has anything to do with what is under test. `CommentService` and
// `PageService` both reach the collaboration editor's module graph, which
// imports `happy-dom` (ESM-only, and outside `transformIgnorePatterns`) and
// resolves `src/collaboration/collaboration.util` through the `baseUrl` that
// `tsc` honours and this Jest config does not. Either one aborts the whole
// file before a single assertion runs, reported as a parse error.
//
// They are replaced by empty classes because that is all a Nest constructor
// needs of them: every collaborator is injected as a test double below, so
// nothing here would have called the real implementations anyway. The
// *service under test* is the real one, which is the part that matters. The
// same obstacle is why the controller depends on a port token rather than on
// this class.
jest.mock('../../comment/comment.service', () => ({
  CommentService: class {},
}));
jest.mock('../../page/services/page.service', () => ({
  PageService: class {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DelegatedAuthoringService } from './delegated-authoring.service';
import type { DelegationContext } from './suite-delegation-verifier.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';

/**
 * What a delegated caller is allowed to touch, and in which order that is
 * decided.
 *
 * Fabric governs *whether* a capability may be attempted: policy, approval,
 * audit. None of that says anything about whether this particular person may
 * read this particular page — that is Hub's, and it is the half a reader of
 * either audit trail cannot check. So every test here pins one of two
 * properties, both of which fail silently when they are wrong:
 *
 * * **Ownership is settled before authorization.** A resource in another
 *   workspace must come back as a nondisclosing not-found *without* an ability
 *   ever being built for it. Building the ability first still refuses, but it
 *   refuses with a 403, and the difference between "you may not" and "there is
 *   no such thing" is exactly the difference a caller can enumerate somebody
 *   else's spaces with.
 * * **The refusal is delegated, not reimplemented.** Every check here is the
 *   one an ordinary signed-in request goes through — `SpaceAbilityFactory`,
 *   `PageAccessService`, `CommentService`'s creator rule. A delegated route
 *   that grew its own, more permissive, copy of one of them is the whole
 *   failure this integration exists to avoid. So what is asserted is that the
 *   check was asked, that it was asked with the workspace and person the
 *   assertion resolved to, and that a refusal from it stops the write rather
 *   than being caught and turned into a result.
 */

const WORKSPACE = 'ws-1';
const OTHER_WORKSPACE = 'ws-2';

const ctx = (): DelegationContext =>
  ({
    user: { id: 'user-1', name: 'Amina' },
    workspace: { id: WORKSPACE, name: 'Acme' },
  }) as unknown as DelegationContext;

/** An ability that permits everything except what a test names, so a test that
 * pins one refusal says which one. `cannot` is the inverse of `can`, as
 * CASL's own is. */
function ability(denied: [string, string][] = []) {
  const blocked = new Set(denied.map(([a, s]) => `${a}:${s}`));
  const can = (action: string, subject: string) =>
    !blocked.has(`${action}:${subject}`);
  return { can, cannot: (a: string, s: string) => !can(a, s) };
}

type Collaborators = {
  spaces?: any;
  spaceMembers?: any;
  pages?: any;
  pageHistory?: any;
  pageAccess?: any;
  comments?: any;
  search?: any;
  spaceAbility?: any;
  workspaceAbility?: any;
};

function build(overrides: Collaborators = {}) {
  const collaborators = {
    spaces: {
      getSpaceInfo: jest.fn(async (id: string) => ({
        id,
        name: 'Product',
        slug: 'product',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      createSpace: jest.fn(async () => ({
        id: 'space-new',
        name: 'Product',
        slug: 'product',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      updateSpace: jest.fn(async () => ({
        id: 'space-1',
        name: 'Renamed',
        slug: 'product',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      ...overrides.spaces,
    },
    spaceMembers: {
      getUserSpaces: jest.fn(async () => ({ items: [] })),
      ...overrides.spaceMembers,
    },
    pages: {
      findById: jest.fn(async (id: string) => ({
        id,
        title: 'Runbook',
        slugId: 'slug-1',
        spaceId: 'space-1',
        workspaceId: WORKSPACE,
        updatedAt: new Date('2026-02-02T00:00:00.000Z'),
      })),
      create: jest.fn(async () => ({
        id: 'page-new',
        title: 'Draft',
        slugId: 'slug-new',
        spaceId: 'space-1',
        updatedAt: new Date('2026-02-02T00:00:00.000Z'),
      })),
      update: jest.fn(async (page: any) => ({ ...page, title: 'Renamed' })),
      updatePageContent: jest.fn(async () => undefined),
      getSidebarPages: jest.fn(async () => ({ items: [] })),
      getRecentPages: jest.fn(async () => ({ items: [] })),
      getPageBreadCrumbs: jest.fn(async () => []),
      ...overrides.pages,
    },
    pageHistory: {
      findHistoryByPageId: jest.fn(async () => ({ items: [] })),
      ...overrides.pageHistory,
    },
    pageAccess: {
      validateCanView: jest.fn(async () => undefined),
      validateCanEdit: jest.fn(async () => ({ hasRestriction: false })),
      validateCanComment: jest.fn(async () => undefined),
      ...overrides.pageAccess,
    },
    comments: {
      findById: jest.fn(async (id: string) => ({
        id,
        pageId: 'page-1',
        creatorId: 'user-1',
      })),
      findByPageId: jest.fn(async () => ({ items: [] })),
      create: jest.fn(async () => ({
        id: 'comment-new',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
      })),
      update: jest.fn(async (comment: any) => ({
        ...comment,
        updatedAt: new Date('2026-03-03T00:00:00.000Z'),
      })),
      ...overrides.comments,
    },
    search: {
      searchPage: jest.fn(async () => ({ items: [] })),
      ...overrides.search,
    },
    spaceAbility: {
      createForUser: jest.fn(async () => ability()),
      ...overrides.spaceAbility,
    },
    workspaceAbility: {
      createForUser: jest.fn(() => ability()),
      ...overrides.workspaceAbility,
    },
  };

  const service = new DelegatedAuthoringService(
    collaborators.spaces as any,
    collaborators.spaceMembers as any,
    collaborators.pages as any,
    collaborators.pageHistory as any,
    collaborators.pageAccess as any,
    collaborators.comments as any,
    collaborators.search as any,
    collaborators.spaceAbility as any,
    collaborators.workspaceAbility as any,
  );
  return { service, ...collaborators };
}

describe('ownership is settled before authorization', () => {
  it('reports a space in another workspace as not found, and builds no ability for it', async () => {
    // `getSpaceInfo` is already workspace-scoped, so a space belonging to
    // somebody else raises. What matters is that the refusal is translated to
    // a not-found rather than escaping as whatever Hub's internals said, and
    // that no CASL ability was constructed against an id from another tenant.
    const { service, spaces, spaceAbility } = build({
      spaces: {
        getSpaceInfo: jest.fn(async () => {
          throw new Error('not in this workspace');
        }),
      },
    });

    await expect(service.readSpace(ctx(), 'space-elsewhere')).rejects.toThrow(
      NotFoundException,
    );
    expect(spaces.getSpaceInfo).toHaveBeenCalledWith(
      'space-elsewhere',
      WORKSPACE,
    );
    expect(spaceAbility.createForUser).not.toHaveBeenCalled();
  });

  it('reports a page in another workspace as not found, and checks no page access for it', async () => {
    const { service, pageAccess } = build({
      pages: {
        findById: jest.fn(async () => ({
          id: 'page-elsewhere',
          spaceId: 'space-9',
          workspaceId: OTHER_WORKSPACE,
        })),
      },
    });

    await expect(service.readPage(ctx(), 'page-elsewhere')).rejects.toThrow(
      NotFoundException,
    );
    expect(pageAccess.validateCanView).not.toHaveBeenCalled();
  });

  it('reports a deleted page as not found rather than serving its last content', async () => {
    const { service } = build({
      pages: {
        findById: jest.fn(async () => ({
          id: 'page-1',
          spaceId: 'space-1',
          workspaceId: WORKSPACE,
          deletedAt: new Date(),
        })),
      },
    });

    await expect(service.readPage(ctx(), 'page-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('drops spaces and recent pages that belong to another workspace', async () => {
    // Both of these read through a *user*-scoped query rather than a
    // workspace-scoped one, so the workspace the assertion resolved to is the
    // only thing standing between one organisation's answer and another's.
    const { service } = build({
      spaceMembers: {
        getUserSpaces: jest.fn(async () => ({
          items: [
            { id: 'space-1', slug: 'product', workspaceId: WORKSPACE },
            { id: 'space-9', slug: 'elsewhere', workspaceId: OTHER_WORKSPACE },
          ],
        })),
      },
      pages: {
        getRecentPages: jest.fn(async () => ({
          items: [
            {
              id: 'page-1',
              slugId: 'a',
              spaceId: 'space-1',
              workspaceId: WORKSPACE,
            },
            {
              id: 'page-9',
              slugId: 'b',
              spaceId: 'space-9',
              workspaceId: OTHER_WORKSPACE,
            },
          ],
        })),
      },
    });

    const spaces = (await service.listSpaces(ctx())) as {
      items: { id: string }[];
    };
    const recent = (await service.recentPages(ctx())) as {
      items: { id: string }[];
    };
    expect(spaces.items.map((s) => s.id)).toEqual(['space-1']);
    expect(recent.items.map((p) => p.id)).toEqual(['page-1']);
  });
});

describe("the refusal is Hub's own", () => {
  it('refuses a space read the person cannot see the settings of', async () => {
    const { service } = build({
      spaceAbility: {
        createForUser: jest.fn(async () => ability([[SpaceCaslAction.Read, SpaceCaslSubject.Settings]])),
      },
    });
    await expect(service.readSpace(ctx(), 'space-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses space creation without workspace-level permission, and creates nothing', async () => {
    const { service, spaces } = build({
      workspaceAbility: { createForUser: jest.fn(() => ability([[WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space]])) },
    });
    await expect(
      service.createSpace(ctx(), { name: 'Product', slug: 'product' }),
    ).rejects.toThrow(ForbiddenException);
    expect(spaces.createSpace).not.toHaveBeenCalled();
  });

  it('refuses a space update without space-level manage, and updates nothing', async () => {
    const { service, spaces } = build({
      spaceAbility: {
        createForUser: jest.fn(async () => ability([[SpaceCaslAction.Manage, SpaceCaslSubject.Settings]])),
      },
    });
    await expect(
      service.updateSpace(ctx(), { space_id: 'space-1', name: 'Renamed' }),
    ).rejects.toThrow(ForbiddenException);
    expect(spaces.updateSpace).not.toHaveBeenCalled();
  });

  it('refuses page creation without space-level create, and creates nothing', async () => {
    const { service, pages } = build({
      spaceAbility: {
        createForUser: jest.fn(async () => ability([[SpaceCaslAction.Create, SpaceCaslSubject.Page]])),
      },
    });
    await expect(
      service.createPage(ctx(), { space_id: 'space-1', title: 'Draft' }),
    ).rejects.toThrow(ForbiddenException);
    expect(pages.create).not.toHaveBeenCalled();
  });

  it('refuses a page listing the person may not read', async () => {
    const { service, pages } = build({
      spaceAbility: {
        createForUser: jest.fn(async () => ability([[SpaceCaslAction.Read, SpaceCaslSubject.Page]])),
      },
    });
    await expect(service.listPages(ctx(), 'space-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(pages.getSidebarPages).not.toHaveBeenCalled();
  });

  it('lets a page restriction refuse an edit, and writes neither title nor content', async () => {
    // `validateCanEdit` is where page-level restrictions are decided, and a
    // restricted page is the case a space-level check alone gets wrong.
    const { service, pages } = build({
      pageAccess: {
        validateCanEdit: jest.fn(async () => {
          throw new ForbiddenException();
        }),
      },
    });
    await expect(
      service.updatePage(ctx(), {
        page_id: 'page-1',
        title: 'New',
        content: 'Body',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(pages.update).not.toHaveBeenCalled();
    expect(pages.updatePageContent).not.toHaveBeenCalled();
  });

  it("lets a space's viewer-comment setting refuse a comment, and posts nothing", async () => {
    const { service, comments, pageAccess } = build({
      pageAccess: {
        validateCanComment: jest.fn(async () => {
          throw new ForbiddenException();
        }),
      },
    });
    await expect(
      service.createComment(ctx(), 'page-1', 'Looks wrong'),
    ).rejects.toThrow(ForbiddenException);
    // The workspace is passed through because that is how the setting is read;
    // dropping it would silently allow commenting wherever the space lookup
    // returned nothing.
    expect(pageAccess.validateCanComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'page-1' }),
      expect.objectContaining({ id: 'user-1' }),
      WORKSPACE,
    );
    expect(comments.create).not.toHaveBeenCalled();
  });

  it("checks access to a comment's page before applying the creator-only rule", async () => {
    // A comment is reached by its own id, so the page it hangs off is not in
    // the request at all. Without this lookup, losing access to a page would
    // not cost you the ability to keep editing your comments on it.
    const { service, pageAccess, comments } = build();
    await service.updateComment(ctx(), 'comment-1', 'Revised');
    expect(comments.findById).toHaveBeenCalledWith('comment-1', WORKSPACE);
    expect(pageAccess.validateCanView).toHaveBeenCalled();
    expect(comments.update).toHaveBeenCalled();
  });

  it("does not let a delegated caller edit somebody else's comment", async () => {
    const { service } = build({
      comments: {
        update: jest.fn(async () => {
          throw new ForbiddenException('You can only edit your own comments');
        }),
      },
    });
    await expect(
      service.updateComment(ctx(), 'comment-1', 'Revised'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('what a delegated read returns', () => {
  it('bounds page content and says when it cut it', async () => {
    // A model is on the other end of this, and an answer assembled from a
    // silently truncated page reads exactly like an answer assembled from a
    // complete one.
    const long = 'x'.repeat(9000);
    const { service } = build({
      pages: {
        findById: jest.fn(async () => ({
          id: 'page-1',
          slugId: 'slug-1',
          spaceId: 'space-1',
          workspaceId: WORKSPACE,
          updatedAt: new Date('2026-02-02T00:00:00.000Z'),
          content: { type: 'doc', content: [{ type: 'text', text: long }] },
        })),
      },
    });

    const page = (await service.readPage(ctx(), 'page-1')) as {
      content: string;
      content_truncated: boolean;
    };
    expect(page.content).toHaveLength(8000);
    expect(page.content_truncated).toBe(true);
  });

  it('applies the requested content operation rather than always replacing', async () => {
    const { service, pages } = build();
    await service.updatePage(ctx(), {
      page_id: 'page-1',
      content: '## Appendix',
      content_operation: 'append',
    });
    expect(pages.updatePageContent).toHaveBeenCalledWith(
      'page-1',
      '## Appendix',
      'append',
      'markdown',
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  it('never reports a page as last updated before the edit that just changed it', async () => {
    // A title edit writes the row; a content edit is handed to the
    // collaboration gateway and the row follows. So the page object in hand
    // after a content-only update still carries the pre-edit timestamp, and
    // returning it would date the change to before it happened.
    const before = new Date('2020-01-01T00:00:00.000Z');
    const { service } = build({
      pages: {
        findById: jest.fn(async (id: string) => ({
          id,
          title: 'Runbook',
          slugId: 'slug-1',
          spaceId: 'space-1',
          workspaceId: WORKSPACE,
          updatedAt: before,
        })),
      },
    });

    const updated = (await service.updatePage(ctx(), {
      page_id: 'page-1',
      content: '# Body',
    })) as { updated_at: string };

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      before.getTime(),
    );
  });

  it('scopes a search to the asking person and their workspace', async () => {
    const { service, search } = build();
    await service.searchPages(ctx(), '  machine rates  ', 5);
    expect(search.searchPage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'machine rates', limit: 5 }),
      { userId: 'user-1', workspaceId: WORKSPACE },
    );
  });

  it('exposes business fields rather than database rows', async () => {
    // The consumer is another product, so the shape is a contract. Leaking
    // Hub's column names into it is how a rename becomes a breaking change in
    // a repository that never mentions Hub.
    const { service } = build({
      pages: {
        getSidebarPages: jest.fn(async () => ({
          items: [
            {
              id: 'page-1',
              title: 'Runbook',
              slugId: 'slug-1',
              parentPageId: null,
              hasChildren: true,
              creatorId: 'user-1',
              workspaceId: WORKSPACE,
            },
          ],
        })),
      },
    });

    const listed = (await service.listPages(ctx(), 'space-1')) as {
      items: Record<string, unknown>[];
    };
    expect(Object.keys(listed.items[0]).sort()).toEqual([
      'has_children',
      'id',
      'parent_page_id',
      'slug_id',
      'title',
    ]);
  });
});
