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
export class UpdatePageTitleTool implements ChatTool, OnModuleInit {
  readonly name = 'update_page_title';
  readonly description =
    'Update the title of an existing wiki page. Only use this when the user explicitly asks to rename or retitle a page.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to rename'),
    title: z.string().describe('The new title for the page'),
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
    args: { pageId: string; title: string },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have permission to edit this page');
    }

    const updated = await this.pageService.update(
      page,
      { pageId: args.pageId, title: args.title } as any,
      ctx.user,
    );

    return { id: updated.id, title: updated.title ?? null };
  }
}
