import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { SpaceService } from '../../../../core/space/services/space.service';
import WorkspaceAbilityFactory from '../../../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../../../core/casl/interfaces/workspace-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class CreateSpaceTool implements ChatTool, OnModuleInit {
  readonly name = 'create_space';
  readonly description =
    'Create a new ConqrHub space. Requires admin or space-create permission. The slug is a short unique identifier for the space URL.';
  readonly parameters = z.object({
    name: z.string().min(2).max(100).describe('The name of the new space'),
    slug: z
      .string()
      .min(2)
      .max(100)
      .describe('A short unique identifier for the space URL (alphanumeric)'),
    description: z
      .string()
      .optional()
      .describe('Optional description for the space'),
  });

  constructor(
    private readonly spaceService: SpaceService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { name: string; slug: string; description?: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: string;
  }> {
    const ability = this.workspaceAbility.createForUser(
      ctx.user,
      { id: ctx.workspaceId } as any,
    );
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space)
    ) {
      throw new ForbiddenException(
        'You do not have permission to create spaces',
      );
    }

    const space = await this.spaceService.createSpace(
      ctx.user as any,
      ctx.workspaceId,
      {
        name: args.name,
        slug: args.slug,
        description: args.description,
      } as any,
    );

    return {
      id: space.id,
      name: space.name ?? 'Untitled',
      slug: space.slug,
      description: (space as any).description ?? null,
      createdAt: space.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
