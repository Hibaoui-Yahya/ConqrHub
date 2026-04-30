import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { SpaceMemberService } from '../../../../core/space/services/space-member.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListSpacesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_spaces';
  readonly description =
    'List all wiki spaces the current user is a member of. Use this to discover available spaces and their IDs before listing pages.';
  readonly parameters = z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of spaces to return'),
  });

  constructor(
    private readonly spaceMemberService: SpaceMemberService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { limit?: number },
    ctx: ChatToolContext,
  ): Promise<{ id: string; name: string; slug: string; description: string | null }[]> {
    const { items } = await this.spaceMemberService.getUserSpaces(ctx.user.id, {
      limit: args.limit ?? 20,
    } as any);
    return items.map((s: any) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description ?? null,
    }));
  }
}
