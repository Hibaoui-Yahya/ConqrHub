import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListRecentPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_recent_pages';
  readonly description =
    'List pages recently edited across all spaces the user has access to. Useful for finding what was recently worked on.';
  readonly parameters = z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe('Maximum number of pages to return'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { limit?: number },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null; slugId: string; spaceId: string; updatedAt: string }[]> {
    const { items } = await this.pageService.getRecentPages(ctx.user.id, {
      limit: args.limit ?? 10,
    } as any);
    return items.map((p) => ({
      id: p.id,
      title: p.title ?? null,
      slugId: p.slugId,
      spaceId: p.spaceId,
      updatedAt: p.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    }));
  }
}
