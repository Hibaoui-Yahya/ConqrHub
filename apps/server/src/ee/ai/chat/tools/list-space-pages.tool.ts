import {
  ForbiddenException,
  Injectable,
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
export class ListSpacePagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_space_pages';
  readonly description =
    'List pages in a specific space, optionally starting from a parent page. Returns the page tree structure.';
  readonly parameters = z.object({
    spaceId: z.string().describe('The space UUID to list pages from'),
    parentPageId: z
      .string()
      .optional()
      .describe('Optional parent page UUID to list children of'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of pages to return'),
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
    args: { spaceId: string; parentPageId?: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null; slugId: string; hasChildren: boolean }[]> {
    const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        `You do not have access to space ${args.spaceId}`,
      );
    }

    const { items } = await this.pageService.getSidebarPages(
      args.spaceId,
      { limit: args.limit ?? 20 } as any,
      args.parentPageId,
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
