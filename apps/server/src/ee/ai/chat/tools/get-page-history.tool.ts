import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageHistoryService } from '../../../../core/page/services/page-history.service';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class GetPageHistoryTool implements ChatTool, OnModuleInit {
  readonly name = 'get_page_history';
  readonly description =
    'Get the revision history of a ConqrHub page: who edited it and when. Returns recent versions without full content.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .describe('Maximum number of history entries to return'),
  });

  constructor(
    private readonly pageHistoryService: PageHistoryService,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    title: string | null;
    author: { id: string | null; name: string | null } | null;
    /** Retained for callers that read the old field name. */
    creatorId: string | null;
    contributors: { id: string; name: string | null }[];
    createdAt: string;
  }[]> {
    const page = await this.pageService.findById(args.pageId);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException('Page not found');
    }

    let ability;
    try {
      ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    } catch {
      throw new ForbiddenException('You do not have access to this page');
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    const { items } = await this.pageHistoryService.findHistoryByPageId(
      args.pageId,
      { limit: args.limit ?? 25 } as any,
    );

    // The revision row has no `creatorId`; the editor is `lastUpdatedById`,
    // joined as `lastUpdatedBy`. Reading a field that does not exist is why
    // every entry reported a null author while the description promised
    // "who edited it".
    return items.map((h: any) => {
      const author = h.lastUpdatedBy ?? null;
      const authorId = author?.id ?? h.lastUpdatedById ?? null;
      return {
        id: h.id,
        title: h.title ?? null,
        author: authorId
          ? { id: authorId, name: author?.name ?? null }
          : null,
        creatorId: authorId,
        contributors: (h.contributors ?? [])
          .filter(Boolean)
          .map((c: any) => ({ id: c.id, name: c.name ?? null })),
        createdAt: h.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }
}
