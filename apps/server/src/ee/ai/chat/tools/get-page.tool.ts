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
import { jsonToText } from '../../../../collaboration/collaboration.util';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

const MAX_CONTENT_CHARS = 4000;

@Injectable()
export class GetPageTool implements ChatTool, OnModuleInit {
  readonly name = 'get_page';
  readonly description =
    'Get the full content of a specific ConqrHub page by its ID. Use this after search_pages to read the actual page text.';
  readonly parameters = z.object({
    pageId: z
      .string()
      .describe(
        'The UUID of the page (returned by search_pages or list_space_pages)',
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
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    title: string | null;
    slugId: string;
    spaceId: string;
    content: string;
    updatedAt: Date;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    const raw = page.content as any;
    const text = raw ? jsonToText(raw).slice(0, MAX_CONTENT_CHARS) : '';

    return {
      id: page.id,
      title: page.title ?? null,
      slugId: page.slugId,
      spaceId: page.spaceId,
      content: text,
      updatedAt: page.updatedAt,
    };
  }
}
