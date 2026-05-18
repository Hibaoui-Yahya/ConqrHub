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
export class UpdatePageContentTool implements ChatTool, OnModuleInit {
  readonly name = 'update_page_content';
  readonly description =
    'Update the content of a ConqrHub page using markdown. Can replace the entire content, append to it, or prepend to it. Only use when the user explicitly asks to edit, append to, or replace a page\'s content.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to update'),
    content: z.string().describe('The new content in markdown format'),
    operation: z
      .enum(['replace', 'append', 'prepend'])
      .optional()
      .default('replace')
      .describe('How to apply the content: replace all, append at end, or prepend at start'),
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
    args: { pageId: string; content: string; operation?: 'replace' | 'append' | 'prepend' },
    ctx: ChatToolContext,
  ): Promise<{ success: true; pageId: string }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have permission to edit this page');
    }

    await this.pageService.updatePageContent(
      args.pageId,
      args.content,
      (args.operation ?? 'replace') as any,
      'markdown',
      ctx.user,
    );

    return { success: true, pageId: args.pageId };
  }
}
