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
export class CopyPageToSpaceTool implements ChatTool, OnModuleInit {
  readonly name = 'copy_page_to_space';
  readonly description =
    'Copy an existing ConqrHub page and its children to a different space. Keeps the original page intact. Requires read permission on the source page and write permission on the target space.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to copy'),
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
    id: string;
    title: string | null;
    slugId: string;
    spaceId: string;
    childPageIds: string[];
  }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const sourceAbility = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (sourceAbility.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have read access to the source page',
      );
    }

    const targetAbility = await this.spaceAbility.createForUser(ctx.user, args.targetSpaceId);
    if (targetAbility.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to create pages in the target space',
      );
    }

    const result = await this.pageService.duplicatePage(
      page,
      args.targetSpaceId,
      ctx.user as any,
    );

    return {
      id: (result as any).id ?? args.pageId,
      title: (result as any).title ?? null,
      slugId: (result as any).slugId ?? '',
      spaceId: args.targetSpaceId,
      childPageIds: (result as any).childPageIds ?? [],
    };
  }
}
