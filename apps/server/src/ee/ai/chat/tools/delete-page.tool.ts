import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageAccessService } from '../../../../core/page/page-access/page-access.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class DeletePageTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_page';
  readonly description =
    'Move a ConqrHub page (and its child pages) to the trash. Only use when the user explicitly asks to delete a page. Trashed pages can be restored from the trash UI for 30 days.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to delete'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{ success: true; pageId: string; trashed: true }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    await this.pageAccess.validateCanEdit(page, ctx.user);
    await this.pageService.removePage(args.pageId, ctx.user.id, ctx.workspaceId);

    return { success: true, pageId: args.pageId, trashed: true };
  }
}
