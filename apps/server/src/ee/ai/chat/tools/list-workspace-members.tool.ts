import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { WorkspaceService } from '../../../../core/workspace/services/workspace.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListWorkspaceMembersTool implements ChatTool, OnModuleInit {
  readonly name = 'list_workspace_members';
  readonly description =
    'List members of the current workspace. Returns user details including role. Useful for understanding who has access to the workspace.';
  readonly parameters = z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of members to return'),
  });

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { limit?: number },
    ctx: ChatToolContext,
  ): Promise<
    {
      id: string;
      name: string | null;
      email: string;
      role: string;
      avatarUrl: string | null;
    }[]
  > {
    const { items } = await this.workspaceService.getWorkspaceUsers(
      ctx.workspaceId,
      { limit: args.limit ?? 20 } as any,
    );

    return items.map((u: any) => ({
      id: u.id,
      name: u.name ?? null,
      email: u.email,
      role: u.role ?? u.workspaceRole ?? 'member',
      avatarUrl: u.avatarUrl ?? null,
    }));
  }
}
