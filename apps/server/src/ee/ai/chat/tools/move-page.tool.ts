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
export class MovePageTool implements ChatTool, OnModuleInit {
  readonly name = 'move_page';
  readonly description =
    'Move a ConqrHub page to a different parent page (or to the space root). Only use when the user explicitly asks to move or reorganize a page.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to move'),
    parentPageId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'UUID of the new parent page, or null to move to the space root',
      ),
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
    args: { pageId: string; parentPageId?: string | null },
    ctx: ChatToolContext,
  ): Promise<{ success: true; pageId: string }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have permission to move this page');
    }

    const position = await (this.pageService as any).nextPagePosition(
      page.spaceId,
      args.parentPageId ?? undefined,
    );

    await this.pageService.movePage(
      {
        pageId: args.pageId,
        position,
        parentPageId: args.parentPageId ?? null,
      } as any,
      page,
    );

    return { success: true, pageId: args.pageId };
  }
}
