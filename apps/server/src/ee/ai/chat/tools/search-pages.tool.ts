import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { SearchService } from '../../../../core/search/search.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class SearchPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'search_pages';
  readonly description =
    'Search the ConqrHub workspace for pages that match a query. Returns a ranked list of matching pages with their titles and a short excerpt.';
  readonly parameters = z.object({
    query: z.string().describe('The search query'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe('Maximum number of results'),
  });

  constructor(
    private readonly searchService: SearchService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { query: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null; slugId: string; excerpt: string }[]> {
    const { items } = await this.searchService.searchPage(
      { query: args.query, limit: args.limit ?? 5 } as any,
      { userId: ctx.user.id, workspaceId: ctx.workspaceId },
    );
    return items.map((item: any) => ({
      id: item.id,
      title: item.title,
      slugId: item.slugId ?? '',
      excerpt: item.highlight ?? '',
    }));
  }
}
