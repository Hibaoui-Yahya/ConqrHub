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
export class UpdatePageTool implements ChatTool, OnModuleInit {
  readonly name = 'update_page';
  readonly description =
    'Update an existing page\'s title and/or content in markdown format. Can update title, content, or both at once. Only use when the user explicitly asks to edit a page.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to update'),
    title: z.string().optional().describe('The new title for the page'),
    content: z.string().optional().describe('The new content in markdown format'),
    contentOperation: z
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
    args: {
      pageId: string;
      title?: string;
      content?: string;
      contentOperation?: 'replace' | 'append' | 'prepend';
    },
    ctx: ChatToolContext,
  ): Promise<{ success: true; pageId: string; title?: string | null }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have permission to edit this page');
    }

    let updatedTitle: string | null | undefined;

    if (args.title) {
      const updated = await this.pageService.update(
        page,
        { pageId: args.pageId, title: args.title } as any,
        ctx.user,
      );
      updatedTitle = updated.title ?? null;
    }

    if (args.content !== undefined) {
      await this.pageService.updatePageContent(
        args.pageId,
        args.content,
        (args.contentOperation ?? 'replace') as any,
        'markdown',
        ctx.user,
      );
    }

    return { success: true, pageId: args.pageId, title: updatedTitle };
  }
}
