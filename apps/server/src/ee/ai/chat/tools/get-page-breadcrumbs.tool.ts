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
export class GetPageBreadcrumbsTool implements ChatTool, OnModuleInit {
  readonly name = 'get_page_breadcrumbs';
  readonly description =
    'Get the ancestor path (breadcrumbs) of a page, from the space root down to the page\'s parent. Useful for understanding where a page lives in the ConqrHub hierarchy.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page'),
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
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null; slugId: string }[]> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    const ancestors = await this.pageService.getPageBreadCrumbs(args.pageId);
    return ancestors.map((p) => ({
      id: p.id,
      title: p.title ?? null,
      slugId: p.slugId,
    }));
  }
}
