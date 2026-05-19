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
export class DuplicatePageTool implements ChatTool, OnModuleInit {
  readonly name = 'duplicate_page';
  readonly description =
    'Duplicate an existing ConqrHub page within its space. Creates a copy of the page and all its child pages. The duplicated page title is prefixed with "Copy of".';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to duplicate'),
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
  ): Promise<{
    id: string;
    title: string | null;
    slugId: string;
    spaceId: string;
    childPageIds: string[];
  }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to duplicate pages in this space',
      );
    }

    const result = await this.pageService.duplicatePage(
      page,
      undefined,
      ctx.user as any,
    );

    return {
      id: (result as any).id ?? args.pageId,
      title: (result as any).title ?? null,
      slugId: (result as any).slugId ?? '',
      spaceId: page.spaceId,
      childPageIds: (result as any).childPageIds ?? [],
    };
  }
}
