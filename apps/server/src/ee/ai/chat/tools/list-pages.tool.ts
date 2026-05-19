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
export class ListPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_pages';
  readonly description =
    'List pages in a specific space, optionally starting from a parent page. Returns the page tree structure with id, title, slugId, and hasChildren flag. Pass spaceId (UUID) — slugs are not accepted; use list_spaces if you only have the name.';
  readonly parameters = z.object({
    spaceId: z
      .string()
      .uuid()
      .describe('Space UUID (not a slug). Use list_spaces to look it up.'),
    parentPageId: z
      .string()
      .optional()
      .describe(
        'Optional parent page UUID or slugId. Omit to list top-level pages.',
      ),
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
    try {
      const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException(
          `You do not have access to space ${args.spaceId}`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
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
