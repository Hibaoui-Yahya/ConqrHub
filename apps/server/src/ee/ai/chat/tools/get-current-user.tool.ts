import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class GetCurrentUserTool implements ChatTool, OnModuleInit {
  readonly name = 'get_current_user';
  readonly description =
    'Get details of the currently authenticated user (the user represented by the API key). Returns name, email, role, and workspace info.';
  readonly parameters = z.object({});

  constructor(
    private readonly userRepo: UserRepo,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    _args: Record<string, never>,
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    workspaceId: string;
  }> {
    const user = await this.userRepo.findById(ctx.user.id, ctx.workspaceId);

    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      role: (user as any).role ?? null,
      workspaceId: ctx.workspaceId,
    };
  }
}
