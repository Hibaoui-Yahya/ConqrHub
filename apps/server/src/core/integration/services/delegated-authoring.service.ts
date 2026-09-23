import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommentService } from '../../comment/comment.service';
import { PageAccessService } from '../../page/page-access/page-access.service';
import { PageHistoryService } from '../../page/services/page-history.service';
import { PageService } from '../../page/services/page.service';
import { SearchService } from '../../search/search.service';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { SpaceService } from '../../space/services/space.service';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
import type { DelegationContext } from './suite-delegation-verifier.service';

const MAX_PAGE_CONTENT_CHARS = 8000;

function documentText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: unknown; content?: unknown };
  const own = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content)
    ? node.content.map(documentText).join(' ')
    : '';
  return [own, children].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class DelegatedAuthoringService {
  constructor(
    private readonly spaces: SpaceService,
    private readonly spaceMembers: SpaceMemberService,
    private readonly pages: PageService,
    private readonly pageHistory: PageHistoryService,
    private readonly pageAccess: PageAccessService,
    private readonly comments: CommentService,
    private readonly search: SearchService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  async listSpaces(ctx: DelegationContext, limit = 20) {
    const { items } = await this.spaceMembers.getUserSpaces(ctx.user.id, {
      limit,
    } as any);
    return {
      items: items
        .filter(
          (s: any) => !s.workspaceId || s.workspaceId === ctx.workspace.id,
        )
        .map((s: any) => this.spaceDto(s)),
    };
  }

  async readSpace(ctx: DelegationContext, spaceId: string) {
    const space = await this.requireSpace(ctx, spaceId);
    const ability = await this.spaceAbility.createForUser(ctx.user, space.id);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Settings))
      throw new ForbiddenException();
    return this.spaceDto(space);
  }

  async createSpace(ctx: DelegationContext, dto: any) {
    const ability = this.workspaceAbility.createForUser(
      ctx.user,
      ctx.workspace,
    );
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space))
      throw new ForbiddenException();
    return this.spaceDto(
      await this.spaces.createSpace(ctx.user, ctx.workspace.id, dto),
    );
  }

  async updateSpace(ctx: DelegationContext, dto: any) {
    const space = await this.requireSpace(ctx, dto.space_id);
    const ability = await this.spaceAbility.createForUser(ctx.user, space.id);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings))
      throw new ForbiddenException();
    return this.spaceDto(
      await this.spaces.updateSpace(
        {
          spaceId: space.id,
          name: dto.name,
          description: dto.description,
        } as any,
        ctx.workspace.id,
      ),
    );
  }

  async searchPages(ctx: DelegationContext, query: string, limit = 5) {
    const result = await this.search.searchPage(
      { query: query.trim(), limit } as any,
      { userId: ctx.user.id, workspaceId: ctx.workspace.id },
    );
    return {
      items: result.items.map((p: any) => ({
        id: p.id,
        title: p.title ?? null,
        slug_id: p.slugId ?? '',
        excerpt: p.highlight ?? '',
      })),
    };
  }

  async listPages(
    ctx: DelegationContext,
    spaceId: string,
    parentPageId?: string,
    limit = 20,
  ) {
    const space = await this.requireSpace(ctx, spaceId);
    const ability = await this.spaceAbility.createForUser(ctx.user, space.id);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page))
      throw new ForbiddenException();
    const { items } = await this.pages.getSidebarPages(
      space.id,
      { limit } as any,
      parentPageId,
      ctx.user.id,
      ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
    );
    return {
      items: items.map((p: any) => ({
        id: p.id,
        title: p.title ?? null,
        slug_id: p.slugId,
        parent_page_id: p.parentPageId ?? null,
        has_children: Boolean(p.hasChildren),
      })),
    };
  }

  async recentPages(ctx: DelegationContext, limit = 10) {
    const { items } = await this.pages.getRecentPages(ctx.user.id, {
      limit,
    } as any);
    return {
      items: items
        .filter((p: any) => p.workspaceId === ctx.workspace.id)
        .map((p: any) => this.pageSummary(p)),
    };
  }

  async readPage(ctx: DelegationContext, pageId: string) {
    const page = await this.requirePage(ctx, pageId, true);
    await this.pageAccess.validateCanView(page, ctx.user);
    let content = '';
    try {
      content = page.content ? documentText(page.content) : '';
    } catch {
      content = '';
    }
    return {
      ...this.pageSummary(page),
      content: content.slice(0, MAX_PAGE_CONTENT_CHARS),
      content_truncated: content.length > MAX_PAGE_CONTENT_CHARS,
    };
  }

  async breadcrumbs(ctx: DelegationContext, pageId: string) {
    const page = await this.requirePage(ctx, pageId);
    await this.pageAccess.validateCanView(page, ctx.user);
    const items = await this.pages.getPageBreadCrumbs(page.id);
    return {
      items: items.map((p: any) => ({
        id: p.id,
        title: p.title ?? null,
        slug_id: p.slugId,
      })),
    };
  }

  async history(ctx: DelegationContext, pageId: string, limit = 10) {
    const page = await this.requirePage(ctx, pageId);
    await this.pageAccess.validateCanView(page, ctx.user);
    const { items } = await this.pageHistory.findHistoryByPageId(page.id, {
      limit,
    } as any);
    return {
      // `author`, not `creator_id`. Two reasons. The history row has no `creatorId` at all —
      // page history records who last edited (`lastUpdatedById`), so `h.creatorId` was
      // always undefined and every entry reported a null author. And an opaque user id is
      // not an answer to "who changed this": Fabric renders a delegated result verbatim and
      // cannot resolve a Hub user, so an edit history arrived in the assistant as two
      // scrubbed identifiers and nothing else. The repo already selects the user row, so the
      // name costs no extra query.
      items: items.map((h: any) => ({
        id: h.id,
        title: h.title ?? null,
        author: h.lastUpdatedBy?.name ?? null,
        created_at: h.createdAt?.toISOString?.() ?? String(h.createdAt),
      })),
    };
  }

  async createPage(ctx: DelegationContext, dto: any) {
    const space = await this.requireSpace(ctx, dto.space_id);
    const ability = await this.spaceAbility.createForUser(ctx.user, space.id);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page))
      throw new ForbiddenException();
    const page = await this.pages.create(ctx.user.id, ctx.workspace.id, {
      spaceId: space.id,
      title: dto.title,
      content: dto.content,
      parentPageId: dto.parent_page_id,
      format: dto.content !== undefined ? 'markdown' : undefined,
    } as any);
    return this.pageSummary(page);
  }

  async updatePage(ctx: DelegationContext, dto: any) {
    const page = await this.requirePage(ctx, dto.page_id);
    await this.pageAccess.validateCanEdit(page, ctx.user);
    let updated = page;
    if (dto.title !== undefined)
      updated = await this.pages.update(
        page,
        { pageId: page.id, title: dto.title } as any,
        ctx.user,
      );
    if (dto.content !== undefined)
      await this.pages.updatePageContent(
        page.id,
        dto.content,
        dto.content_operation ?? 'replace',
        'markdown',
        ctx.user,
      );
    // Deliberately not `page.updatedAt` when only the content changed. A title
    // edit writes the row synchronously, so its `updatedAt` is the real one; a
    // content edit is handed to the collaboration gateway and the row is
    // written behind it, so the value still in hand is the timestamp from
    // *before* the edit. Returning that would tell the caller the page was
    // last updated at a moment earlier than the change it just made, which is
    // worse than saying when Hub accepted it.
    return {
      id: page.id,
      title: updated.title ?? page.title ?? null,
      updated_at:
        dto.title !== undefined
          ? (updated.updatedAt?.toISOString?.() ?? new Date().toISOString())
          : new Date().toISOString(),
    };
  }

  async listComments(ctx: DelegationContext, pageId: string, limit = 20) {
    const page = await this.requirePage(ctx, pageId);
    await this.pageAccess.validateCanView(page, ctx.user);
    const { items } = await this.comments.findByPageId(
      page.id,
      ctx.workspace.id,
      { limit } as any,
    );
    return {
      // `author` beside the id, for the reason given on `history` above: who wrote a comment
      // is the point of listing them, and a consumer that renders the result verbatim has no
      // way to turn a user id into a person. `findPageComments` already joins the user row.
      items: items.map((c: any) => ({
        id: c.id,
        text: c.content ? documentText(c.content).slice(0, 500) : '',
        author: c.creator?.name ?? null,
        creator_id: c.creatorId,
        created_at: c.createdAt?.toISOString?.() ?? String(c.createdAt),
      })),
    };
  }

  async createComment(ctx: DelegationContext, pageId: string, text: string) {
    const page = await this.requirePage(ctx, pageId);
    await this.pageAccess.validateCanComment(page, ctx.user, ctx.workspace.id);
    const comment = await this.comments.create(
      { page, workspaceId: ctx.workspace.id, user: ctx.user },
      {
        pageId: page.id,
        content: JSON.stringify(this.textDocument(text)),
        type: 'page',
      } as any,
    );
    return {
      id: comment.id,
      created_at:
        comment.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  async updateComment(ctx: DelegationContext, commentId: string, text: string) {
    const comment = await this.comments.findById(commentId, ctx.workspace.id);
    const page = await this.requirePage(ctx, comment.pageId);
    await this.pageAccess.validateCanView(page, ctx.user);
    const updated = await this.comments.update(
      comment,
      { commentId, content: JSON.stringify(this.textDocument(text)) } as any,
      ctx.user,
    );
    return {
      id: updated.id,
      updated_at:
        updated.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private async requireSpace(ctx: DelegationContext, id: string) {
    try {
      return await this.spaces.getSpaceInfo(id, ctx.workspace.id);
    } catch {
      throw new NotFoundException('Resource not found');
    }
  }

  private async requirePage(
    ctx: DelegationContext,
    id: string,
    content = false,
  ) {
    const page = await this.pages.findById(id, content);
    if (!page || page.workspaceId !== ctx.workspace.id || page.deletedAt)
      throw new NotFoundException('Resource not found');
    return page;
  }

  private spaceDto(space: any) {
    return {
      id: space.id,
      name: space.name ?? 'Untitled',
      slug: space.slug,
      description: space.description ?? null,
      created_at: space.createdAt?.toISOString?.() ?? String(space.createdAt),
    };
  }

  private pageSummary(page: any) {
    return {
      id: page.id,
      title: page.title ?? null,
      slug_id: page.slugId,
      space_id: page.spaceId,
      updated_at: page.updatedAt?.toISOString?.() ?? String(page.updatedAt),
    };
  }

  private textDocument(text: string) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
  }
}
