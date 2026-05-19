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
export class MovePageToSpaceTool implements ChatTool, OnModuleInit {
  readonly name = 'move_page_to_space';
  readonly description =
    'Move an existing ConqrHub page and its children to a different space. Requires edit permission on the source page and write permission on the target space.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to move'),
    targetSpaceId: z.string().describe('The UUID of the target space'),
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
    args: { pageId: string; targetSpaceId: string },
    ctx: ChatToolContext,
  ): Promise<{
    success: true;
    pageId: string;
    targetSpaceId: string;
    childPageIds: string[];
  }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const sourceAbility = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (sourceAbility.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to move this page',
      );
    }

    const targetAbility = await this.spaceAbility.createForUser(ctx.user, args.targetSpaceId);
    if (targetAbility.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to create pages in the target space',
      );
    }

    const result = await this.pageService.movePageToSpace(
      page,
      args.targetSpaceId,
      ctx.user.id,
    );

    return {
      success: true,
      pageId: args.pageId,
      targetSpaceId: args.targetSpaceId,
      childPageIds: (result as any).childPageIds ?? [],
    };
  }
}
