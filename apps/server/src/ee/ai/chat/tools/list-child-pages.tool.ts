import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListChildPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_child_pages';
  readonly description =
    'List the direct child pages of a specific ConqrHub page. Returns each child\'s id, title, slugId, and whether it has its own children.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the parent page'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of child pages to return'),
  });

  constructor(
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
  ): Promise<{ id: string; title: string | null; slugId: string; hasChildren: boolean }[]> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    try {
      const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException(
          `You do not have access to page ${args.pageId}`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
    }

    const { items } = await this.pageService.getSidebarPages(
      page.spaceId,
      { limit: args.limit ?? 20 } as any,
      args.pageId,
      ctx.user.id,
    );

    return items.map((p) => ({
      id: p.id,
      title: p.title ?? null,
      slugId: p.slugId,
      hasChildren: (p as any).hasChildren ?? false,
    }));
  }
}
